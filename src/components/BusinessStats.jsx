import ClosingNotice from './ClosingNotice'
import { CalendarCheck, Clock3, Users, Activity, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import useBusinessReservations from '../hooks/useBusinessReservations'
import useSprintData from '../hooks/useSprintData'
import { dayKey, addDays } from '../lib/calendarDates'
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
  const stats = [['Citas de hoy', items.filter(r => dayKey(dateMillis(r.startAt),zone) === dayKey(now,zone) && r.status !== 'cancelled').length],['Próximas citas',upcoming.length],['Clientes',clients.data.clients.length],...Object.entries(reservationStatuses).map(([key,label]) => [label,items.filter(r => (r.displayStatus || r.status) === key).length])]
  const today = dayKey(now, zone)
  const week = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(today, index - 6)
    return { day, count: items.filter(r => dayKey(dateMillis(r.startAt), zone) === day && r.status !== 'cancelled').length }
  })
  const maximum = Math.max(1, ...week.map(d => d.count))
  const icons = [CalendarCheck, Clock3, Users]
  return <section className="space-y-4 mt-6"><ClosingNotice items={items} />
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
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="dashboard-upcoming"><h2 className="font-semibold mb-4">Citas de los últimos 7 días</h2><p className="text-sm text-muted mb-4">Por fecha de atención, sin cancelaciones.</p><div className="flex items-end gap-3 h-40">{week.map(d => <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full"><strong>{d.count}</strong><div className="w-full rounded-t bg-indigo-400" style={{ height: `${Math.max(2, d.count / maximum * 100)}px` }} /><small>{d.day.slice(5)}</small></div>)}</div></section>
      <section className="dashboard-upcoming"><h2 className="font-semibold mb-4">Estado de todas las reservas</h2>{Object.entries(reservationStatuses).map(([status, label]) => { const count = items.filter(r => (r.displayStatus || r.status) === status).length; return <div key={status} className="mb-3"><div className="flex justify-between text-sm"><span>{label}</span><strong>{count}</strong></div><progress aria-label={label} value={count} max={Math.max(1, items.length)} className="w-full accent-indigo-500" /></div> })}</section>
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
