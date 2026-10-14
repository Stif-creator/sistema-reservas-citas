import { auth } from '../firebase/config'

export async function uploadLocalImage(file, businessId, kind) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Elige una imagen JPG, PNG o WebP.')
  if (!file.size || file.size > 2 * 1024 * 1024) throw new Error('La imagen debe pesar como máximo 2 MB.')
  const base = (import.meta.env.VITE_MEDIA_API_URL || import.meta.env.VITE_BOOKING_API_URL || '').replace(/\/+$/, '')
  if (!base) throw new Error('La subida de imágenes aún no está configurada.')
  if (!auth.currentUser) throw new Error('Inicia sesión para subir una imagen.')
  const image = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'))
    reader.readAsDataURL(file)
  })
  const token = await auth.currentUser.getIdToken()
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 150000)
  try {
    const response = await fetch(`${base}/images`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId, kind, image }), signal: controller.signal })
    if (response.status === 404) throw new Error('El servidor necesita actualizarse para permitir subir imágenes.')
    const payload = await response.json()
    if (!response.ok || !payload.data?.url) throw new Error(payload.error?.message || 'No se pudo subir la imagen.')
    return payload.data.url
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('No se pudo conectar con el servidor. Inténtalo de nuevo.')
    throw error
  } finally { clearTimeout(timeout) }
}
