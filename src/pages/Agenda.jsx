import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BriefcaseBusiness, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Plus, UserRound, X } from 'lucide-react'
import { useAuth } from '../context/auth-context'
import useBusinessReservations from '../hooks/useBusinessReservations'
import useAgendaReservations from '../hooks/useAgendaReservations'
import { addDays, agendaDays, dayKey, zonedDateBoundary } from '../lib/calendarDates'
import { bookingEnabled, bookingRequest } from '../lib/bookingApi'
import { dateMillis, formatAppointmentDate, reservationStatuses } from '../lib/clientPresentation'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import Alert from '../components/ui/Alert'
import DataList from '../components/ui/DataList'
import BookingFlow from '../components/booking/BookingFlow'
import EditorDialog from '../components/ui/EditorDialog'
import ReservationActions from '../components/booking/ReservationActions'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import '../components/booking/booking.css'
import '../components/booking/agenda.css'

const statusLegend = [
  ['confirmed', 'Confirmada'], ['in_progress', 'En curso'], ['pending', 'Pendiente'],
  ['awaiting_closure', 'Pendiente de cierre'], ['expired', 'Vencida sin confirmar'], ['completed', 'Finalizada'], ['no_show', 'No asistida'],
]
const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const pxPerMinute = 80 / 60
const startTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)) : null

function addMonths(date, amount) {
  const value = new Date(`${date.slice(0, 7)}-01T12:00:00Z`)
  value.setUTCMonth(value.getUTCMonth() + amount)
  return value.toISOString().slice(0, 10)
}

function formatDay(date, zone, options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) {
  const value = new Intl.DateTimeFormat('es-BO', { timeZone: zone, ...options }).format(new Date(`${date}T12:00:00Z`))
  return value.charAt(0).toLocaleUpperCase('es-BO') + value.slice(1)
}

function periodLabel(date, view, days, zone) {
  if (view === 'day') return formatDay(date, zone)
  if (view === 'month') return formatDay(`${date.slice(0, 7)}-01`, zone, { month: 'long', year: 'numeric' })
  const first = days[0], last = days.at(-1)
  const firstLabel = formatDay(first, zone, { day: 'numeric', month: 'short' })
  const lastLabel = formatDay(last, zone, { day: 'numeric', month: 'short', year: 'numeric' })
  return `${firstLabel} – ${lastLabel}`
}

function timeParts(value, zone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
  const hour = Number(parts.find(part => part.type === 'hour')?.value)
  const minute = Number(parts.find(part => part.type === 'minute')?.value)
  return { hour, minute, minutes: hour * 60 + minute }
}

function getDayIntervals(day, items, zone) {
  return items.filter(item => dayKey(dateMillis(item.startAt), zone) === day).map(item => {
    const startMs = dateMillis(item.startAt)
    const endMs = dateMillis(item.endAt)
    const start = timeParts(startMs, zone).minutes
    const end = Number.isFinite(endMs) && endMs > startMs
      ? (dayKey(endMs, zone) === day ? timeParts(endMs, zone).minutes : 1440)
      : Math.min(1440, start + 30)
    return { item, start, end: Math.max(start + 1, end) }
  }).sort((a, b) => a.start - b.start || a.end - b.end)
}

function layoutIntervals(intervals) {
  const groups = []
  for (const interval of intervals) {
    let group = groups.at(-1)
    if (!group || interval.start >= group.end) {
      group = { end: interval.end, items: [] }
      groups.push(group)
    } else group.end = Math.max(group.end, interval.end)
    let lane = 0
    while (group.items.some(value => value.lane === lane && value.end > interval.start)) lane++
    group.items.push({ ...interval, lane })
  }
  return groups.flatMap(group => group.items.map(value => ({ ...value, lanes: Math.max(...group.items.map(item => item.lane)) + 1 })))
}

function getTimelineHours(days, items, business, zone) {
  const spans = []
  for (const day of days) {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay() || 7
    const hours = business.weeklyHours?.[String(weekday)]
    if (Array.isArray(hours)) for (const interval of hours) {
      const start = startTime(interval?.start), end = startTime(interval?.end)
      if (start !== null && end !== null && end > start) spans.push({ start, end })
    }
    for (const interval of getDayIntervals(day, items, zone)) spans.push(interval)
  }
  if (!spans.length) return null
  const startHour = Math.max(0, Math.floor(Math.min(...spans.map(span => span.start)) / 60))
  const endHour = Math.min(24, Math.ceil(Math.max(...spans.map(span => span.end)) / 60))
  return { startHour, endHour: Math.max(startHour + 1, endHour) }
}

