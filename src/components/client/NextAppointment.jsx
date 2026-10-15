import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock3 } from 'lucide-react'
import useClientReservations from '../../hooks/useClientReservations'
import { dateMillis, formatAppointmentDate } from '../../lib/clientPresentation'
import { countdown } from '../../lib/countdown'
import { useClientBusiness } from '../../context/client-context'

export default function NextAppointment() {
  const { items, error } = useClientReservations()
  const { business } = useClientBusiness()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])
  const next = items.filter(r => ['pending', 'confirmed'].includes(r.status) && dateMillis(r.startAt) > now).sort((a, b) => dateMillis(a.startAt) - dateMillis(b.startAt))[0]
  if (error || !next) return null
  return <aside className="public-container client-section"><div className="client-panel flex flex-wrap items-center gap-4">
    <Clock3 size={30} aria-hidden="true" /><div className="flex-1"><h2>{countdown(dateMillis(next.startAt), now)}</h2><p>{next.serviceName} · {formatAppointmentDate(next.startAt, business.settings?.timezone)} · {formatAppointmentDate(next.startAt, business.settings?.timezone, true)}</p></div>
    <Link className="public-button secondary" to={`/cliente/reservas/${encodeURIComponent(next.id)}`}>Ver mi próxima cita</Link>
  </div></aside>
}
