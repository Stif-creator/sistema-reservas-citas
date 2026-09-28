import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, setPersistence, inMemoryPersistence, createUserWithEmailAndPassword, deleteUser, signOut } from 'firebase/auth'
import { doc, writeBatch, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db, firebaseConfig } from '../firebase/config'
import { findProfileId } from './profiles'

// A separate, memory-only Auth instance keeps the administrator signed in.
export async function createProfessionalAccount(businessId, form) {
  const app = initializeApp(firebaseConfig, `professional-${crypto.randomUUID()}`)
  const secondaryAuth = getAuth(app)
  let account
  let saved = false
  try {
    if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
      connectAuthEmulator(secondaryAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
    }
    await setPersistence(secondaryAuth, inMemoryPersistence)
    account = (await createUserWithEmailAndPassword(secondaryAuth, form.email.trim(), form.password)).user
    const uid = account.uid
    const id = `${businessId}_${uid}`
    const now = serverTimestamp()
    const firstName = form.firstName.trim()
    const lastName = form.lastName.trim()
    const email = form.email.trim()
    const phone = form.phone.trim()
    const batch = writeBatch(db)
    batch.set(doc(db, 'users', uid), {
      id: uid, auth_uid: uid, firstName, lastName, email, phone,
      status: 'active', globalRole: 'user', businessIds: [businessId],
      onboardingComplete: true, emailVerified: false, photoUrl: null,
      createdAt: now, updatedAt: now,
    })
    batch.set(doc(db, 'memberships', id), {
      userId: uid, businessId, role: 'professional', status: 'active', permissions: {}, createdAt: now,
    })
    batch.set(doc(db, 'professionals', id), {
      id, userId: uid, businessId, displayName: `${firstName} ${lastName}`, email, phone,
      isActive: true, serviceIds: [], createdAt: now, updatedAt: now,
    })
    await batch.commit()
    saved = true
    return id
  } catch (error) {
    if (account && !saved) {
      try { await deleteUser(account) } catch {
        throw new Error('No se pudo completar el perfil ni eliminar la cuenta creada. Conserva el correo y contacta al responsable del sistema para recuperarla.')
      }
    }
    throw error
  } finally {
    await signOut(secondaryAuth).catch(() => {})
    await deleteApp(app).catch(() => {})
  }
}

export async function changeMembership(businessId, userId, role, status) {
  if (!['admin', 'professional', 'client'].includes(role) || !['active', 'inactive'].includes(status)) {
    throw new Error('Rol o estado inválido.')
  }
  const id = `${businessId}_${userId}`
  const [professionalId, clientId] = await Promise.all([
    findProfileId(db, 'professionals', businessId, userId),
    findProfileId(db, 'clients', businessId, userId),
  ])
  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'users', userId)
    const professionalRef = doc(db, 'professionals', professionalId)
    const clientRef = doc(db, 'clients', clientId)
    const memberRef = doc(db, 'memberships', id)
    const [user, professional, client, member] = await Promise.all([
      transaction.get(userRef), transaction.get(professionalRef), transaction.get(clientRef), transaction.get(memberRef),
    ])
    if (!user.exists() || !member.exists()) throw new Error('Usuario no encontrado.')
    const data = user.data()
    const now = serverTimestamp()
    transaction.update(memberRef, {
      role, status,
      ...(professional.exists() || role === 'professional' ? { professionalId } : {}),
    })
    if (professional.exists()) {
      transaction.update(professionalRef, { isActive: role === 'professional' && status === 'active', updatedAt: now })
    } else if (role === 'professional') {
      transaction.set(professionalRef, {
        id: professionalId, businessId, userId, displayName: `${data.firstName} ${data.lastName}`,
        email: data.email || '', phone: data.phone || '', serviceIds: [],
        isActive: status === 'active', createdAt: now, updatedAt: now,
      })
    }
    if (role === 'client' && !client.exists()) {
      transaction.set(clientRef, {
        id: clientId, businessId, userId, firstName: data.firstName, lastName: data.lastName,
        email: data.email || '', phone: data.phone || '', status: 'active',
        createdAt: now, updatedAt: now,
      })
    }
  })
}
