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
  return <section className="space-y-4 mt-6"><h2>Actividad del negocio</h2><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{stats.map(([label,count]) => <article className="rounded-xl border border-border bg-white p-5" key={label}><p>{label}</p><strong className="text-3xl">{count}</strong></article>)}</div><h2>Próximas citas</h2>{!upcoming.length && <p>No hay próximas citas.</p>}{upcoming.slice(0,5).map(r => <p key={r.id}><Link to={`/reservas/${r.id}`}>{r.clientName} · {r.serviceName} · {formatAppointmentDate(r.startAt,zone)}</Link></p>)}</section>
}
