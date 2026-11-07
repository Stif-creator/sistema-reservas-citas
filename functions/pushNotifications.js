import { createHash } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { BookingError } from './bookingError.js'

const fail = (code, message) => { throw new BookingError(code, message) }
const tokenHash = token => createHash('sha256').update(token).digest('hex')

export async function registerPushToken(db, uid, input) {
  if (!uid) fail('unauthenticated', 'Inicia sesión para continuar.')
  if (typeof input.token !== 'string' || input.token.length < 20 || input.token.length > 4096)
    fail('invalid-argument', 'El token de notificaciones no es válido.')

  const userRef = db.doc(`users/${uid}`)
  const user = await userRef.get()
  if (!user.exists || user.data().status !== 'active') fail('permission-denied', 'Tu cuenta no está activa.')

  const ref = db.doc(`pushTokens/${tokenHash(input.token)}`)
  return db.runTransaction(async tx => {
    const [existing, owned] = await Promise.all([
      tx.get(ref), tx.get(db.collection('pushTokens').where('userId', '==', uid).limit(11)),
    ])
    if ((!existing.exists || existing.data().userId !== uid) && owned.size >= 10)
      fail('resource-exhausted', 'Esta cuenta ya tiene registrados diez dispositivos.')
    tx.set(ref, { userId: uid, token: input.token, platform: 'android', updatedAt: Timestamp.now() })
    return { ok: true }
  })
}

export async function unregisterPushToken(db, uid, input) {
  if (!uid) fail('unauthenticated', 'Inicia sesión para continuar.')
  if (typeof input.token !== 'string' || input.token.length < 20 || input.token.length > 4096)
    fail('invalid-argument', 'El token de notificaciones no es válido.')
  const ref = db.doc(`pushTokens/${tokenHash(input.token)}`)
  return db.runTransaction(async tx => {
    const existing = await tx.get(ref)
    if (existing.exists && existing.data().userId === uid) tx.delete(ref)
    return { ok: true }
  })
}

export async function sendAppointmentPush(db, notice) {
  const recipients = [...new Set(notice.recipients.filter(Boolean))]
  for (const userId of recipients) {
    try {
      const [user, membership, tokenRows] = await Promise.all([
        db.doc(`users/${userId}`).get(),
        db.doc(`memberships/${notice.businessId}_${userId}`).get(),
        db.collection('pushTokens').where('userId', '==', userId).limit(10).get(),
      ])
      if (user.data()?.status !== 'active' || membership.data()?.status !== 'active') continue
      const tokens = tokenRows.docs.map(row => ({ ref: row.ref, token: row.data().token }))
        .filter(row => typeof row.token === 'string' && row.token.length >= 20)
      if (!tokens.length) continue

      const role = membership.data()?.role
      const path = role === 'client'
        ? `/cliente/reservas/${notice.reservationId}`
        : `/reservas/${notice.reservationId}`
      const response = await getMessaging().sendEachForMulticast({
        tokens: tokens.map(item => item.token),
        notification: { title: notice.title, body: notice.message },
        data: { businessId: notice.businessId, reservationId: notice.reservationId, path },
        android: {
          priority: 'high',
          notification: { channelId: 'citaspro_appointments', sound: 'default', color: '#4F46E5', tag: notice.reservationId },
        },
      })

      const invalid = response.responses.flatMap((item, index) =>
        !item.success && ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(item.error?.code)
          ? [tokens[index].ref.delete()]
          : [])
      await Promise.all(invalid)
      if (response.failureCount) console.error('FCM appointment push had delivery failures', response.failureCount)
    } catch (error) {
      console.error('FCM appointment push failed', error.code || error.name || 'unknown')
    }
  }
}
