import { sendBookingRequest, bookingFailure } from './bookingTransport'
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '../firebase/config'

export const bookingEnabled = import.meta.env.VITE_BOOKING_ENABLED === 'true'
const endpoint = httpsCallable(functions, 'booking', { timeout: 60000 })
const provider = import.meta.env.VITE_BOOKING_PROVIDER || 'http'
const apiUrl = (import.meta.env.VITE_BOOKING_API_URL || '').replace(/\/+$/, '')

async function httpRequest(data) {
  if (!apiUrl) throw new Error('Falta configurar la dirección del servidor de reservas.')
  if (!auth.currentUser && !['publicOptions', 'publicAvailability'].includes(data.action)) {
    const error = new Error('Inicia sesión para continuar.')
    error.code = 'functions/unauthenticated'
    throw error
  }
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null
  return sendBookingRequest(data, { base: apiUrl, token })
}

export async function bookingRequest(data) {
  if (!bookingEnabled) throw new Error('Las reservas en línea aún no están disponibles.')
  try {
    if (provider === 'http') return await httpRequest(data)
    if (provider === 'functions') return (await endpoint(data)).data
    throw new Error('Proveedor de reservas desconocido.')
  }
  catch (error) { throw bookingFailure(error, data.action) }
}
