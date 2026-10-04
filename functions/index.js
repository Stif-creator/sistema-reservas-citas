import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { executeBooking } from './booking.js'
import { BookingError } from './bookingError.js'

initializeApp()
export const booking = onCall({ region: 'us-central1', maxInstances: 3, timeoutSeconds: 60 }, async request => {
  try { return await executeBooking(getFirestore(), request.auth?.uid, request.data) }
  catch (error) {
    if (error instanceof BookingError) throw new HttpsError(error.code, error.message)
    console.error('Booking operation failed', error.code || 'unknown')
    throw new HttpsError('internal', 'No se pudo completar la operación. Vuelve a intentarlo.')
  }
})
