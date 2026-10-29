import { randomUUID, createHash, timingSafeEqual } from 'node:crypto'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { BookingError } from './bookingError.js'
import { uploadRequestImage } from './images.js'

const fail = (code, message) => { throw new BookingError(code, message) }
const validEmail = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
const validColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const hash = value => createHash('sha256').update(value).digest('hex')
const normalizeSearch = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const searchTokens = values => [...new Set(values.map(normalizeSearch).filter(Boolean).flatMap(value => { const result = []; for (const word of value.split(' ')) for (let length = 1; length <= word.length; length++) result.push(word.slice(0, length)); return result }))].slice(0, 100)

export function validateBusinessRequest(input) {
  const applicant = input.applicant || {}, business = input.business || {}, appearance = input.appearance || {}
  const result = {
    applicant: { firstName: clean(applicant.firstName, 80), lastName: clean(applicant.lastName, 80), email: clean(applicant.email, 254).toLowerCase(), phone: clean(applicant.phone, 30) },
    business: { name: clean(business.name, 120), category: clean(business.category, 80), city: clean(business.city, 100), description: clean(business.description, 500), website: clean(business.website, 240) },
    appearance: { primaryColor: appearance.primaryColor, secondaryColor: appearance.secondaryColor, accentColor: appearance.accentColor, surfaceColor: appearance.surfaceColor },
  }
  if (result.applicant.firstName.length < 1 || result.applicant.lastName.length < 1 || !validEmail(result.applicant.email) || !/^\+?\d{8,15}$/.test(result.applicant.phone)) fail('invalid-argument', 'Revisa los datos del solicitante.')
  if (result.business.name.length < 2 || !result.business.category || !result.business.city || result.business.description.length < 10) fail('invalid-argument', 'Completa los datos obligatorios del negocio.')
  if (result.business.website && !(/^https:\/\//i.test(result.business.website) || /^@[a-z0-9._]{2,40}$/i.test(result.business.website) || /^(instagram|facebook|tiktok|linkedin|x)\.com\/[a-z0-9._/-]{2,200}$/i.test(result.business.website))) fail('invalid-argument', 'Ingresa un enlace https:// o un usuario social como @tucuenta.')
  if (!Object.values(result.appearance).every(validColor)) fail('invalid-argument', 'Selecciona cuatro colores válidos.')
  if (input.termsAccepted !== true) fail('invalid-argument', 'Debes aceptar los términos para enviar la solicitud.')
  if (clean(input.websiteTrap, 200)) fail('invalid-argument', 'No se pudo validar la solicitud.')
  return result
}

async function consumeLimit(db, key, limit) {
  const day = new Date().toISOString().slice(0, 10)
  const ref = db.doc(`businessRequestLimits/${key}`)
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref), data = snap.data()
    const count = data?.day === day ? data.count : 0
    if (count >= limit) fail('resource-exhausted', 'Alcanzaste el límite diario de solicitudes. Inténtalo mañana.')
    tx.set(ref, { day, count: count + 1, updatedAt: FieldValue.serverTimestamp() })
  })
}

