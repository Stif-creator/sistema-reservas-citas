import { useState } from 'react'
import { bookingRequest } from '../lib/bookingApi'
import { useClientBusiness } from '../context/client-context'

export default function ReviewForm({ reservation }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const community = useClientBusiness()
  if (reservation.status !== 'completed') return null
  async function save(e) {
    e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true); setMessage(''); setError('')
    try { await bookingRequest({ action: 'review', businessId: reservation.businessId, reservationId: reservation.id, rating: Number(form.get('rating')), professionalRating: Number(form.get('professionalRating')), comment: form.get('comment') }); community?.reloadCommunity(); setMessage('Valoración publicada. Si vuelves a guardar, se actualiza tu reseña.') }
    catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  return <form className="booking-panel booking-fields client-review-form" onSubmit={save}><h2>Valora tu experiencia</h2><p>Tu cita ha finalizado. Tu nombre y comentario serán visibles en el portal del negocio.</p><label className="booking-field">Calificación del servicio<select name="rating" defaultValue="5">{[5,4,3,2,1].map(n => <option key={n} value={n}>{n} estrellas</option>)}</select></label><label className="booking-field">Calificación del profesional<select name="professionalRating" defaultValue="5">{[5,4,3,2,1].map(n => <option key={n} value={n}>{n} estrellas</option>)}</select></label><label className="booking-field">Comentario<textarea name="comment" required maxLength={1000} rows={4} placeholder="Cuéntanos cómo fue tu atención…" /></label><button className="booking-button" disabled={busy}>{busy ? 'Publicando…' : 'Publicar valoración'}</button>{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}</form>
}
