import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Clock3, Sparkles } from 'lucide-react'
import { useClientBusiness } from '../../context/client-context'
import useClientReservations from '../../hooks/useClientReservations'
import { dateMillis, formatAppointmentDate, reservationStatuses } from '../../lib/clientPresentation'
import { bookingEnabled } from '../../lib/bookingApi'

export default function ClientReservations() {
  const { business, services } = useClientBusiness()
  const { items, loading, error } = useClientReservations()
  const [filter, setFilter] = useState('upcoming')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])
  const filtered = items.filter(item => {
    if (filter === 'cancelled') return item.status === 'cancelled'
    if (item.status === 'cancelled') return false
    const past = dateMillis(item.endAt ?? item.startAt) < now || ['completed', 'no_show'].includes(item.status)
    return filter === 'past' ? past : !past
  }).sort((a, b) => (dateMillis(a.startAt) - dateMillis(b.startAt)) * (filter === 'past' ? -1 : 1))
  return <>
    <div className="client-page-heading"><div><span className="client-overline">TUS VISITAS, EN UN SOLO LUGAR</span><h1>Mis reservas</h1><p>Consulta la información y el estado de tus citas.</p></div>{bookingEnabled && <Link className="public-button" to="/cliente/reservar">Nueva reserva</Link>}</div>
    <div className="client-reservation-filters" role="group" aria-label="Filtrar reservas">
      {[['upcoming', 'Próximas'], ['past', 'Anteriores'], ['cancelled', 'Canceladas']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
    </div>
    {loading ? <p role="status" className="client-loading">Cargando tus reservas…</p> : error ? <p className="public-alert" role="alert">{error}</p>
      : !filtered.length ? <div className="client-panel client-empty"><span className="client-icon"><CalendarDays size={30} /></span><h2>{filter === 'upcoming' ? 'Tu próxima visita empieza aquí' : 'No hay reservas en esta sección'}</h2><p>{filter === 'upcoming' ? 'Todavía no tienes citas próximas. Descubre los servicios que el negocio tiene para ti.' : 'Aquí aparecerán tus citas cuando correspondan a este estado.'}</p><Link className="public-button" to="/cliente/servicios">Explorar servicios</Link></div>
        : <div className="client-reservations-list">{filtered.map(item => <article key={item.id} className="client-reservation-row">
          <span className="client-reservation-icon"><Sparkles size={24} /></span>
          <div className="client-reservation-name"><h2>{item.serviceName || item.serviceSnapshot?.name || services.find(service => service.id === item.serviceId)?.name || 'Servicio reservado'}</h2><p>{item.professionalName || item.professionalSnapshot?.displayName || 'Profesional asignado'}</p></div>
          <div className="client-reservation-date"><span><CalendarDays size={14} />{formatAppointmentDate(item.startAt, business.settings?.timezone)}</span><span><Clock3 size={14} />{formatAppointmentDate(item.startAt, business.settings?.timezone, true)}</span></div>
          <span className={`client-status status-${Object.hasOwn(reservationStatuses, item.status) ? item.status : 'unknown'}`}>{reservationStatuses[item.status] || 'Por confirmar'}</span>
          <Link className="public-button secondary" to={`/cliente/reservas/${encodeURIComponent(item.id)}`}>Ver detalles</Link>
        </article>)}</div>}
  </>
}