export async function submitBusinessRequest(db, input, remoteAddress) {
  const data = validateBusinessRequest(input)
  const ipKey = hash(String(remoteAddress || 'unknown')).slice(0, 40)
  await consumeLimit(db, `ip_${ipKey}`, 5)
  await consumeLimit(db, `email_${hash(data.applicant.email)}`, 1)
  const images = input.images || {}
  const [logo, cover] = await Promise.all([
    images.logo ? uploadRequestImage(images.logo, 'logo') : Promise.resolve(null),
    images.cover ? uploadRequestImage(images.cover, 'cover') : Promise.resolve(null),
  ])
  const id = randomUUID()
  const trackingToken = randomBytes(32).toString('base64url')
  const ref = db.doc(`businessRequests/${id}`)
  const supervisors = await db.collection('users').where('globalRole', '==', 'superadmin').limit(101).get()
  if (supervisors.size > 100) fail('resource-exhausted', 'No se pudo enrutar la solicitud. Inténtalo más tarde.')
  await db.runTransaction(async tx => {
    tx.create(ref, { ...data, searchTokens: searchTokens([`${data.business.name} ${data.business.category} ${data.business.city}`, `${data.applicant.firstName} ${data.applicant.lastName}`]), images: { logo, cover }, trackingTokenHash: hash(trackingToken), status: 'pending', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), reviewHistory: [] })
    tx.create(db.collection('auditLogs').doc(), { businessId: null, businessName: data.business.name, actorUserId: null, action: 'businessRequestSubmitted', requestId: id, createdAt: FieldValue.serverTimestamp() })
    for (const supervisor of supervisors.docs.filter(item => item.data().status === 'active')) {
      const noticeId = `business_request_${id}_${supervisor.id}`
      tx.create(db.doc(`notifications/${noticeId}`), { businessId: null, businessName: data.business.name, recipientUserId: supervisor.id, type: 'platform', event: 'businessRequestSubmitted', title: 'Nueva solicitud de negocio', message: `Se recibió una solicitud para ${data.business.name}.`, read: false, visibleAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() })
    }
  })
  return { ok: true, requestId: id, trackingToken }
}

export async function publicBusinessRequestAction(db, input, remoteAddress) {
  if (input.action === 'businessRequestSubmit') return submitBusinessRequest(db, input, remoteAddress)
  if (!['businessRequestStatus', 'businessRequestProvideInfo'].includes(input.action) || typeof input.requestId !== 'string' || !/^[a-f\d-]{36}$/i.test(input.requestId) || typeof input.trackingToken !== 'string' || input.trackingToken.length !== 43) fail('invalid-argument', 'Enlace de seguimiento inválido.')
  const ref = db.doc(`businessRequests/${input.requestId}`), snap = await ref.get()
  if (!snap.exists) fail('not-found', 'No se encontró la solicitud.')
  const expected = Buffer.from(snap.data().trackingTokenHash, 'hex'), provided = Buffer.from(hash(input.trackingToken), 'hex')
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) fail('permission-denied', 'El enlace de seguimiento no es válido.')
  if (input.action === 'businessRequestStatus') {
    const value = snap.data()
    return { businessName: value.business.name, status: value.status, reviewNote: value.status === 'needs_info' || value.status === 'rejected' ? value.reviewNote || '' : '', updatedAt: value.updatedAt }
  }
  const additionalInfo = clean(input.additionalInfo, 1000)
  if (additionalInfo.length < 5) fail('invalid-argument', 'Escribe la información solicitada (al menos 5 caracteres).')
  await consumeLimit(db, `follow_${hash(input.requestId).slice(0, 40)}`, 3)
  await db.runTransaction(async tx => {
    const fresh = await tx.get(ref)
    if (!fresh.exists || fresh.data().trackingTokenHash !== snap.data().trackingTokenHash) fail('not-found', 'No se encontró la solicitud.')
    if (fresh.data().status === 'pending' && fresh.data().additionalInfo === additionalInfo) return
    if (fresh.data().status !== 'needs_info') fail('failed-precondition', 'La solicitud no necesita información adicional en este momento.')
    tx.update(ref, { status: 'pending', additionalInfo, updatedAt: FieldValue.serverTimestamp(), reviewHistory: [...(fresh.data().reviewHistory || []).slice(-99), { status: 'pending', note: 'El solicitante proporcionó información adicional.', actorUserId: null, at: new Date() }] })
    tx.create(db.collection('auditLogs').doc(), { businessId: null, businessName: fresh.data().business.name, actorUserId: null, action: 'businessRequestInfoProvided', requestId: ref.id, createdAt: FieldValue.serverTimestamp() })
  })
  return { ok: true, status: 'pending' }
}

async function requireSuperadmin(db, uid) {
  if (!uid) fail('unauthenticated', 'Inicia sesión.')
  const user = (await db.doc(`users/${uid}`).get()).data()
  if (user?.status !== 'active' || user.globalRole !== 'superadmin') fail('permission-denied', 'Solo el superadministrador puede gestionar solicitudes.')
}

