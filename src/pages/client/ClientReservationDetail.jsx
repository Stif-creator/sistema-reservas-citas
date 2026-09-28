import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Clock3, Hash, UserRound, Wallet } from 'lucide-react'
import { useClientBusiness } from '../../context/client-context'
import useClientReservations from '../../hooks/useClientReservations'
import { formatAppointmentDate, formatPrice, reservationStatuses } from '../../lib/clientPresentation'

export default function ClientReservationDetail() {
  const { reservationId } = useParams()
  const { business, services } = useClientBusiness()
  const { items, loading, error } = useClientReservations()
  const item = items.find(reservation => reservation.id === reservationId)
  if (loading) return <p role="status" className="client-loading">Cargando reserva…</p>
  if (error) return <p className="public-alert" role="alert">{error}</p>
  return <>
    <Link className="client-back" to="/cliente/reservas"><ArrowLeft size={16} />Volver a mis reservas</Link>
    {!item ? <div className="client-empty"><h1>Reserva no disponible</h1><p>No encontramos esta reserva en tu cuenta.</p></div> : <>
      <div className="client-page-heading"><div><span className="client-overline">INFORMACIÓN DE TU VISITA</span><h1>Detalle de reserva</h1></div></div>
      <article className="client-panel client-reservation-detail">
        <div className="client-page-heading"><h2>{item.serviceName || item.serviceSnapshot?.name || services.find(service => service.id === item.serviceId)?.name || 'Servicio reservado'}</h2><span className={`client-status status-${Object.hasOwn(reservationStatuses, item.status) ? item.status : 'unknown'}`}>{reservationStatuses[item.status] || 'Por confirmar'}</span></div>
        <dl className="client-profile-fields">
          <div><dt><Hash size={16} />Código de reserva</dt><dd>{item.code || item.id}</dd></div>
          <div><dt><UserRound size={16} />Profesional</dt><dd>{item.professionalName || item.professionalSnapshot?.displayName || 'Profesional asignado'}</dd></div>
          <div><dt><CalendarDays size={16} />Fecha</dt><dd>{formatAppointmentDate(item.startAt, business.settings?.timezone)}</dd></div>
          <div><dt><Clock3 size={16} />Hora</dt><dd>{formatAppointmentDate(item.startAt, business.settings?.timezone, true)}</dd></div>
          <div><dt><Wallet size={16} />Precio</dt><dd>{formatPrice(item.price ?? item.serviceSnapshot?.price, item.currencyCode || business.settings?.currencyCode)}</dd></div>
          <div><dt>Notas</dt><dd>{item.notes || 'Sin notas adicionales'}</dd></div>
        </dl>
      </article>
    </>}
  </>
}
