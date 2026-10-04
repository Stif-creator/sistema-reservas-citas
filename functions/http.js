import { createServer } from 'node:http'
import { BookingError } from './bookingError.js'

const statusCodes = { 'invalid-argument': 400, unauthenticated: 401, 'permission-denied': 403,
  'not-found': 404, 'already-exists': 409, 'failed-precondition': 409, aborted: 409,
  'resource-exhausted': 429, unavailable: 503, 'deadline-exceeded': 504 }

export function createBookingServer({ allowedOrigins, verifyToken, execute }) {
  const origins = new Set(allowedOrigins)
  return createServer({ requestTimeout: 30000, headersTimeout: 15000 }, async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(body))
    }
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Vary', 'Origin')
    if (req.url === '/health' && req.method === 'GET') return send(200, { ok: true })
    if (req.url !== '/booking') return send(404, { error: { code: 'not-found', message: 'Ruta no encontrada.' } })
    if (req.headers.origin && !origins.has(req.headers.origin)) return send(403, { error: { code: 'permission-denied', message: 'Origen no permitido.' } })
    if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      res.writeHead(204); return res.end()
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); return send(405, { error: { code: 'invalid-argument', message: 'Usa POST.' } }) }
    try {
      const token = /^Bearer (\S+)$/i.exec(req.headers.authorization || '')?.[1]
      if (!token) throw new BookingError('unauthenticated', 'Inicia sesión para continuar.')
      let identity
      try { identity = await verifyToken(token) }
      catch (error) {
        if (['auth/id-token-expired', 'auth/id-token-revoked', 'auth/argument-error', 'auth/invalid-id-token', 'auth/user-disabled', 'auth/user-not-found'].includes(error.code))
          throw new BookingError('unauthenticated', 'Tu sesión no es válida. Vuelve a iniciar sesión.')
        throw error
      }
      if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new BookingError('invalid-argument', 'Se requiere JSON.')
      const chunks = []; let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > 16384) throw new BookingError('invalid-argument', 'La solicitud es demasiado grande.')
        chunks.push(chunk)
      }
      let data
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
      catch { throw new BookingError('invalid-argument', 'Solicitud JSON inválida.') }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new BookingError('invalid-argument', 'Solicitud inválida.')
      send(200, { data: await execute(identity.uid, data) })
    } catch (error) {
      const known = error instanceof BookingError
      if (!known) console.error('Booking HTTP failed:', error.code || 'unknown')
      send(known ? statusCodes[error.code] || 500 : 500, { error: {
        code: known ? error.code : 'internal',
        message: known ? error.message : 'No se pudo completar la operación. Vuelve a intentarlo.',
      } })
    }
  })
}