function AgendaAppointment({ item, zone, selected, compact = false, onSelect, style }) {
  const status = item.displayStatus || item.status
  const service = item.serviceName || 'Servicio'
  const client = item.clientName || 'Cliente'
  const professional = item.professionalName || 'Profesional'
  const title = `${formatAppointmentDate(item.startAt, zone, true)}${item.endAt ? `–${formatAppointmentDate(item.endAt, zone, true)}` : ''} · ${service} · ${client} · ${professional} · ${reservationStatuses[status] || 'Por confirmar'}`
  return <button type="button" className={`agenda-event agenda-${status} ${compact ? 'agenda-event-compact' : ''}`} style={style} title={title} aria-pressed={selected} onClick={() => onSelect(item.id)}>
    <strong>{formatAppointmentDate(item.startAt, zone, true)}{!compact && item.endAt && <span>–{formatAppointmentDate(item.endAt, zone, true)}</span>}</strong>
    <span className="agenda-event-service" title={service}>{service}</span>
    {!compact && <span className="agenda-event-client">{client}</span>}
    {!compact && <span className="agenda-event-professional">{professional}</span>}
    <small>{reservationStatuses[status] || 'Por confirmar'}</small>
  </button>
}

function AgendaTimeline({ days, items, business, zone, view, selectedId, today, onSelect, onSelectDay }) {
  const hours = getTimelineHours(days, items, business, zone)
  const appointmentByDay = useMemo(() => new Map(days.map(day => [day, layoutIntervals(getDayIntervals(day, items, zone))])), [days, items, zone])
  if (!hours) return <div className="agenda-empty-state"><CalendarDays size={28} /><p>No hay horarios configurados ni citas en este período.</p></div>
  const hourCount = hours.endHour - hours.startHour
  const height = hourCount * 80
  return <div className={`agenda-timeline-shell agenda-timeline-${view}`}>
    <div className="agenda-timeline-header"><div className="agenda-time-gutter" />{days.map((day, index) => <button type="button" key={day} className={`agenda-day-heading ${day === today ? 'is-today' : ''}`} onClick={() => onSelectDay(day)} title={`${formatDay(day, zone)}. Cambiar a vista de día`}><strong>{view === 'week' ? weekdays[index] : formatDay(day, zone, { weekday: 'long' })}</strong><span>{formatDay(day, zone, { day: 'numeric', month: 'short' })}</span><small>{appointmentByDay.get(day)?.length || 0} {appointmentByDay.get(day)?.length === 1 ? 'cita' : 'citas'}</small></button>)}</div>
    <div className="agenda-timeline-body" style={{ '--agenda-day-count': days.length, '--agenda-timeline-height': `${height}px` }}>
      {!items.length && <p className="agenda-grid-empty">No hay citas agendadas en este período.</p>}
      <div className="agenda-time-gutter agenda-time-labels">{Array.from({ length: hourCount + 1 }, (_, index) => <span key={index} style={{ top: `${index * 80 - 9}px` }}>{String(hours.startHour + index).padStart(2, '0')}:00</span>)}</div>
      {days.map(day => <div className={`agenda-time-column ${day === today ? 'is-today' : ''}`} key={day} style={{ height }} onDoubleClick={() => onSelectDay(day)}>
        {Array.from({ length: hourCount }, (_, index) => <div className="agenda-hour-line" key={index} style={{ top: `${index * 80}px` }} />)}
        {(appointmentByDay.get(day) || []).map(({ item, start, end, lane, lanes }) => {
          const top = Math.max(0, (start - hours.startHour * 60) * pxPerMinute)
          const bottom = Math.min(height, (end - hours.startHour * 60) * pxPerMinute)
          const laneGap = 3
          return <AgendaAppointment key={item.id} item={item} zone={zone} selected={item.id === selectedId} onSelect={onSelect}
            style={{ top, height: Math.max(44, bottom - top), left: `${lane * 100 / lanes}%`, width: `calc(${100 / lanes}% - ${laneGap}px)` }} />
        })}
      </div>)}
    </div>
  </div>
}

