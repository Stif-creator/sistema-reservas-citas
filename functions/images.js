import { createHash, randomUUID } from 'node:crypto'
import { BookingError } from './bookingError.js'

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const fail = (code, message) => { throw new BookingError(code, message) }
export function decodeImage(input) {
  if (typeof input !== 'string' || input.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64) fail('invalid-argument', 'La imagen debe pesar como máximo 2 MB.')
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input)
  if (!match) fail('invalid-argument', 'Selecciona una imagen JPG, PNG o WebP.')
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString('base64') !== match[2]) fail('invalid-argument', 'El archivo no es válido o supera 2 MB.')
  const valid = match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  if (!valid) fail('invalid-argument', 'El contenido no corresponde a una imagen válida.')
  return { bytes, mime: `image/${match[1]}` }
}

export async function uploadImage(db, uid, input, { env = process.env, request = fetch } = {}) {
  if (!uid) fail('unauthenticated', 'Inicia sesión para subir imágenes.')
  const { businessId, kind } = input
  if (typeof businessId !== 'string' || !/^[^/\s]{1,200}$/.test(businessId) || !['logo', 'cover', 'service', 'professional', 'profile'].includes(kind)) fail('invalid-argument', 'Destino de imagen inválido.')
  const [user, member, business] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`memberships/${businessId}_${uid}`).get(), db.doc(`businesses/${businessId}`).get()])
  const superadmin = user.data()?.status === 'active' && user.data()?.globalRole === 'superadmin'
  if (superadmin && !['logo', 'cover'].includes(kind)) fail('permission-denied', 'La plataforma solo puede subir el logo y la portada del negocio.')
  if (!business.data() || (!superadmin && business.data()?.status !== 'active')) fail('permission-denied', 'El negocio no está disponible.')
  if (!superadmin && (user.data()?.status !== 'active' || member.data()?.status !== 'active' || business.data()?.status !== 'active' ||
    (kind !== 'profile' && member.data()?.role !== 'admin'))) fail('permission-denied', 'No tienes permiso para subir esta imagen.')
  const { bytes, mime } = decodeImage(input.image)
  const cloud = env.CLOUDINARY_CLOUD_NAME?.trim(), key = env.CLOUDINARY_API_KEY?.trim(), secret = env.CLOUDINARY_API_SECRET?.trim()
  if (!cloud || !/^[a-zA-Z0-9_-]+$/.test(cloud) || !key || !secret) fail('failed-precondition', 'La subida de imágenes aún no está configurada. Contacta al administrador.')
  // Límite compartido entre instancias para proteger la cuota del alojamiento.
  await db.runTransaction(async tx => {
    const ref = db.doc(`imageUploadLimits/${uid}`), snapshot = await tx.get(ref), previous = snapshot.data()
    const now = Date.now(), recent = previous && now - previous.windowStart < 3600000
    const count = recent ? previous.count : 0
    if (count >= 30) fail('resource-exhausted', 'Alcanzaste el límite de 30 imágenes por hora. Inténtalo más tarde.')
    tx.set(ref, { windowStart: recent ? previous.windowStart : now, count: count + 1 })
  })
  const namespace = createHash('sha256').update(`${businessId}:${uid}`).digest('hex').slice(0, 24)
  const publicId = `citaspro/${namespace}/${kind}/${randomUUID()}`
  const params = { overwrite: 'false', public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) }
  const signature = createHash('sha256').update(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&') + secret).digest('hex')
  const form = new FormData()
  for (const [k, v] of Object.entries({ ...params, api_key: key, signature })) form.append(k, v)
  form.append('file', new Blob([bytes], { type: mime }), `image.${mime.split('/')[1]}`)
  let response, data
  try {
    response = await request(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(60000) })
    data = await response.json()
  } catch { fail('unavailable', 'No se pudo subir la imagen. Comprueba tu conexión e inténtalo de nuevo.') }
  if (!response.ok) {
    // Never log provider messages: they can contain API keys and signatures.
    console.warn('Cloudinary upload rejected; HTTP status:', response.status)
    if (response.status === 401) fail('failed-precondition', 'Cloudinary rechazó las credenciales. Revisa en Render el Cloud name, la API Key y el API Secret del mismo par activo (HTTP 401).')
    if (response.status === 403) fail('failed-precondition', 'Cloudinary no permite esta subida. Revisa los permisos de la clave y el estado de la cuenta (HTTP 403).')
    if (response.status === 404) fail('failed-precondition', 'No se encontró el destino en Cloudinary. Revisa CLOUDINARY_CLOUD_NAME en Render (HTTP 404).')
    if (response.status === 420 || response.status === 429) fail('resource-exhausted', 'Cloudinary alcanzó un límite de uso. Revisa la cuota de la cuenta e inténtalo más tarde.')
    fail(response.status === 400 ? 'invalid-argument' : 'unavailable', response.status === 400 ? 'Cloudinary rechazó el archivo o los parámetros de subida (HTTP 400). Prueba otra imagen y revisa la configuración del almacenamiento.' : 'El almacenamiento de imágenes no está disponible. Inténtalo más tarde.')
  }
  if (data.public_id !== publicId || !data.secure_url?.startsWith(`https://res.cloudinary.com/${cloud}/image/upload/`)) fail('internal', 'El almacenamiento devolvió una respuesta inesperada.')
  return { url: data.secure_url, publicId: data.public_id }
}
