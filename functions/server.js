import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { executeBooking } from './booking.js'
import { createBookingServer } from './http.js'

const projectId = process.env.GCLOUD_PROJECT
const emulator = process.env.BOOKING_USE_EMULATORS === 'true'
if (!projectId) throw new Error('Configura GCLOUD_PROJECT.')
if (emulator && (process.env.NODE_ENV === 'production' || !projectId.startsWith('demo-') ||
  !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST))
  throw new Error('Los emuladores requieren un proyecto demo y ambos hosts, fuera de producción.')
if (!emulator && (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST))
  throw new Error('No se permiten hosts de emuladores en el servidor real.')
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)
if (!allowedOrigins.length || allowedOrigins.some(origin => new URL(origin).origin !== origin))
  throw new Error('Configura ALLOWED_ORIGINS con orígenes completos separados por comas, sin barra final.')
initializeApp(emulator ? { projectId } : { projectId, credential: applicationDefault() })
const server = createBookingServer({ allowedOrigins,
  verifyToken: token => getAuth().verifyIdToken(token, true),
  execute: (uid, data) => executeBooking(getFirestore(), uid, data),
})
server.listen(Number(process.env.PORT || 3001), '0.0.0.0', () => console.log('Booking API lista'))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 10000).unref()
})
