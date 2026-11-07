import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { useAuth } from '../context/auth-context'
import { bookingRequest } from '../lib/bookingApi'
import { saveNativePushToken } from '../lib/nativePush'

const PERMISSION_PROMPT_KEY = 'citaspro.push.permissionPrompted'

export default function NativePushNotifications() {
  const { currentUser, membership, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android' || !currentUser || loading || membership?.status !== 'active') return undefined
    let active = true
    const listeners = []

    async function setup() {
      try {
        let permission = await PushNotifications.checkPermissions()
        if (permission.receive !== 'granted') {
          let prompted = false
          try { prompted = localStorage.getItem(PERMISSION_PROMPT_KEY) === 'yes' } catch {}
          if (permission.receive === 'denied' && prompted) return
          try { localStorage.setItem(PERMISSION_PROMPT_KEY, 'yes') } catch {}
          permission = await PushNotifications.requestPermissions()
        }
        if (!active || permission.receive !== 'granted') return

        await PushNotifications.createChannel({
          id: 'citaspro_appointments', name: 'CitasPro', description: 'Avisos sobre tus citas',
          importance: 5, visibility: 1, vibration: true,
        })
        if (!active) return
        listeners.push(await PushNotifications.addListener('registration', async ({ value }) => {
          if (!active || !value) return
          saveNativePushToken(currentUser.uid, value)
          try { await bookingRequest({ action: 'pushTokenRegister', token: value }) }
          catch (error) { console.warn('No se pudo registrar este dispositivo para avisos.', error.code || error.name || '') }
        }))
        listeners.push(await PushNotifications.addListener('registrationError', error => {
          console.warn('No se pudo preparar las notificaciones push.', error.code || error.name || '')
        }))
        listeners.push(await PushNotifications.addListener('pushNotificationActionPerformed', action => {
          const path = action.notification?.data?.path
          if (typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')) navigate(path)
        }))
        await PushNotifications.register()
      } catch (error) {
        console.warn('No se pudo activar notificaciones push en este dispositivo.', error.code || error.name || '')
      }
    }

    void setup()
    return () => {
      active = false
      for (const listener of listeners) void listener.remove()
    }
  }, [currentUser?.uid, loading, membership?.status, navigate])

  return null
}
