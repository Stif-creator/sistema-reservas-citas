import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePublicBusiness } from '../context/PublicBusinessContext'
import BookingFlow from '../components/booking/BookingFlow'

export default function PublicBooking() {
  const { business } = usePublicBusiness()
  const navigate = useNavigate(), [params] = useSearchParams()
  const [draft] = useState(() => {
    try { const value = JSON.parse(sessionStorage.getItem(`booking-draft:${business.id}`)); return value?.savedAt > Date.now() - 3600000 ? value : null } catch { return null }
  })
  return <main id="contenido" className="public-container public-section booking-scope"><h1>Reserva tu cita</h1><p>Elige tu servicio y horario. Solo necesitas una cuenta al confirmar.</p><BookingFlow key={business.id} business={business} publicMode draft={draft} initialServiceId={params.get('servicio') || ''} onSuccess={result => { try { sessionStorage.removeItem(`booking-draft:${business.id}`) } catch { /* No persistent storage. */ } navigate(`/cliente/reserva-exitosa/${result.id}`) }} /></main>
}
