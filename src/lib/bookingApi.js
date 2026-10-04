import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '../firebase/config'

export const bookingEnabled = import.meta.env.VITE_BOOKING_ENABLED === 'true'
const endpoint = httpsCallable(functions, 'booking', { timeout: 60000 })
const provider = import.meta.env.VITE_BOOKING_PROVIDER || 'http'
const apiUrl = (import.meta.env.VITE_BOOKING_API_URL || '').replace(/\/+$/, '')

async function httpRequest(data) {
  if (!apiUrl) throw new Error('Falta configurar la dirección del servidor de reservas.')
  if (!auth.currentUser) {
    const error = new Error('Inicia sesión para continuar.')
    error.code = 'functions/unauthenticated'
    throw error
  }
  const token = await auth.currentUser.getIdToken()
  const controller = new AbortController()
  // El servidor gratuito puede tardar alrededor de un minuto en despertar.
  const timeout = setTimeout(() => controller.abort(), 120000)
  try {
    const response = await fetch(`${apiUrl}/booking`, { method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const payload = await response.json()
    if (!response.ok || payload.error) {
      const error = new Error(payload.error?.message || 'El servidor no está disponible.')
      error.code = `functions/${payload.error?.code || 'unavailable'}`
      throw error
    }
    if (!Object.hasOwn(payload, 'data')) throw new Error('Respuesta inválida del servidor.')
    return payload.data
  } catch (error) {
    if (error.code?.startsWith('functions/')) throw error
    const failure = new Error('No se recibió la respuesta del servidor.')
    failure.code = controller.signal.aborted ? 'functions/deadline-exceeded' : 'functions/unavailable'
    throw failure
  } finally { clearTimeout(timeout) }
}

export async function bookingRequest(data) {
  if (!bookingEnabled) throw new Error('Las reservas en línea aún no están disponibles.')
  try {
    if (provider === 'http') return await httpRequest(data)
    if (provider === 'functions') return (await endpoint(data)).data
    throw new Error('Proveedor de reservas desconocido.')
  }
  catch (error) {
    if (['functions/internal', 'functions/unavailable', 'functions/deadline-exceeded'].includes(error.code)) {
      const failure = new Error('No pudimos confirmar la respuesta del servidor. Reintenta la misma operación para comprobarla sin duplicarla.')
      failure.code = error.code
      throw failure
    }
    throw error
  }
}
