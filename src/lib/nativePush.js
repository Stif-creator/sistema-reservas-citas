import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { bookingRequest } from './bookingApi'

const keyFor = uid => `citaspro.pushToken.${uid}`

export async function unregisterNativePushToken(uid) {
  if (Capacitor.getPlatform() !== 'android' || !uid) return
  let token
  try { token = localStorage.getItem(keyFor(uid)) } catch { return }
  if (!token) return
  try {
    await bookingRequest({ action: 'pushTokenUnregister', token })
    localStorage.removeItem(keyFor(uid))
  } catch (error) {
    try { await PushNotifications.unregister(); localStorage.removeItem(keyFor(uid)) }
    catch { console.warn('No se pudo retirar el registro local de notificaciones.', error.code || error.name || '') }
  }
}

export function saveNativePushToken(uid, token) {
  try { localStorage.setItem(keyFor(uid), token) } catch {}
}