export async function executeBusinessRequests(db, uid, input, { authService = getAuth() } = {}) {
  await requireSuperadmin(db, uid)
  if (input.action === 'businessRequestsList') {
    const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 50)
    const search = normalizeSearch(clean(input.search, 80))
    let query = db.collection('businessRequests')
    if (search) query = query.where('searchTokens', 'array-contains', search)
    if (['pending', 'in_review', 'needs_info', 'approved', 'rejected'].includes(input.status)) query = query.where('status', '==', input.status)
    query = query.orderBy('createdAt', 'desc').limit(limit + 1)
    if (input.cursor) {
      const cursor = await db.doc(`businessRequests/${input.cursor}`).get()
      if (cursor.exists) query = query.startAfter(cursor)
    }
    const [page, total, pending, inReview, approved, rejected] = await Promise.all([
      query.get(), ...['all', 'pending', 'in_review', 'approved', 'rejected'].map(status => status === 'all' ? db.collection('businessRequests').count().get() : db.collection('businessRequests').where('status', '==', status).count().get()),
    ])
    const docs = page.docs.slice(0, limit)
    return { items: docs.map(doc => { const { trackingTokenHash: _trackingTokenHash, searchTokens: _searchTerms, ...item } = doc.data(); return { id: doc.id, ...item } }), nextCursor: page.docs.length > limit ? docs.at(-1).id : null, counts: { total: total.data().count, pending: pending.data().count, in_review: inReview.data().count, approved: approved.data().count, rejected: rejected.data().count } }
  }
  if (!['businessRequestReview', 'businessRequestApprove'].includes(input.action)) fail('invalid-argument', 'Acción de solicitud inválida.')
  if (typeof input.requestId !== 'string' || !/^[a-f\d-]{36}$/i.test(input.requestId)) fail('invalid-argument', 'Identificador de solicitud inválido.')
  const ref = db.doc(`businessRequests/${input.requestId}`)
  if (input.action === 'businessRequestReview') {
    const nextStatus = input.status
    if (!['in_review', 'needs_info', 'rejected'].includes(nextStatus)) fail('invalid-argument', 'Estado de revisión inválido.')
    const note = clean(input.note, 1000)
    if (nextStatus === 'rejected' && note.length < 5) fail('invalid-argument', 'Indica el motivo del rechazo.')
    if (nextStatus === 'needs_info' && note.length < 5) fail('invalid-argument', 'Indica qué información hace falta.')
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref)
      if (!snap.exists) fail('not-found', 'No se encontró la solicitud.')
      if (!['pending', 'in_review', 'needs_info'].includes(snap.data().status)) fail('failed-precondition', 'La solicitud ya fue resuelta.')
      const event = { status: nextStatus, note, actorUserId: uid, at: new Date() }
      tx.update(ref, { status: nextStatus, reviewNote: note, reviewedBy: uid, updatedAt: FieldValue.serverTimestamp(), reviewHistory: [...(snap.data().reviewHistory || []).slice(-99), event] })
      tx.create(db.collection('auditLogs').doc(), { businessId: null, businessName: snap.data().business.name, actorUserId: uid, action: `businessRequest${nextStatus}`, requestId: ref.id, createdAt: FieldValue.serverTimestamp() })
    })
    return { ok: true, status: nextStatus }
  }
  const request = await ref.get()
  if (!request.exists) fail('not-found', 'No se encontró la solicitud.')
  const values = request.data()
  if (!['pending', 'in_review'].includes(values.status)) fail('failed-precondition', 'Solo se pueden aprobar solicitudes pendientes o en revisión.')
  const businessId = `req_${hash(ref.id).slice(0, 24)}`
  const email = values.applicant.email
  const auth = authService
  let authUser, generatedPassword = null, createdAuthUser = false
  try { authUser = await auth.getUserByEmail(email) }
  catch (error) {
    if (error.code !== 'auth/user-not-found') throw error
    generatedPassword = String(input.initialPassword || '')
    if (generatedPassword.length < 12 || generatedPassword.length > 128) fail('invalid-argument', 'Ese correo no tiene cuenta. Define una contraseña inicial de 12 a 128 caracteres para aprobar.')
    authUser = await auth.createUser({ email, password: generatedPassword, displayName: `${values.applicant.firstName} ${values.applicant.lastName}`.trim() })
    createdAuthUser = true
  }
  const userRef = db.doc(`users/${authUser.uid}`), businessRef = db.doc(`businesses/${businessId}`), memberRef = db.doc(`memberships/${businessId}_${authUser.uid}`)
  try { await db.runTransaction(async tx => {
    const [fresh, existing, userSnap, memberSnap, duplicates] = await Promise.all([tx.get(ref), tx.get(businessRef), tx.get(userRef), tx.get(memberRef), tx.get(db.collection('businesses').where('name', '==', values.business.name).limit(1))])
    if (!fresh.exists || !['pending', 'in_review'].includes(fresh.data().status)) fail('failed-precondition', 'La solicitud ya fue resuelta.')
    if (!existing.exists) {
      if (duplicates.size) fail('already-exists', 'Ya existe un negocio con ese nombre. Revisa los registros antes de aprobar.')
      const profile = userSnap.data() || { id: authUser.uid, auth_uid: authUser.uid, firstName: values.applicant.firstName, lastName: values.applicant.lastName, email, phone: values.applicant.phone, status: 'active', globalRole: 'user', onboardingComplete: true, businessIds: [] }
      if (profile.globalRole === 'superadmin' || profile.status !== 'active') fail('failed-precondition', 'No se puede asignar como administrador una cuenta inactiva o de superadministrador.')
      if ((profile.businessIds || []).length >= 20) fail('failed-precondition', 'La cuenta del administrador ya está vinculada al máximo de negocios permitido.')
      if (!memberSnap.exists) tx.create(memberRef, { businessId, userId: authUser.uid, role: 'admin', status: 'active', permissions: {}, firstName: values.applicant.firstName, lastName: values.applicant.lastName, email, createdAt: FieldValue.serverTimestamp() })
      tx.create(businessRef, { id: businessId, sourceRequestId: ref.id, name: values.business.name, category: values.business.category, ownerUserId: authUser.uid, administratorEmail: email, administratorName: `${values.applicant.firstName} ${values.applicant.lastName}`.trim(), description: values.business.description, appearance: values.appearance, location: { latitude: null, longitude: null, addressLine: '', city: values.business.city, stateRegion: '', countryCode: '' }, contact: { email, phone: values.applicant.phone, whatsapp: '' }, logo: values.images.logo || { url: '' }, cover: values.images.cover || { url: '' }, status: 'active', settings: { publicPageEnabled: false, timezone: 'America/La_Paz', currencyCode: 'BOB', bookingIntervalMinutes: 15, minAdvanceMinutes: 60, maxAdvanceDays: 90, cancellationLimitHours: 24, autoConfirmBookings: false }, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
      if (userSnap.exists) tx.update(userRef, { businessIds: FieldValue.arrayUnion(businessId), defaultBusinessId: businessId, onboardingComplete: true, updatedAt: FieldValue.serverTimestamp() })
      else tx.create(userRef, { ...profile, defaultBusinessId: businessId, businessIds: [businessId], mustChangePassword: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
    }
    tx.update(ref, { status: 'approved', businessId, reviewedBy: uid, updatedAt: FieldValue.serverTimestamp(), reviewHistory: [...(fresh.data().reviewHistory || []).slice(-99), { status: 'approved', actorUserId: uid, at: new Date() }] })
    tx.create(db.collection('auditLogs').doc(), { businessId, businessName: values.business.name, actorUserId: uid, action: 'businessRequestApproved', requestId: ref.id, createdAt: FieldValue.serverTimestamp() })
  }) } catch (error) {
    if (createdAuthUser) await auth.deleteUser(authUser.uid).catch(() => console.error('No se pudo revertir la cuenta auth creada durante la aprobación de solicitud.'))
    throw error
  }
  return { ok: true, status: 'approved', businessId, generatedPassword }
}
