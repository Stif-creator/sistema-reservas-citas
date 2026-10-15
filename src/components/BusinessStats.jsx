import { CalendarCheck, Clock3, Users, Activity, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import useBusinessReservations from '../hooks/useBusinessReservations'
import useSprintData from '../hooks/useSprintData'
import { dayKey } from '../lib/calendarDates'
import { dateMillis, formatAppointmentDate, reservationStatuses } from '../lib/clientPresentation'

export default function BusinessStats() {
  const { items, business, loading, error } = useBusinessReservations()
  const clients = useSprintData('clients')
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer) }, [])
  if (error || clients.error) return <p role="alert">{error || clients.error}</p>
  if (loading || !clients.data) return <p role="status">Cargando indicadores…</p>
  const zone = business.settings?.timezone || 'America/La_Paz'
  const upcoming = items.filter(r => ['pending','confirmed'].includes(r.status) && dateMillis(r.startAt) >= now).sort((a,b) => dateMillis(a.startAt)-dateMillis(b.startAt))
  const stats = [['Citas de hoy', items.filter(r => dayKey(dateMillis(r.startAt),zone) === dayKey(now,zone) && r.status !== 'cancelled').length],['Próximas citas',upcoming.length],['Clientes',clients.data.clients.length],...Object.entries(reservationStatuses).map(([key,label]) => [label,items.filter(r => r.status === key).length])]
  const icons = [CalendarCheck, Clock3, Users]
  return <section className="space-y-4 mt-6">
    <div className="business-stats-heading"><h2>Actividad del negocio</h2></div>
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map(([label, count], index) => {
        const Icon = icons[index] || Activity
        return <article className="business-stat" key={label}>
          <span className="business-stat-icon" aria-hidden="true"><Icon size={22} strokeWidth={1.7} /></span>
          <div><p>{label}</p><strong>{count}</strong></div>
        </article>
      })}
    </div>
    <div className="dashboard-upcoming">
      <div className="business-stats-heading"><h2>Próximas citas</h2><Link className="text-xs text-primary" to="/reservas">Ver todas <span aria-hidden="true">→</span></Link></div>
      {!upcoming.length && <p className="text-sm text-muted">No hay próximas citas.</p>}
      {upcoming.slice(0, 5).map(r => <Link className="dashboard-appointment" key={r.id} to={`/reservas/${r.id}`}>
        <CalendarCheck size={20} aria-hidden="true" />
        <div className="min-w-0 flex-1"><strong>{r.clientName}</strong><span>{r.serviceName} · {formatAppointmentDate(r.startAt, zone)}</span></div>
        <ArrowUpRight size={17} aria-hidden="true" />
      </Link>)}
    </div>
  </section>
}
