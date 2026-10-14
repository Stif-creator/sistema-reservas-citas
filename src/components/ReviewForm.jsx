import { useState } from 'react'
import { bookingRequest } from '../lib/bookingApi'

export default function ReviewForm({ reservation }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  if (reservation.status !== 'completed') return null
  async function save(e) {
    e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true); setMessage(''); setError('')
    try { await bookingRequest({ action: 'review', businessId: reservation.businessId, reservationId: reservation.id, rating: Number(form.get('rating')), comment: form.get('comment') }); setMessage('Valoración publicada. Si vuelves a guardar, se actualiza tu reseña.') }
    catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  return <form className="booking-panel booking-fields" onSubmit={save}><h2>Valora tu experiencia</h2><p>Tu nombre y comentario serán visibles en el portal del negocio.</p><label className="booking-field">Calificación<select name="rating" defaultValue="5">{[5,4,3,2,1].map(n => <option key={n} value={n}>{n} estrellas</option>)}</select></label><label className="booking-field">Comentario<textarea name="comment" required maxLength={1000} /></label><button className="booking-button" disabled={busy}>Publicar valoración</button>{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}</form>
}
