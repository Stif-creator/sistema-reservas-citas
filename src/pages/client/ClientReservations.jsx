import { statusHelp } from '../../lib/clientBooking'
import { countdown } from '../../lib/countdown'
import DataList from '../../components/ui/DataList'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, CheckCircle2, Clock3, Plus, Sparkles, UserRound, XCircle } from 'lucide-react'
import { useClientBusiness } from '../../context/client-context'
import useClientReservations from '../../hooks/useClientReservations'
import { dateMillis, formatAppointmentDate, formatPrice, reservationStatuses } from '../../lib/clientPresentation'
import { bookingEnabled } from '../../lib/bookingApi'
import { safeImageUrl } from '../../lib/brand'

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
  const upcomingCount = items.filter(item => item.status !== 'cancelled'
    && !['completed', 'no_show'].includes(item.status)
    && dateMillis(item.endAt ?? item.startAt) >= now).length
  const completedCount = items.filter(item => item.status === 'completed').length
  const cancelledCount = items.filter(item => item.status === 'cancelled').length
  return <>
    <div className="client-page-heading client-reservations-heading"><div><span className="client-overline"><CalendarDays size={13} />TUS VISITAS, EN UN SOLO LUGAR</span><h1>Mis reservas</h1><p>Consulta la información y el estado de tus citas.</p></div>{bookingEnabled && <Link className="public-button" to="/cliente/reservar"><Plus size={17} />Nueva reserva</Link>}</div>
    {!loading && !error && <section className="client-reservation-stats" aria-label="Resumen de reservas">
      <article><span className="client-reservation-stat-icon upcoming"><CalendarDays size={19} /></span><div><strong>{upcomingCount}</strong><h2>Próximas</h2><small>{upcomingCount ? 'Citas por atender' : 'No tienes citas próximas'}</small></div></article>
      <article><span className="client-reservation-stat-icon completed"><CheckCircle2 size={19} /></span><div><strong>{completedCount}</strong><h2>Finalizadas</h2><small>{completedCount ? 'Gracias por tu confianza' : 'Aún sin citas finalizadas'}</small></div></article>
      <article><span className="client-reservation-stat-icon cancelled"><XCircle size={19} /></span><div><strong>{cancelledCount}</strong><h2>Canceladas</h2><small>{cancelledCount ? 'Reservas canceladas' : 'Sin citas canceladas'}</small></div></article>
    </section>}
    <div className="client-reservation-filters" role="group" aria-label="Filtrar reservas">
      {[[CalendarDays, 'upcoming', 'Próximas'], [Clock3, 'past', 'Anteriores'], [XCircle, 'cancelled', 'Canceladas']].map(([Icon, value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}><Icon size={15} />{label}</button>)}
    </div>
    {loading ? <p role="status" className="client-loading">Cargando tus reservas…</p> : error ? <p className="public-alert" role="alert">{error}</p>
      : !filtered.length ? <div className="client-panel client-empty"><span className="client-icon"><CalendarDays size={30} /></span><h2>{filter === 'upcoming' ? 'Tu próxima visita empieza aquí' : 'No hay reservas en esta sección'}</h2><p>{filter === 'upcoming' ? 'Todavía no tienes citas próximas. Descubre los servicios que el negocio tiene para ti.' : 'Aquí aparecerán tus citas cuando correspondan a este estado.'}</p><Link className="public-button" to="/cliente/servicios">Explorar servicios</Link></div>
        : <DataList label="Mis reservas" items={filtered} resetKey={filter} searchText={r => `${r.serviceName || r.serviceSnapshot?.name || ""} ${r.professionalName || ""} ${formatAppointmentDate(r.startAt,business.settings?.timezone)} ${reservationStatuses[r.displayStatus || r.status]}`}>{rows => <div className="client-reservations-list">{rows.map(item => {
          const service = services.find(value => value.id === item.serviceId)
          const name = item.serviceName || item.serviceSnapshot?.name || service?.name || 'Servicio reservado'
          const image = safeImageUrl(service?.image?.url || item.serviceSnapshot?.image?.url || item.serviceImageUrl)
          const status = item.displayStatus || item.status
          return <article key={item.id} className="client-reservation-row">
          <span className="client-reservation-icon">{image ? <img src={image} alt="" loading="lazy" /> : <Sparkles size={24} aria-hidden="true" />}</span>
          <div className="client-reservation-name"><h2>{name}</h2><p><span className="client-reservation-professional"><UserRound size={14} />{item.professionalName || item.professionalSnapshot?.displayName || 'Profesional asignado'}</span></p><p className="client-status-explanation">{statusHelp[status]}</p></div>
          <div className="client-reservation-date"><span><CalendarDays size={14} />{formatAppointmentDate(item.startAt, business.settings?.timezone)}</span>{['pending', 'confirmed'].includes(item.status) && dateMillis(item.startAt) > now && <strong>{countdown(dateMillis(item.startAt), now)}</strong>}<span><Clock3 size={14} />{formatAppointmentDate(item.startAt, business.settings?.timezone, true)}</span>{Number.isFinite(item.price) && <span><strong>{formatPrice(item.price, item.currencyCode || business.settings?.currencyCode)}</strong></span>}</div>
          <span className={`client-status status-${Object.hasOwn(reservationStatuses, status) ? status : 'unknown'}`}>{reservationStatuses[status] || 'Por confirmar'}</span>
          <Link className="public-button secondary" to={`/cliente/reservas/${encodeURIComponent(item.id)}`}>Ver detalles</Link>
        </article>})}</div>}</DataList>}
  </>
}
