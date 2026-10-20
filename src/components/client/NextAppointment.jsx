import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, Clock3 } from 'lucide-react'
import useClientReservations from '../../hooks/useClientReservations'
import { dateMillis, formatAppointmentDate, reservationStatuses } from '../../lib/clientPresentation'
import { countdown } from '../../lib/countdown'
import { useClientBusiness } from '../../context/client-context'

function dateBadge(value, timeZone) {
  const stamp = dateMillis(value)
  if (!Number.isFinite(stamp)) return { month: '—', day: '—' }
  try {
    const parts = new Intl.DateTimeFormat('es-BO', { timeZone, day: '2-digit', month: 'short' }).formatToParts(stamp)
    return {
      month: parts.find(part => part.type === 'month')?.value.replace('.', '').toUpperCase() || '—',
      day: parts.find(part => part.type === 'day')?.value || '—',
    }
  } catch {
    return { month: '—', day: '—' }
  }
}

export default function NextAppointment() {
  const { items, error, loading } = useClientReservations()
  const { business } = useClientBusiness()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])
  const next = items.filter(r => ['pending', 'confirmed'].includes(r.status) && dateMillis(r.startAt) > now).sort((a, b) => dateMillis(a.startAt) - dateMillis(b.startAt))[0]
  if (loading) return <p role="status" className="public-container client-section">Consultando tu próxima cita…</p>
  if (error) return <p role="alert" className="public-container public-alert">{error}</p>
  const timeZone = business.settings?.timezone || 'America/La_Paz'
  if (!next) return <aside className="public-container client-section client-next-section"><div className="client-next-empty">
    <span className="client-next-empty-icon"><CalendarDays size={22} /></span>
    <div><span className="client-overline">TU PRÓXIMO MOMENTO</span><h2>Aún no tienes una cita reservada</h2><p>Explora los servicios y encuentra un horario que te venga bien.</p></div>
    <Link className="public-button" to="/cliente/servicios">Explorar servicios <ArrowRight size={16} /></Link>
  </div></aside>
  const badge = dateBadge(next.startAt, timeZone)
  return <aside className="public-container client-section client-next-section" aria-labelledby="client-next-title">
    <span className="client-overline">TU PRÓXIMA VISITA</span>
    <h2 id="client-next-title" className="client-next-heading">Ya tienes un momento reservado.</h2>
    <article className="client-next-card">
      <div className="client-next-date" aria-label={formatAppointmentDate(next.startAt, timeZone)}>
        <span>{badge.month}</span><strong>{badge.day}</strong>
      </div>
      <div className="client-next-details">
        <div className="client-next-title-row"><h3>{next.serviceName}</h3><span className={`client-status status-${next.status}`}>{reservationStatuses[next.status]}</span></div>
        <p>{next.professionalName || 'Profesional por confirmar'} <span aria-hidden="true">·</span> {formatAppointmentDate(next.startAt, timeZone, true)}</p>
        <p className="client-next-full-date">{formatAppointmentDate(next.startAt, timeZone)}</p>
        {next.status === 'pending'
          ? <p className="client-next-notice">El negocio aún debe confirmar tu solicitud.</p>
          : <p className="client-next-countdown"><Clock3 size={14} />{countdown(dateMillis(next.startAt), now)}</p>}
      </div>
      <Link className="client-next-link" to={`/cliente/reservas/${encodeURIComponent(next.id)}`}>Ver detalles <ArrowRight size={16} /></Link>
    </article>
  </aside>
}
