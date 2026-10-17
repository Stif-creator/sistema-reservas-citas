import { getAuth } from 'firebase-admin/auth'
import { createHash } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { BookingError } from './bookingError.js'

const fail = (code, message) => { throw new BookingError(code, message) }
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value)

export async function executePlatform(db, uid, input) {
  if (!uid) fail('unauthenticated', 'Inicia sesión.')
  if (!['platformCreate', 'platformStatus'].includes(input.action)) fail('invalid-argument', 'Acción de plataforma inválida.')
  if (!validId(input.businessId)) fail('invalid-argument', 'Identificador de negocio inválido.')
  let newOwner
  if (input.action === 'platformCreate' && input.createAccount === true) {
    const actor = (await db.doc(`users/${uid}`).get()).data()
    if (actor?.status !== 'active' || actor.globalRole !== 'superadmin') fail('permission-denied', 'Solo el superadministrador puede crear administradores.')
    const email = String(input.email || '').trim().toLowerCase()
    const firstName = String(input.firstName || '').trim(), lastName = String(input.lastName || '').trim()
    if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128 || !input.name?.trim() || input.name.length > 120 || !/^#[0-9a-f]{6}$/i.test(input.primaryColor) || !/^#[0-9a-f]{6}$/i.test(input.secondaryColor)) fail('invalid-argument', 'Completa los datos del administrador y del negocio; la clave inicial requiere al menos 12 caracteres.')
    const accountId = `tenant-${createHash('sha256').update(`${uid}:${input.businessId}`).digest('hex')}`
    try {
      await getAuth().createUser({ uid: accountId, email, password: input.password, displayName: `${firstName} ${lastName}` })
    } catch (error) {
      if (error.code !== 'auth/uid-already-exists' && error.code !== 'auth/email-already-exists') throw error
      const previous = await getAuth().getUserByEmail(email)
      if (previous.uid !== accountId) fail('already-exists', 'Ese correo ya tiene cuenta. Selecciona vincular cuenta existente.')
    }
    newOwner = { id: accountId, ref: db.doc(`users/${accountId}`), profile: { firstName, lastName, email, status: 'active', businessIds: [] } }
  }
  return db.runTransaction(async tx => {
    const actor = (await tx.get(db.doc(`users/${uid}`))).data()
    if (actor?.status !== 'active' || actor.globalRole !== 'superadmin') fail('permission-denied', 'Solo el superadministrador puede gestionar negocios.')
    const ref = db.doc(`businesses/${input.businessId}`)
    const existing = await tx.get(ref)
    const stamp = FieldValue.serverTimestamp()
    if (input.action === 'platformCreate') {
      const name = typeof input.name === 'string' ? input.name.trim() : ''
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
      if (!name || name.length > 120 || !email || !/^#[0-9a-f]{6}$/i.test(input.primaryColor) || !/^#[0-9a-f]{6}$/i.test(input.secondaryColor)) fail('invalid-argument', 'Completa nombre, correo y colores válidos.')
      if (existing.exists) {
        if (existing.data().createdByUserId === uid && existing.data().administratorEmail === email && existing.data().name === name && existing.data().appearance.primaryColor === input.primaryColor && existing.data().appearance.secondaryColor === input.secondaryColor) return { ok: true, businessId: ref.id }
        fail('already-exists', 'Este identificador ya está en uso.')
      }
      const candidates = newOwner ? null : await tx.get(db.collection('users').where('email', '==', email).limit(2))
      if (!newOwner && candidates.size !== 1) fail('failed-precondition', 'El administrador debe tener una cuenta registrada con ese correo.')
      const owner = newOwner || candidates.docs[0], profile = newOwner ? newOwner.profile : owner.data()
      if (profile.status !== 'active' || profile.onboardingComplete === false || (profile.businessIds || []).length >= 20) fail('failed-precondition', 'La cuenta debe estar activa y tener menos de 20 negocios.')
      tx.create(ref, { id: ref.id, name, ownerUserId: owner.id, administratorEmail: email, administratorName: `${profile.firstName || ''} ${profile.lastName || ''}`.trim(), createdByUserId: uid,
        appearance: { primaryColor: input.primaryColor, secondaryColor: input.secondaryColor }, status: 'active',
        settings: { publicPageEnabled: false, timezone: 'America/La_Paz', currencyCode: 'BOB', bookingIntervalMinutes: 15, minAdvanceMinutes: 60, maxAdvanceDays: 90, cancellationLimitHours: 24, autoConfirmBookings: false },
        createdAt: stamp, updatedAt: stamp })
      tx.create(db.doc(`memberships/${ref.id}_${owner.id}`), { businessId: ref.id, userId: owner.id, role: 'admin', status: 'active', permissions: {}, firstName: profile.firstName || '', lastName: profile.lastName || '', email, createdAt: stamp })
      if (newOwner) tx.create(owner.ref, { ...profile, id: owner.id, auth_uid: owner.id, globalRole: 'user', onboardingComplete: true, mustChangePassword: true, createdAt: stamp })
      tx.update(owner.ref, { businessIds: FieldValue.arrayUnion(ref.id), defaultBusinessId: ref.id, updatedAt: stamp })
    } else {
      if (!existing.exists) fail('not-found', 'El negocio no existe.')
      const business = existing.data()
      if (!['active', 'inactive', 'deleted'].includes(input.status)) fail('invalid-argument', 'Estado inválido.')
      if (input.status === 'deleted') {
        if (business.status === 'active') fail('failed-precondition', 'Desactiva el negocio antes de eliminarlo.')
        if (input.confirmName !== business.name) fail('invalid-argument', 'Escribe el nombre exacto del negocio para confirmar.')
        // Logical deletion preserves reservations, identities and audit history.
        const pending = await tx.get(db.collection('reservations').where('businessId', '==', ref.id).limit(2001))
        if (pending.size > 2000) fail('failed-precondition', 'Este negocio requiere una revisión de su historial antes de archivarlo. Puedes mantenerlo desactivado.')
        if (pending.docs.some(d => ['pending', 'confirmed'].includes(d.data().status))) fail('failed-precondition', 'Resuelve las reservas pendientes o confirmadas antes de eliminar el negocio.')
      }
      tx.update(ref, { status: input.status, updatedAt: stamp, archivedAt: input.status === 'deleted' ? stamp : null })
    }
    tx.set(db.collection('auditLogs').doc(), { businessId: ref.id, actorUserId: uid, action: input.action, status: input.status || 'active', createdAt: stamp })
    return { ok: true, businessId: ref.id }
  })
}
