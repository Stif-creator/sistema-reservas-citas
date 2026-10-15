// Run only on a trusted computer with Firebase Admin credentials, never in the browser.
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const [email, operation] = process.argv.slice(2)
if (!email || !['--grant', '--revoke'].includes(operation) || !process.env.GCLOUD_PROJECT) {
  throw new Error('Uso: node --env-file=.env.server functions/grant-superadmin.js correo --grant|--revoke. Requiere GCLOUD_PROJECT y credenciales administrativas.')
}
initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT })
const account = await getAuth().getUserByEmail(email)
if (account.disabled) throw new Error('La cuenta está deshabilitada.')
const db = getFirestore()
await db.runTransaction(async tx => {
  const ref = db.doc(`users/${account.uid}`)
  const snapshot = await tx.get(ref)
  const user = snapshot.data()
  if (!user || user.status !== 'active' || !user.businessIds?.[0]) throw new Error('Se requiere una cuenta activa con negocio asociado.')
  tx.update(ref, { globalRole: operation === '--grant' ? 'superadmin' : 'user', updatedAt: FieldValue.serverTimestamp() })
  tx.set(db.collection('auditLogs').doc(), { businessId: user.businessIds[0], targetUserId: account.uid, action: operation === '--grant' ? 'superadmin_granted' : 'superadmin_revoked', createdAt: FieldValue.serverTimestamp(), source: 'trusted-admin-cli' })
})
console.log('Permiso actualizado. Cierra sesión y vuelve a ingresar.')
await db.terminate()