function AgendaMonth({ days, date, zone, today, items, selectedId, onSelect, onSelectDay }) {
  const grouped = useMemo(() => {
    const map = new Map(days.map(day => [day, []]))
    for (const item of items) {
      const day = dayKey(dateMillis(item.startAt), zone)
      if (map.has(day)) map.get(day).push(item)
    }
    for (const list of map.values()) list.sort((a, b) => dateMillis(a.startAt) - dateMillis(b.startAt))
    return map
  }, [days, items, zone])
  return <div className="agenda-month-frame"><div className="agenda-month-weekdays">{weekdays.map(day => <span key={day}>{day}</span>)}</div><div className="agenda-month-grid">
    {days.map(day => {
      const appointments = grouped.get(day) || []
      return <section className={`agenda-month-cell ${day.slice(0, 7) !== date.slice(0, 7) ? 'outside-month' : ''} ${day === today ? 'is-today' : ''} ${day === date ? 'is-selected' : ''}`} key={day}>
        <button type="button" className="agenda-month-date" onClick={() => onSelectDay(day)} aria-label={`${formatDay(day, zone)}: ${appointments.length} citas`}><span>{Number(day.slice(-2))}</span></button>
        <div className="agenda-month-events">{appointments.slice(0, 3).map(item => <AgendaAppointment key={item.id} item={item} zone={zone} selected={item.id === selectedId} compact onSelect={onSelect} />)}{appointments.length > 3 && <button type="button" className="agenda-more-events" onClick={() => onSelectDay(day)}>+{appointments.length - 3} más</button>}</div>
      </section>
    })}
  </div></div>
}

function AgendaWeekMobile({ days, items, zone, today, selectedId, onSelect, onSelectDay }) {
  return <div className="agenda-week-mobile">{days.map(day => {
    const appointments = getDayIntervals(day, items, zone)
    return <section key={day} className={`agenda-week-mobile-day ${day === today ? 'is-today' : ''}`}>
      <button className="agenda-week-mobile-heading" onClick={() => onSelectDay(day)}><strong>{formatDay(day, zone)}</strong><span>{appointments.length} {appointments.length === 1 ? 'cita' : 'citas'}</span></button>
      {appointments.length ? appointments.map(({ item }) => <AgendaAppointment key={item.id} item={item} zone={zone} selected={item.id === selectedId} onSelect={onSelect} />) : <p className="agenda-empty">Sin citas programadas.</p>}
    </section>
  })}</div>
}

