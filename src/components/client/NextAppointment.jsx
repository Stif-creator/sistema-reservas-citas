import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock3 } from 'lucide-react'
import useClientReservations from '../../hooks/useClientReservations'
import { dateMillis, formatAppointmentDate, reservationStatuses } from '../../lib/clientPresentation'
import { countdown } from '../../lib/countdown'
import { useClientBusiness } from '../../context/client-context'

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
  if (!next) return <aside className="public-container client-section"><div className="client-panel"><h2>Aún no tienes una próxima cita</h2><p>Elige un servicio y consulta sus horarios disponibles.</p><Link className="text-link" to="/cliente/servicios">Explorar servicios</Link></div></aside>
  return <aside className="public-container client-section"><div className="client-panel flex flex-wrap items-center gap-4">
    <Clock3 size={30} aria-hidden="true" /><div className="flex-1"><h2>Tu próxima cita</h2><span className={`client-status status-${next.status}`}>{reservationStatuses[next.status]}</span><p><strong>{countdown(dateMillis(next.startAt), now)}</strong></p><p>{next.serviceName} · {formatAppointmentDate(next.startAt, business.settings?.timezone)} · {formatAppointmentDate(next.startAt, business.settings?.timezone, true)}</p><p>{next.professionalName}</p>{next.status === 'pending' && <p>El negocio aún debe confirmar tu solicitud.</p>}</div>
    <Link className="public-button secondary" to={`/cliente/reservas/${encodeURIComponent(next.id)}`}>Ver mi próxima cita</Link>
  </div></aside>
}
