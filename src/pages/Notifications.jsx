import { useMemo, useState } from 'react'
import { ArrowUpDown, ArrowUpRight, Bell, CalendarDays, Check, CheckCheck, CircleX, Clock3, ExternalLink, RefreshCw, Search, Settings2, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import DataList from '../components/ui/DataList'
import PageHeader from '../components/ui/PageHeader'
import Alert from '../components/ui/Alert'
import useNotifications from '../hooks/useNotifications'
import { useAuth } from '../context/auth-context'
import { useClientBusiness } from '../context/client-context'
import { addDays, dayKey, zonedDateBoundary } from '../lib/calendarDates'
import { dateMillis, formatAppointmentDate, reservationStatuses } from '../lib/clientPresentation'
import '../components/booking/booking.css'
import './notifications.css'

function categoryOf(item) {
  if (item.type === 'reminder') return 'reminder'
  const title = `${item.title || ''} ${item.message || ''}`.toLocaleLowerCase('es')
  if (/cancel/.test(title)) return 'cancelled'
  if (/finaliz|complet/.test(title)) return 'completed'
  if (/reprogram|horario|cambio de fecha/.test(title)) return 'rescheduled'
  if (/confirm/.test(title)) return 'confirmed'
  if (/solicit|pendiente/.test(title)) return 'requested'
  return item.type === 'change' ? 'change' : item.type || 'other'
}

const categoryLabels = {
  reminder: 'Recordatorio', confirmed: 'Confirmación', cancelled: 'Cancelación',
  completed: 'Finalización', rescheduled: 'Reprogramación', requested: 'Solicitud', change: 'Cambio',
  block: 'Disponibilidad', waitlist: 'Lista de espera', other: 'Aviso',
}
const categoryIcons = {
  reminder: Clock3, confirmed: CalendarDays, cancelled: CircleX, completed: CheckCheck,
  rescheduled: ArrowUpDown, requested: Bell, change: Bell, block: CalendarDays, waitlist: Bell, other: Bell,
}
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
const eventMillis = item => dateMillis(item.appointmentStartAt || item.createdAt || item.visibleAt)
const noticeMillis = item => dateMillis(item.visibleAt || item.createdAt)

function ClientNotifications() {
  const { business } = useClientBusiness()
  const { items, now, error, busy, markingId, markRead, markAllRead, reload, loading } = useNotifications()
  const zone = business?.settings?.timezone || 'America/La_Paz'
  const [readFilter, setReadFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('recent')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [appliedRange, setAppliedRange] = useState(null)
  const [quickRange, setQuickRange] = useState('all')
  const [rangeError, setRangeError] = useState('')

  const categories = useMemo(() => [...new Set(items.map(categoryOf))], [items])
  const unread = items.filter(item => !item.read)
  const stats = [
    { label: 'Total de avisos', value: items.length, icon: Bell, tone: 'brand' },
    { label: 'Sin leer', value: unread.length, icon: ShieldCheck, tone: 'unread' },
    { label: 'Confirmaciones', value: items.filter(item => categoryOf(item) === 'confirmed').length, icon: Check, tone: 'success' },
    { label: 'Recordatorios', value: items.filter(item => categoryOf(item) === 'reminder').length, icon: Clock3, tone: 'reminder' },
  ]

  function applyRange(from = dateFrom, to = dateTo) {
    setRangeError('')
    if (!from && !to) { setAppliedRange(null); setQuickRange('all'); return }
    if (!from || !to) { setRangeError('Selecciona ambas fechas para aplicar el rango.'); return }
    if (from > to) { setRangeError('La fecha inicial debe ser anterior o igual a la fecha final.'); return }
    const start = zonedDateBoundary(from, zone)
    const end = zonedDateBoundary(addDays(to, 1), zone)
    if (!Number.isFinite(start) || !Number.isFinite(end)) { setRangeError('No se pudo interpretar el rango de fechas.'); return }
    setAppliedRange({ from, to, start, end })
    setDateFrom(from)
    setDateTo(to)
    setQuickRange(from === to && from === dayKey(now, zone) ? 'today' : 'custom')
  }

  function applyPreset(preset) {
    const today = dayKey(now, zone)
    if (preset === 'all') { setDateFrom(''); setDateTo(''); setAppliedRange(null); setRangeError(''); setQuickRange('all'); return }
    const from = preset === 'today' ? today
      : preset === 'week' ? addDays(today, -6)
        : `${today.slice(0, 7)}-01`
    setDateFrom(from)
    setDateTo(today)
    setQuickRange(preset)
    applyRange(from, today)
  }

  const filtered = items.filter(item => {
    if (readFilter === 'unread' && item.read) return false
    if (readFilter === 'read' && !item.read) return false
    if (typeFilter !== 'all' && categoryOf(item) !== typeFilter) return false
    if (appliedRange) {
      const stamp = eventMillis(item)
      if (!Number.isFinite(stamp) || stamp < appliedRange.start || stamp >= appliedRange.end) return false
    }
    const service = item.serviceName || (item.type === 'change' ? item.message?.split(' · ')[0] : '') || ''
    const professional = item.professionalName || (item.type === 'change' ? item.message?.split(' · ')[1] : '') || ''
    const searchable = normalize([item.title, item.message, service, professional, item.status && reservationStatuses[item.status], item.read ? 'Leído' : 'No leído'].join(' '))
    return normalize(search).split(/\s+/).filter(Boolean).every(word => searchable.includes(word))
  }).sort((a, b) => (sort === 'recent' ? -1 : 1) * (noticeMillis(a) - noticeMillis(b)))

  function clearFilters() {
    setReadFilter('all'); setTypeFilter('all'); setSearch(''); setSort('recent')
    setDateFrom(''); setDateTo(''); setAppliedRange(null); setQuickRange('all'); setRangeError('')
  }

  return <section className="client-notifications" aria-labelledby="notifications-title">
    <div className="notice-page-heading">
      <div><span className="client-overline"><Bell size={14} aria-hidden="true" />CENTRO DE NOTIFICACIONES</span><h1 id="notifications-title">Avisos y recordatorios</h1><p>Sigue los cambios de tus citas y los recordatorios en un solo lugar.</p></div>
      <button className="notice-settings" type="button" onClick={reload} disabled={loading || busy}><Settings2 size={17} />{loading ? 'Actualizando…' : 'Actualizar avisos'}</button>
    </div>
    {error && <Alert tone="error">{error}</Alert>}
    {loading && !error && <p className="client-loading" role="status">Cargando tus avisos…</p>}
    {!loading && !error && <>
      <section className="notice-stats" aria-label="Resumen de avisos">
        {stats.map(({ label, value, icon: Icon, tone }) => <article className={`notice-stat notice-${tone}`} key={label}><span><Icon size={21} aria-hidden="true" /></span><div><strong>{value}</strong><p>{label}</p></div></article>)}
      </section>
      <section className="notice-filters" aria-label="Filtros de avisos">
        <label className="notice-search"><span>Buscar avisos</span><span className="notice-input-wrap"><Search size={17} aria-hidden="true" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Servicio, profesional o palabra clave…" /></span></label>
        <label className="notice-control"><span>Lectura</span><select aria-label="Filtrar por lectura" value={readFilter} onChange={event => setReadFilter(event.target.value)}><option value="all">Todos los avisos</option><option value="unread">No leídos</option><option value="read">Leídos</option></select></label>
        <label className="notice-control"><span>Tipo</span><select aria-label="Filtrar por tipo" value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="all">Todos los tipos</option>{categories.map(category => <option key={category} value={category}>{categoryLabels[category] || 'Aviso'}</option>)}</select></label>
        <label className="notice-control notice-date-control"><span>Rango de fechas</span><span className="notice-date-fields"><input aria-label="Fecha desde" type="date" value={dateFrom} onChange={event => { setDateFrom(event.target.value); setQuickRange('custom') }} /><span aria-hidden="true">→</span><input aria-label="Fecha hasta" type="date" value={dateTo} onChange={event => { setDateTo(event.target.value); setQuickRange('custom') }} /></span></label>
        <div className="notice-filter-bottom">
          <div className="notice-presets" role="group" aria-label="Rangos rápidos">{[['today', 'Hoy'], ['week', 'Últimos 7 días'], ['month', 'Este mes'], ['custom', 'Personalizado']].map(([id, label]) => <button key={id} type="button" aria-pressed={quickRange === id} onClick={() => id === 'custom' ? setQuickRange('custom') : applyPreset(id)}>{label}</button>)}</div>
          {rangeError && <p role="alert" className="notice-range-error">{rangeError}</p>}
          <div className="notice-filter-actions"><button className="notice-clear" type="button" onClick={clearFilters}><RefreshCw size={15} />Limpiar filtros</button><button className="public-button" type="button" onClick={() => applyRange()}><Search size={16} />Aplicar filtros</button></div>
        </div>
      </section>
      <div className="notice-list-heading"><h2>Lista de avisos</h2><label>Ordenar por<select aria-label="Ordenar avisos" value={sort} onChange={event => setSort(event.target.value)}><option value="recent">Fecha (más reciente)</option><option value="oldest">Fecha (más antigua)</option></select></label></div>
      {unread.length > 0 && <div className="notice-mark-all"><span>{unread.length} {unread.length === 1 ? 'aviso sin leer' : 'avisos sin leer'}</span><button type="button" className="notice-mark-all-button" disabled={busy} onClick={markAllRead}>{markingId === '*' ? 'Marcando…' : <><CheckCheck size={16} />Marcar todos como leídos</>}</button></div>}
      {items.length === 0 ? <div className="notice-empty"><span><Bell size={23} aria-hidden="true" /></span><h2>Aún no tienes avisos</h2><p>Aquí aparecerán las actualizaciones y recordatorios de tus citas.</p></div>
        : <DataList label="avisos" items={filtered} search={false} resetKey={`${readFilter}:${typeFilter}:${search}:${sort}:${appliedRange?.from || ''}:${appliedRange?.to || ''}`}>
          {rows => <div className="notice-list">{rows.map(item => {
            const category = categoryOf(item)
            const Icon = categoryIcons[category] || Bell
            const service = item.serviceName || (item.type === 'change' ? item.message?.split(' · ')[0] : '') || item.title?.replace(/^Recordatorio:\s*/i, '') || 'Tu cita'
            const professional = item.professionalName || (item.type === 'change' ? item.message?.split(' · ')[1] : '') || ''
            const related = Boolean(item.reservationId)
            const appointmentDate = item.appointmentStartAt || item.expiresAt || item.createdAt || item.visibleAt
            const status = item.status && reservationStatuses[item.status]
            return <article key={item.id} className={`notice-row ${item.read ? 'is-read' : 'is-unread'} notice-row-${category}`}>
              <span className="notice-row-icon"><Icon size={21} aria-hidden="true" /></span>
              <div className="notice-copy"><h3>{item.title || 'Actualización de tu cita'} {!item.read && <span className="notice-new">Nuevo</span>}</h3><p className="notice-meta">{service}{professional ? ` · ${professional}` : ''}</p><p className="notice-message">{item.message}</p></div>
              <div className="notice-appointment-date"><span><CalendarDays size={14} aria-hidden="true" />{formatAppointmentDate(appointmentDate, zone)}</span><span><Clock3 size={14} aria-hidden="true" />{formatAppointmentDate(appointmentDate, zone, true)}</span></div>
              <div className="notice-row-state"><span className="notice-category">{categoryLabels[category] || 'Aviso'}</span>{status && <small>{status}</small>}</div>
              <div className="notice-row-actions">{related && <Link className="notice-view" to={`/cliente/reservas/${encodeURIComponent(item.reservationId)}`} onClick={() => { if (!item.read) markRead(item.id) }}><ExternalLink size={14} />Ver cita</Link>}{!item.read && <button className="notice-mark-read" type="button" disabled={busy} onClick={() => markRead(item.id)} aria-label={`Marcar como leído: ${item.title || 'aviso'}`}>{markingId === item.id ? 'Guardando…' : <><Check size={15} />Marcar leído</>}</button>}</div>
              {!item.read && <span className="notice-unread-dot" aria-label="No leído" />}
            </article>
          })}</div>}
        </DataList>}
    </>}
  </section>
}

export default function Notifications() {
  const { membership } = useAuth()
  if (membership.role === 'client') return <ClientNotifications />
  return <StaffNotifications />
}

function StaffNotifications() {
  const { items, error, busy, markingId, markRead, reload, loading } = useNotifications()
  const base = ''
  return <section className="booking-scope space-y-4"><PageHeader title="Avisos y recordatorios" description="Sigue los cambios de tus citas y los recordatorios en un solo lugar." /><button className="booking-button secondary" disabled={loading || busy} onClick={reload}>{loading ? 'Conectando con el servidor…' : 'Actualizar avisos'}</button>
    {error && <Alert tone="error">{error}</Alert>}{loading && !error && <p role="status" className="panel-loading">Cargando avisos…</p>}
    {!loading && !error && items.length === 0 && <div className="panel-empty"><Bell size={28} aria-hidden="true" /><div><h2>No tienes avisos por ahora.</h2><p>Aquí aparecerán los cambios y recordatorios de tus citas.</p></div></div>}
    {items.length > 0 && <DataList label="Avisos" items={items || []} searchText={n => `${n.title} ${n.message} ${n.read ? 'Leído' : 'Nuevo'}`}>{rows => <>{rows.map(n => <article key={n.id} className={`booking-panel admin-notification ${n.read ? 'is-read' : 'is-new'}`}><span className="admin-notification-icon"><Bell size={21} aria-hidden="true" /></span><h2>{n.title} {!n.read && <small>· Nuevo</small>}</h2><p>{n.message}</p><div className="flex gap-4 flex-wrap">{n.reservationId && <Link to={`${base}/reservas/${encodeURIComponent(n.reservationId)}`} className="booking-button secondary"><ArrowUpRight size={15} />Ver cita</Link>}{!n.read && <button className="booking-button secondary" disabled={busy} onClick={() => markRead(n.id)}><CheckCheck size={15} />{markingId === n.id ? 'Guardando…' : 'Marcar como leído'}</button>}</div></article>)}</>}</DataList>}
  </section>
}
