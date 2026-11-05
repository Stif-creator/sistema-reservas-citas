import { Camera, MediaTypeSelection } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'

export function isNativeImagePicker() {
  return Capacitor.isNativePlatform()
}

export async function pickNativeImage() {
  if (!isNativeImagePicker()) return null

  const { results = [] } = await Camera.chooseFromGallery({
    mediaType: MediaTypeSelection.Photo,
    allowMultipleSelection: false,
    quality: 85,
    targetWidth: 1600,
    targetHeight: 1600,
    correctOrientation: true,
    includeMetadata: true,
  })
  const photo = results[0]
  if (!photo) return null
  if (!photo.webPath) throw new Error('No se pudo abrir la fotografía seleccionada.')

  const response = await fetch(photo.webPath)
  if (!response.ok) throw new Error('No se pudo leer la fotografía seleccionada.')
  const blob = await response.blob()
  const format = photo.metadata?.format?.toLowerCase()
  const formatMime = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg'
  const mime = ['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) ? blob.type : formatMime
  const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'

  return new File([blob], `citaspro-photo.${extension}`, { type: mime, lastModified: Date.now() })
}
