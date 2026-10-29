import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase/config'

export async function updateBusinessWithAudit(businessId, patch) {
  const actorUserId = auth.currentUser?.uid
  if (!actorUserId) throw new Error('Inicia sesión para continuar.')
  return runTransaction(db, async tx => {
    const ref = doc(db, 'businesses', businessId)
    const snapshot = await tx.get(ref)
    if (!snapshot.exists()) throw new Error('Negocio no disponible.')
    const before = snapshot.data()
    const auditRef = doc(collection(db, 'auditLogs'))
    tx.update(ref, { ...patch, lastConfigAuditId: auditRef.id, updatedAt: serverTimestamp() })
    tx.set(auditRef, { businessId, actorUserId, action: 'businessUpdate',
      beforeName: before.name || '', afterName: patch.name ?? before.name ?? '',
      beforeAppearance: before.appearance || {}, afterAppearance: patch.appearance ?? before.appearance ?? {}, createdAt: serverTimestamp() })
  })
}
