import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { useClientBusiness } from '../../context/client-context'
import useClientReservations from '../../hooks/useClientReservations'
import BookingFlow from '../../components/booking/BookingFlow'
import BookingSummary from '../../components/booking/BookingSummary'
import { dateMillis } from '../../lib/clientPresentation'

export default function ClientBooking({ reschedule = false, receipt = false }) {
  const { business } = useClientBusiness()
  const { reservationId } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const { items, loading, error } = useClientReservations()
  const reservation = items.find(item => item.id === reservationId)
  if ((reschedule || receipt) && loading) return <p role="status" className="client-loading">Cargando reserva…</p>
  if ((reschedule || receipt) && (error || !reservation)) return <div className="client-empty"><h1>{error || 'Reserva no disponible'}</h1><Link to="/cliente/reservas">Volver a mis reservas</Link></div>
  if (receipt) return <section className="public-container client-section"><div className="booking-receipt"><CheckCircle2 size={54} />
    <h1>{reservation.status === 'confirmed' ? '¡Reserva confirmada!' : reservation.status === 'pending' ? '¡Solicitud registrada!' : 'Reserva registrada'}</h1>
    <p>{reservation.status === 'pending' ? 'El negocio confirmará tu cita. Puedes consultar su estado en Mis reservas.' : 'Consulta los detalles y el estado de tu cita en Mis reservas.'}</p>
    <BookingSummary service={{ name: reservation.serviceName }} professional={{ displayName: reservation.professionalName }} slot={{ start: dateMillis(reservation.startAt) }} quote={reservation} timeZone={reservation.timeZone} />
    <div className="client-actions"><Link className="public-button" to={`/cliente/reservas/${encodeURIComponent(reservation.id)}`}>Ver mi reserva</Link><Link className="public-button secondary" to="/cliente/reservar">Reservar otra cita</Link></div>
  </div></section>
  return <section className="public-container client-section"><div className="client-page-heading"><div><h1>{reschedule ? 'Reprogramar cita' : 'Reserva tu cita'}</h1><p>Elige el servicio y el horario que mejor se adapten a ti.</p></div><Link className="client-back" to="/cliente/reservas">Mis reservas</Link></div>
    <BookingFlow key={reservation?.id || 'new'} business={business} initialServiceId={search.get('servicio') || ''} reservation={reschedule ? reservation : undefined}
      onSuccess={result => navigate(reschedule ? `/cliente/reservas/${result.id}` : `/cliente/reserva-exitosa/${result.id}`, { replace: true })} />
  </section>
}