function AgendaSidePanel({ business, zone, date, items, selected, own, onClose, onReschedule, onViewDay }) {
  const { membership } = useAuth()
  const dayItems = items.filter(item => dayKey(dateMillis(item.startAt), zone) === date).sort((a, b) => dateMillis(a.startAt) - dateMillis(b.startAt))
  const counts = new Map()
  for (const item of dayItems) {
    const status = item.displayStatus || item.status
    counts.set(status, (counts.get(status) || 0) + 1)
  }
  return <Card className="agenda-side-panel">
    <div className="agenda-panel-heading"><div><p className="agenda-panel-eyebrow">{selected ? 'Detalle de cita' : 'Resumen del día'}</p><h2>{selected ? 'Información' : formatDay(date, zone)}</h2></div>{onClose && <button type="button" className="agenda-panel-close" aria-label="Cerrar detalle" onClick={onClose}><X size={18} /></button>}</div>
    {selected ? <div className="agenda-selected-detail">
      <h3>{selected.clientName || 'Cliente'}</h3><p className="agenda-detail-service">{selected.serviceName || 'Servicio'}</p>
      <span className={`agenda-status-pill agenda-${selected.displayStatus || selected.status}`}>{reservationStatuses[selected.displayStatus || selected.status] || 'Por confirmar'}</span>
      <dl className="agenda-detail-list">
        <div><CalendarDays size={17} /><dd>{formatAppointmentDate(selected.startAt, zone)}</dd></div>
        <div><Clock3 size={17} /><dd>{formatAppointmentDate(selected.startAt, zone, true)}{selected.endAt && ` – ${formatAppointmentDate(selected.endAt, zone, true)}`}{Number.isFinite(dateMillis(selected.endAt)) && dateMillis(selected.endAt) > dateMillis(selected.startAt) && <small>({Math.round((dateMillis(selected.endAt) - dateMillis(selected.startAt)) / 60000)} min)</small>}</dd></div>
        {selected.professionalName && <div><UserRound size={17} /><dd>{selected.professionalName}</dd></div>}
        {(selected.notes || selected.clientNotes) && <div className="agenda-detail-notes"><dd><strong>Notas</strong><span>{selected.notes || selected.clientNotes}</span></dd></div>}
      </dl>
      <div className="agenda-panel-actions"><Link className="booking-button w-full" to={`/reservas/${encodeURIComponent(selected.id)}`}>Ver detalle</Link><ReservationActions key={selected.id} reservation={selected} business={business} onReschedule={onReschedule} /></div>
    </div> : <div className="agenda-day-summary">
      <div className="agenda-summary-total"><CalendarDays size={19} /><strong>{dayItems.length}</strong><span>{dayItems.length === 1 ? 'cita' : 'citas'} en este día</span></div>
      {dayItems.length > 0 ? <><div className="agenda-summary-counts">{[...counts.entries()].map(([status, count]) => <span key={status} className={`agenda-status-pill agenda-${status}`}>{count} {reservationStatuses[status] || status}</span>)}</div><ul>{dayItems.slice(0, 4).map(item => <li key={item.id}><button type="button" onClick={() => onClose?.(item.id)}><strong>{formatAppointmentDate(item.startAt, zone, true)}</strong><span>{item.serviceName || 'Servicio'}</span><small>{item.clientName || 'Cliente'}</small></button></li>)}</ul>{dayItems.length > 4 && <p className="agenda-more-summary">Y {dayItems.length - 4} citas más.</p>}</> : <p className="agenda-empty">No hay citas programadas para este día.</p>}
      {onViewDay && <button type="button" className="booking-button secondary w-full" onClick={onViewDay}>Ver agenda del día</button>}
      {!own && membership.role === 'admin' && bookingEnabled && <Link className="booking-button w-full" to="/reservas/nueva"><Plus size={16} />Nueva reserva</Link>}
    </div>}
  </Card>
}

export default function Agenda() {
  const { membership } = useAuth()
  const { business, loading: businessLoading, error: businessError } = useBusinessReservations(null, { includeItems: false })
  const own = membership.role === 'professional'
  if (businessError) return <Alert tone="error">{businessError}</Alert>
  if (businessLoading || !business) return <p role="status">Cargando agenda…</p>
  return <AgendaView key={business.id} business={business} own={own} />
}

