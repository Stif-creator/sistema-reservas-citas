import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowRight, CalendarCheck, CalendarDays, CalendarPlus, CheckCircle2, Clock3, ListChecks, Users, BriefcaseBusiness, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import PendingWork from './PendingWork'
import useBusinessReservations from '../hooks/useBusinessReservations'
import useSprintData from '../hooks/useSprintData'
import { addDays, dayKey } from '../lib/calendarDates'
import { dateMillis, formatAppointmentDate, reservationStatuses } from '../lib/clientPresentation'
import './business-dashboard.css'

const statusColors = { expired: 'amber', awaiting_closure: 'blue', in_progress: 'teal', pending: 'violet', confirmed: 'blue', completed: 'green', cancelled: 'red', no_show: 'orange' }
const quickActions = [
  { label: 'Nueva reserva', detail: 'Registrar una cita manual', to: '/reservas/nueva', icon: CalendarPlus, tone: 'primary' },
  { label: 'Ver agenda', detail: 'Consultar las citas', to: '/agenda', icon: CalendarDays, tone: 'blue' },
  { label: 'Gestionar servicios', detail: 'Editar servicios y precios', to: '/servicios', icon: BriefcaseBusiness, tone: 'violet' },
  { label: 'Disponibilidad', detail: 'Configurar horarios', to: '/disponibilidad', icon: Clock3, tone: 'green' },
]

function SummaryMetric({ icon: Icon, label, count, scope, tone }) {
  return <article className={`business-summary-metric tone-${tone}`}><span className="business-summary-icon"><Icon size={19} /></span><div className="business-summary-copy"><strong>{count}</strong><span>{label}</span><small>{scope}</small></div></article>
}

