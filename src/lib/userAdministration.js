import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, setPersistence, inMemoryPersistence, createUserWithEmailAndPassword, deleteUser, signOut } from 'firebase/auth'
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { db, firebaseConfig } from '../firebase/config'

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