function AgendaView({ business, own }) {
  const [searchParams] = useSearchParams()
  const zone = business.settings?.timezone || 'America/La_Paz'
  const initialDate = searchParams.get('date')
  const validInitialDate = typeof initialDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) && Number.isFinite(Date.parse(`${initialDate}T12:00:00Z`)) && new Date(`${initialDate}T12:00:00Z`).toISOString().slice(0, 10) === initialDate
  const requestedProfessional = searchParams.get('professional') || ''
  const [date, setDate] = useState(() => validInitialDate ? initialDate : dayKey(Date.now(), zone))
  const [view, setView] = useState('week')
  const [professional, setProfessional] = useState(() => own ? '' : requestedProfessional)
  const [professionals, setProfessionals] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [editing, setEditing] = useState(false)
  const [mobileDetail, setMobileDetail] = useState(false)
  const [clockNow, setClockNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setClockNow(Date.now()), 30000); return () => clearInterval(timer) }, [])
  const today = dayKey(clockNow, zone)
  const days = useMemo(() => agendaDays(date, view), [date, view])
  const range = useMemo(() => {
    const startMs = zonedDateBoundary(days[0], zone)
    const endMs = zonedDateBoundary(addDays(days.at(-1), 1), zone)
    return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs ? { startMs, endMs } : null
  }, [days, zone])
  const { items, loading, error } = useAgendaReservations({ businessId: business.id, range, professionalId: professional })

  useEffect(() => {
    if (own) return undefined
    let active = true
    getDocs(query(collection(db, 'professionals'), where('businessId', '==', business.id))).then(snapshot => {
      if (!active) return
      const availableProfessionals = snapshot.docs.map(item => ({ id: item.id, name: item.data().displayName || item.data().name || 'Profesional' })).sort((a, b) => a.name.localeCompare(b.name, 'es'))
      setProfessionals(availableProfessionals)
      if (requestedProfessional && !availableProfessionals.some(item => item.id === requestedProfessional)) setProfessional('')
    }).catch(() => { if (active) setProfessionals([]) })
    return () => { active = false }
  }, [business.id, own, requestedProfessional])

  const selected = items.find(item => item.id === selectedId)
  const calendarItems = useMemo(() => items.filter(item => item.status !== 'cancelled' && Number.isFinite(dateMillis(item.startAt))), [items])
  const periodItems = useMemo(() => view === 'month' ? calendarItems.filter(item => dayKey(dateMillis(item.startAt), zone).slice(0, 7) === date.slice(0, 7)) : calendarItems, [calendarItems, view, zone, date])
  const periodTitle = periodLabel(date, view, days, zone)
  const stats = useMemo(() => {
    const values = new Map()
    for (const item of periodItems) {
      const status = item.displayStatus || item.status
      values.set(status, (values.get(status) || 0) + 1)
    }
    return [
      { key: 'total', label: `Total de citas ${view === 'day' ? 'del día' : view === 'week' ? 'de la semana' : 'del mes'}`, value: periodItems.length },
      ...['confirmed', 'in_progress', 'pending', 'expired', 'awaiting_closure', 'completed', 'no_show'].filter(key => values.has(key)).map(key => ({ key, label: reservationStatuses[key], value: values.get(key) })),
    ]
  }, [periodItems, view])

  function move(direction) {
    setSelectedId(null); setEditing(false); setMobileDetail(false)
    if (view === 'day') setDate(addDays(date, direction))
    else if (view === 'week') setDate(addDays(date, direction * 7))
    else setDate(addMonths(date, direction))
  }
  function selectView(nextView) { setView(nextView); setSelectedId(null); setEditing(false); setMobileDetail(false) }
  function selectDay(day) { setDate(day); setSelectedId(null); setEditing(false); setMobileDetail(false) }
  function selectAppointment(id) { setSelectedId(id); setEditing(false); setMobileDetail(true) }
  function closePanel(id) { if (id) selectAppointment(id); else { setSelectedId(null); setMobileDetail(false) } }
  const titleForDay = periodTitle

  return <div className="booking-scope agenda-page">
    <PageHeader title={own ? 'Mi agenda profesional' : 'Agenda del negocio'} description={`Reservas por día, semana y mes. Zona horaria: ${zone}. Las canceladas se consultan en Reservas.`}
      actions={<div className="agenda-header-actions">{!own && bookingEnabled && <Link className="booking-button" to="/reservas/nueva"><Plus size={16} />Nueva reserva</Link>}<div className="agenda-legend" aria-label="Leyenda de estados">{statusLegend.map(([status, label]) => <span key={status}><i className={`agenda-legend-dot agenda-${status}`} />{label}</span>)}</div></div>} />

    <section className="agenda-toolbar" aria-label="Controles de agenda">
      <div className="agenda-view-switch" role="group" aria-label="Vista de agenda">{[['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']].map(([value, label]) => <button type="button" key={value} className={`booking-button ${view === value ? '' : 'secondary'}`} aria-pressed={view === value} onClick={() => selectView(value)}>{label}</button>)}</div>
      <div className="agenda-period-controls"><button type="button" className="booking-button secondary" aria-label="Período anterior" onClick={() => move(-1)}><ChevronLeft size={17} /></button><label className="agenda-period-label"><CalendarDays size={16} /><span>{periodTitle}</span><input aria-label="Fecha de agenda" type="date" value={date} onChange={event => { if (event.target.value) { setDate(event.target.value); setSelectedId(null); setEditing(false) } }} /></label><button type="button" className="booking-button secondary" aria-label="Período siguiente" onClick={() => move(1)}><ChevronRight size={17} /></button><button type="button" className="booking-button secondary" onClick={() => { setDate(dayKey(Date.now(), zone)); setSelectedId(null); setEditing(false) }}>Hoy</button></div>
      {!own && <label className="agenda-professional-filter"><span className="sr-only">Filtrar profesional</span><select aria-label="Filtrar profesional" value={professional} onChange={event => { setProfessional(event.target.value); setSelectedId(null) }}><option value="">Todos los profesionales</option>{professionals.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    </section>

    <section className="agenda-stats" aria-label="Resumen del período">{stats.map((stat, index) => <article className={`agenda-stat ${index === 0 ? 'agenda-stat-total' : `agenda-stat-${stat.key}`}`} key={stat.key}><span className="agenda-stat-icon">{index === 0 ? <CalendarDays size={20} /> : stat.key === 'confirmed' ? <CheckCircle2 size={20} /> : stat.key === 'pending' || stat.key === 'expired' || stat.key === 'awaiting_closure' ? <Clock3 size={20} /> : stat.key === 'no_show' ? <UserRound size={20} /> : <CheckCircle2 size={20} />}</span><div><strong>{stat.value}</strong><p>{stat.label}</p></div></article>)}</section>

    {error && <Alert tone="error">{error}</Alert>}
    <section className="agenda-workspace" aria-label={`Agenda: ${titleForDay}`}>
      <div className="agenda-calendar-panel">
        {view === 'month' ? <AgendaMonth days={days} date={date} zone={zone} today={today} items={calendarItems} selectedId={selectedId} onSelect={selectAppointment} onSelectDay={selectDay} /> : view === 'week' ? <><div className="agenda-week-desktop"><AgendaTimeline days={days} items={calendarItems} business={business} zone={zone} view={view} selectedId={selectedId} today={today} onSelect={selectAppointment} onSelectDay={day => { setDate(day); selectView('day') }} /></div><AgendaWeekMobile days={days} items={calendarItems} zone={zone} today={today} selectedId={selectedId} onSelect={selectAppointment} onSelectDay={day => { setDate(day); selectView('day') }} /></> : <><div className="agenda-day-title"><h2>{periodTitle}</h2></div><AgendaTimeline days={days} items={calendarItems} business={business} zone={zone} view={view} selectedId={selectedId} today={today} onSelect={selectAppointment} onSelectDay={selectDay} /></>}
        {loading && <p className="agenda-loading" role="status">Actualizando citas del período…</p>}
      </div>
      <aside className={`agenda-mobile-panel ${mobileDetail ? 'is-open' : ''}`} aria-label="Detalles de cita"><AgendaSidePanel business={business} zone={zone} date={date} items={calendarItems} selected={selected} own={own} onClose={closePanel} onReschedule={() => setEditing(true)} onViewDay={() => selectView('day')} /></aside>
    </section>
    {editing && selected && <EditorDialog title="Reprogramar cita" onClose={() => setEditing(false)}><BookingFlow business={business} reservation={selected} onSuccess={() => { setEditing(false); setSelectedId(null) }} /></EditorDialog>}
    {own && <AssignedServices businessId={business.id} />}
  </div>
}

function AssignedServices({ businessId }) {
  const [items, setItems] = useState(null), [error, setError] = useState('')
  useEffect(() => { let active = true; bookingRequest({ action: 'options', businessId }).then(response => { if (active) setItems(response.services) }).catch(failure => { if (active) setError(failure.message) }); return () => { active = false } }, [businessId])
  return <section className="booking-panel assigned-services"><div className="assigned-services-heading"><span className="assigned-services-symbol"><BriefcaseBusiness size={23} aria-hidden="true" /></span><div><h2>Mis servicios asignados</h2><p>Estos son los servicios que puedes atender en este negocio.</p></div>{items && <span className="assigned-services-count">{items.length} {items.length === 1 ? 'servicio' : 'servicios'}</span>}</div>{error && <Alert tone="error">{error}</Alert>}{!items && !error && <p role="status" className="panel-loading">Cargando servicios…</p>}{items && !error && <DataList label="Servicios asignados" items={items}>{rows => <ul className="assigned-services-grid">{rows.map(service => <li key={service.id} className="assigned-service-card"><span className="assigned-service-icon"><BriefcaseBusiness size={20} aria-hidden="true" /></span><div><h3>{service.name}</h3><span className="assigned-service-duration"><Clock3 size={14} aria-hidden="true" />{service.durationMinutes} minutos</span></div></li>)}</ul>}</DataList>}</section>
}
