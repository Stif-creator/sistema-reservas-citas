import { useId, useState } from 'react'
import { uploadLocalImage } from '../lib/imageUpload'
import { safeImageUrl } from '../lib/brand'

export default function ImageUploadField({ label, value, onChange, businessId, kind, disabled = false, onBusyChange = () => {}, immediate = false }) {
  const id = useId()
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  async function choose(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true); onBusyChange(true); setError(''); setMessage('')
    try {
      const url = await uploadLocalImage(file, businessId, kind)
      await onChange(url)
      setMessage(immediate ? 'Foto guardada.' : 'Imagen subida. Guarda los cambios del formulario para aplicarla.')
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false); onBusyChange(false) }
  }
  async function remove() {
    setBusy(true); onBusyChange(true); setError(''); setMessage('')
    try { await onChange(''); setMessage(immediate ? 'Foto retirada.' : 'Guarda los cambios para retirar la imagen.') }
    catch { setError('No se pudo retirar la imagen.') }
    finally { setBusy(false); onBusyChange(false) }
  }
  return <div className="space-y-2 min-w-0">
    <label htmlFor={id} className="block text-sm font-medium">{label}</label>
    {safeImageUrl(value) && <img src={value} alt={`Vista previa: ${label}`} className="h-28 max-w-full rounded-lg border border-border object-contain" />}
    <input id={id} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || busy} onChange={choose} aria-describedby={`${id}-help`} className="block w-full max-w-full text-sm" />
    <p id={`${id}-help`} className="text-xs text-muted">Selecciona una foto de tu dispositivo. JPG, PNG o WebP, hasta 2 MB.</p>
    {value && <button type="button" disabled={disabled || busy} onClick={remove} className="text-sm underline">Quitar imagen</button>}
    {busy && <p role="status" className="text-sm">Subiendo imagen… La primera conexión puede tardar un momento.</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </div>
}