export default function BusinessStats({ userDoc }) {
  const { items, business, loading, error } = useBusinessReservations()
  const clients = useSprintData('clients')
  const [now, setNow] = useState(Date.now), [chartDays, setChartDays] = useState(7)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer) }, [])
  const zone = business?.settings?.timezone || 'America/La_Paz'
  const today = dayKey(now, zone)
  const upcoming = useMemo(() => items.filter(item => ['pending', 'confirmed'].includes(item.status) && dateMillis(item.startAt) >= now).sort((a, b) => dateMillis(a.startAt) - dateMillis(b.startAt)), [items, now])
  const chart = useMemo(() => {
    const days = Array.from({ length: chartDays }, (_, index) => addDays(today, index - (chartDays - 1)))
    const counts = new Map(days.map(day => [day, 0]))
    for (const item of items) {
      if (item.status === 'cancelled') continue
      const key = dayKey(dateMillis(item.startAt), zone)
      if (counts.has(key)) counts.set(key, counts.get(key) + 1)
    }
    return days.map(day => ({ day, count: counts.get(day) }))
  }, [items, chartDays, today, zone])
  if (error || clients.error) return <div className="business-dashboard-error" role="alert">{error || clients.error}</div>
  if (loading || !clients.data) return <p role="status" className="business-dashboard-loading">Cargando el resumen del negocio…</p>

  const clientCount = Array.isArray(clients.data.clients) ? clients.data.clients.length : Number.isFinite(clients.data.totalClients) ? clients.data.totalClients : 0
  const todayCount = items.filter(item => dayKey(dateMillis(item.startAt), zone) === today && item.status !== 'cancelled').length
  const completedCount = items.filter(item => item.status === 'completed').length
  const maxChart = Math.max(1, ...chart.map(day => day.count))
  const statuses = Object.keys(reservationStatuses).map(key => ({ key, label: reservationStatuses[key], count: items.filter(item => (item.displayStatus || item.status) === key).length }))
  const knownStatuses = new Set(Object.keys(reservationStatuses))
  const otherCount = items.filter(item => !knownStatuses.has(item.displayStatus || item.status)).length
  if (otherCount) statuses.push({ key: 'other', label: 'Otros estados', count: otherCount })
  const total = items.length

  return <section className="business-dashboard">
    <div className="business-dashboard-heading"><div><p className="business-dashboard-eyebrow">Resumen del negocio</p><h1>Hola, {userDoc?.firstName}</h1><p>Este es el resumen de la actividad de tu negocio.</p></div>{business && <aside className="business-identity-card"><span className="business-identity-icon"><BriefcaseBusiness size={20} /></span><div><strong>{business.name}</strong>{(business.description || business.category) && <span>{business.description || business.category}</span>}</div><span className="business-role-pill">Administrador</span></aside>}</div>
    <PendingWork items={items} />
    <div className="business-dashboard-columns">
      <div className="business-dashboard-main">
        <section className="business-dashboard-panel business-today-panel"><div className="business-panel-heading"><span className="business-panel-icon violet"><CalendarCheck size={19} /></span><div><h2>Resumen de hoy</h2><p>Actividad diaria y totales del negocio.</p></div><Link to="/agenda">Ver agenda <ArrowRight size={15} /></Link></div><div className="business-summary-grid"><SummaryMetric icon={CalendarCheck} label="Citas de hoy" count={todayCount} scope={formatAppointmentDate(now, zone)} tone="violet" /><SummaryMetric icon={Clock3} label="Próximas citas" count={upcoming.length} scope="Futuras, pendientes o confirmadas" tone="blue" /><SummaryMetric icon={Users} label="Clientes registrados" count={clientCount} scope="Total del negocio" tone="green" /><SummaryMetric icon={CheckCircle2} label="Reservas finalizadas" count={completedCount} scope="Histórico" tone="violet" /></div></section>
        <section className="business-dashboard-panel business-chart-panel"><div className="business-panel-heading"><span className="business-panel-icon violet"><Activity size={19} /></span><div><h2>Citas de los últimos {chartDays} días</h2><p>Por fecha de atención, sin cancelaciones · {business?.settings?.timezone || 'America/La_Paz'}</p></div><label className="business-chart-range"><span className="sr-only">Período del gráfico</span><select aria-label="Período del gráfico" value={chartDays} onChange={event => setChartDays(Number(event.target.value))}><option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option></select></label></div>{chart.some(day => day.count > 0) ? <div className={`business-chart business-chart-${chartDays}`} role="img" aria-label={`Reservas por día durante los últimos ${chartDays} días: ${chart.map(day => `${day.day}, ${day.count}`).join('; ')}`}><div className="business-chart-y-axis"><span>{maxChart}</span><span>{Math.round(maxChart / 2)}</span><span>0</span></div><div className="business-chart-bars">{chart.map(({ day, count }) => <div className="business-chart-column" key={day}><strong>{count}</strong><div className="business-chart-track"><span style={{ height: `${count ? Math.max(4, count / maxChart * 100) : 2}%` }} /></div><small>{day.slice(5)}</small></div>)}</div></div> : <p className="business-chart-empty">No hay citas en este período.</p>}</section>
      </div>
      <div className="business-dashboard-side">
        <section className="business-dashboard-panel business-status-panel"><div className="business-panel-heading"><span className="business-panel-icon blue"><ListChecks size={19} /></span><div><h2>Estado de las reservas</h2><p>Distribución de {total} reservas registradas.</p></div></div>{total ? <div className="business-status-list">{statuses.map(status => { const percent = Math.round(status.count / total * 100); return <div className="business-status-row" key={status.key}><span className="business-status-name"><i className={`status-dot ${statusColors[status.key] || 'gray'}`} />{status.label}</span><div className="business-status-track"><span className={statusColors[status.key] || 'gray'} style={{ width: `${percent}%` }} /></div><strong>{status.count}</strong><small>{percent}%</small></div> })}</div> : <p className="business-panel-empty">Aún no hay reservas registradas.</p>}</section>
        <section className="business-dashboard-panel business-next-panel"><div className="business-panel-heading"><span className="business-panel-icon violet"><CalendarDays size={19} /></span><div><h2>Próximas citas</h2><p>Hasta cinco citas activas.</p></div><Link to="/reservas">Ver todas <ArrowRight size={15} /></Link></div>{upcoming.length ? <div className="business-next-list">{upcoming.slice(0, 5).map(item => <Link className="business-next-appointment" key={item.id} to={`/reservas/${encodeURIComponent(item.id)}`}><span className="business-next-date"><strong>{formatAppointmentDate(item.startAt, zone, true)}</strong><small>{formatAppointmentDate(item.startAt, zone)}</small></span><span className="business-next-info"><strong>{item.clientName || 'Cliente'}</strong><span>{item.serviceName || 'Servicio por confirmar'}{item.professionalName ? ` · ${item.professionalName}` : ''}</span></span><span className={`business-next-status ${item.status}`}>{reservationStatuses[item.displayStatus || item.status] || 'Reserva'}</span><ArrowRight className="business-next-arrow" size={16} /></Link>)}</div> : <p className="business-panel-empty">No tienes próximas citas.</p>}</section>
      </div>
    </div>
    <section className="business-dashboard-panel business-quick-panel"><div className="business-panel-heading"><span className="business-panel-icon violet"><Zap size={19} /></span><div><h2>Accesos rápidos</h2><p>Acciones frecuentes para gestionar tu negocio.</p></div></div><div className="business-quick-grid">{quickActions.map(({ label, detail, to, icon: Icon, tone }) => <Link key={to} to={to} className={`business-quick-action ${tone}`}><Icon size={19} /><span><strong>{label}</strong><small>{detail}</small></span><ArrowRight size={16} /></Link>)}</div></section>
    <p className="business-dashboard-config">¿Necesitas cambiar otros datos del negocio? <Link to="/negocio">Ir a configuración <ArrowRight size={14} /></Link></p>
  </section>
}
