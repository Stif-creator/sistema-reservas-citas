import { useContext, useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import useBusinessReservations from '../hooks/useBusinessReservations'
import useReservationById from '../hooks/useReservationById'
import useReservationPage, { useReservationCounts } from '../hooks/useReservationPage'
import { ListSearchContext } from '../context/list-search-context'
import { db } from '../firebase/config'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import Alert from '../components/ui/Alert'
import BookingFlow from '../components/booking/BookingFlow'
import BookingSummary from '../components/booking/BookingSummary'
import ReservationActions from '../components/booking/ReservationActions'
import { bookingEnabled } from '../lib/bookingApi'
import { dateMillis, formatAppointmentDate, reservationStatuses } from '../lib/clientPresentation'
import { addDays, dayKey, zonedDateBoundary } from '../lib/calendarDates'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleX, Clock3, ListChecks, RotateCcw, Search, UserRoundX } from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import './reservations.css'

function monthBounds(today) {
  const first = `${today.slice(0, 7)}-01`
  const nextMonth = new Date(`${first}T00:00:00Z`)
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1)
  return { from: first, to: addDays(nextMonth.toISOString().slice(0, 10), -1) }
}

function localRange(from, to, zone) {
  const start = zonedDateBoundary(from, zone)
  const end = zonedDateBoundary(addDays(to, 1), zone)
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? { start: Timestamp.fromMillis(start), end: Timestamp.fromMillis(end) }
    : null
}

const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function Reservations({ detail = false, manual = false }) {
  const { membership } = useAuth()
  const { reservationId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const pageSearch = useContext(ListSearchContext)
  const [appliedRange, setAppliedRange] = useState(null)
  const [dateFrom, setDateFrom] = useState(''), [dateTo, setDateTo] = useState('')
  const [status, setStatus] = useState(() => params.get('estado') || '')
  const [serviceId, setServiceId] = useState(''), [professionalId, setProfessionalId] = useState('')
  const [sort, setSort] = useState('recent'), [pageSize, setPageSize] = useState(25), [pageCursors, setPageCursors] = useState([null])
  const [search, setSearch] = useState(''), [rangeError, setRangeError] = useState(''), [quickRange, setQuickRange] = useState('all')
  const [editing, setEditing] = useState(false), [now, setNow] = useState(Date.now)
  const [filterOptions, setFilterOptions] = useState({ services: [], professionals: [] })
  const listMode = !detail && !manual
  const { business, loading: businessLoading, error: businessError } = useBusinessReservations(null, { includeItems: false })
  const { item, loading: detailLoading, error: detailError } = useReservationById(detail ? reservationId : null)
  const { values: totals, loading: totalsLoading, error: totalsError } = useReservationCounts({ enabled: listMode })
  const cursor = pageCursors.at(-1) || null
  const pageData = useReservationPage({ enabled: listMode, range: appliedRange?.query, status, serviceId, professionalId, sort, closuresOnly: params.has('cierre'), cursor, now, pageSize })

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    if (!listMode || !business?.id) return undefined
    let active = true
    const serviceQuery = getDocs(query(collection(db, 'services'), where('businessId', '==', business.id)))
    const professionalQuery = membership.role === 'admin'
      ? getDocs(query(collection(db, 'professionals'), where('businessId', '==', business.id)))
      : Promise.resolve(null)
    Promise.all([serviceQuery, professionalQuery]).then(([services, professionals]) => {
      if (!active) return
      setFilterOptions({
        services: services.docs.map(document => ({ id: document.id, name: document.data().name })).filter(item => item.name),
        professionals: professionals?.docs.map(document => ({ id: document.id, name: document.data().displayName || document.data().name })).filter(item => item.name) || [],
      })
    }).catch(() => { if (active) setFilterOptions({ services: [], professionals: [] }) })
    return () => { active = false }
  }, [listMode, business?.id, membership.role])

  const zone = business?.settings?.timezone || 'America/La_Paz'
  const today = dayKey(now, zone)
  const resetPage = () => setPageCursors([null])
  const applyRange = (from, to, label = 'custom') => {
    setRangeError('')
    setDateFrom(from); setDateTo(to); setQuickRange(label)
    if (!from && !to) { setAppliedRange({ from: '', to: '', query: null }); resetPage(); return }
    if (!from || !to) { setRangeError('Selecciona las dos fechas del rango.'); return }
    if (!Number.isFinite(zonedDateBoundary(from, zone)) || !Number.isFinite(zonedDateBoundary(to, zone))) { setRangeError('Ingresa fechas válidas.'); return }
    if (from > to) { setRangeError('La fecha desde no puede ser posterior a la fecha hasta.'); return }
    const queryRange = localRange(from, to, zone)
    if (!queryRange) { setRangeError('No se pudo interpretar el rango en la zona horaria del negocio.'); return }
    setAppliedRange({ from, to, query: queryRange }); resetPage()
  }
  const quick = preset => {
    if (preset === 'today') applyRange(today, today, preset)
    if (preset === 'week') applyRange(addDays(today, -6), today, preset)
    if (preset === 'month') applyRange(...Object.values(monthBounds(today)), preset)
    if (preset === 'all') applyRange('', '', preset)
  }
  const statusLabel = status ? reservationStatuses[status] || status : ''
  const serviceName = filterOptions.services.find(option => option.id === serviceId)?.name
  const professionalName = filterOptions.professionals.find(option => option.id === professionalId)?.name
  const activeFilters = [
    appliedRange?.from && appliedRange?.to ? `${appliedRange.from} – ${appliedRange.to}` : '', statusLabel,
    serviceName, professionalName, params.has('cierre') ? 'Pendientes de cierre' : '', sort === 'oldest' ? 'Más antiguas primero' : '',
  ].filter(Boolean)
  const visibleRows = useMemo(() => {
    const words = normalize(`${pageSearch || ''} ${search}`).trim().split(/\s+/).filter(Boolean)
    return pageData.items.filter(record => {
      const text = normalize(`${record.serviceName} ${record.clientName} ${record.clientEmail || ''} ${record.clientPhone || ''} ${record.professionalName} ${reservationStatuses[record.displayStatus || record.status]} ${formatAppointmentDate(record.startAt, zone)}`)
      return words.every(word => text.includes(word))
    })
  }, [pageData.items, pageSearch, search, zone])

  if (businessError) return <Alert tone="error">{businessError}</Alert>
  if (businessLoading) return <p role="status">Cargando los datos del negocio…</p>

  if (manual) return <div className="space-y-6 booking-scope manual-reservation-page">
    <PageHeader title="Reserva manual" description="Agenda una cita solicitada por teléfono o presencialmente." actions={<Link className="booking-button secondary" to="/reservas"><CalendarDays size={16} />Volver a reservas</Link>} />
    <div className="manual-reservation-intro"><span><CalendarDays size={21} /></span><div><h2>Agenda para un cliente</h2><p>Elige el servicio, profesional y horario. El sistema vuelve a comprobar disponibilidad antes de guardar.</p></div></div>
    <BookingFlow business={business} manual onSuccess={result => navigate(`/reservas/${result.id}`, { replace: true })} />
  </div>

  if (detail) return <div className="space-y-6 booking-scope">
    <Link className="text-sm text-primary underline" to="/reservas">← Volver a reservas</Link>
    <PageHeader title="Detalle de reserva" description={item ? `Estado: ${reservationStatuses[item.displayStatus || item.status] || 'Por confirmar'}` : 'Reserva no disponible.'} />
    {detailLoading ? <p role="status">Cargando reserva…</p> : item ? (editing ? <><BookingFlow key={item.id} business={business} reservation={item} onSuccess={() => setEditing(false)} /><button className="booking-button secondary" onClick={() => setEditing(false)}>Volver al detalle</button></> : <>
      <div className="grid gap-6 lg:grid-cols-2"><BookingSummary service={{ name: item.serviceName || 'Servicio reservado' }} professional={{ displayName: item.professionalName || 'Profesional asignado' }} slot={{ start: dateMillis(item.startAt) }} quote={item} timeZone={zone} />
        <Card title="Cliente"><dl className="space-y-3 text-sm"><div><dt className="text-muted">Nombre</dt><dd>{item.clientName || 'Cliente'}</dd></div><div><dt className="text-muted">Correo</dt><dd className="break-all">{item.clientEmail || 'Sin correo'}</dd></div><div><dt className="text-muted">Teléfono</dt><dd>{item.clientPhone || 'Sin teléfono'}</dd></div><div><dt className="text-muted">Notas</dt><dd>{item.notes || 'Sin notas'}</dd></div><div><dt className="text-muted">Origen</dt><dd>{item.source === 'manual' ? 'Reserva manual' : 'Panel del cliente'}</dd></div></dl></Card></div>
      <ReservationActions reservation={item} business={business} onReschedule={() => setEditing(true)} />
    </>) : <Alert tone="error">{detailError || 'Reserva no disponible.'}</Alert>}
  </div>

  const counts = totals || { total: null, confirmed: null, completed: null, cancelled: null, noShow: null }
  const stats = [
    { label: 'Total de reservas', value: counts.total, note: 'Histórico del negocio', icon: ListChecks, tone: 'purple' },
    { label: 'Confirmadas', value: counts.confirmed, note: 'Estado guardado', icon: CheckCircle2, tone: 'green' },
    { label: 'Finalizadas', value: counts.completed, note: 'Estado guardado', icon: Clock3, tone: 'blue' },
    { label: 'Canceladas', value: counts.cancelled, note: 'Estado guardado', icon: CircleX, tone: 'red' },
    { label: 'No asistidas', value: counts.noShow, note: 'Estado guardado', icon: UserRoundX, tone: 'gray' },
  ]
  const resultStart = pageData.items.length ? (pageCursors.length - 1) * pageSize + 1 : 0
  const resultEnd = resultStart ? resultStart + pageData.items.length - 1 : 0

  return <div className="space-y-6 booking-scope reservation-page">
    <PageHeader title="Reservas" description={membership.role === 'professional' ? 'Gestiona el estado de tus citas asignadas.' : 'Consulta y gestiona las citas de tu negocio.'}
      actions={membership.role === 'admin' && bookingEnabled && <Link className="booking-button" to="/reservas/nueva"><CalendarDays size={17} />Reserva manual</Link>} />
    {!bookingEnabled && <Alert>Las reservas en línea todavía no están habilitadas.</Alert>}
    {totalsError && <Alert tone="error">{totalsError}</Alert>}
    <div className="reservation-stats">{stats.map(({ label, value, note, icon: Icon, tone }) => <article className={`reservation-stat tone-${tone}`} key={label}><span aria-hidden="true"><Icon size={21} /></span><div><strong>{totalsLoading ? '…' : value ?? '—'}</strong><p>{label}</p><small>{note}{membership.role === 'professional' ? ' · mis reservas' : ''}</small></div></article>)}</div>
    <Card>
      {params.has('cierre') && <div className="reservation-closure-notice"><span>Vista de reservas pendientes de cierre.</span><button type="button" className="booking-button secondary" onClick={() => { const next = new URLSearchParams(params); next.delete('cierre'); setParams(next); resetPage() }}><ListChecks size={15} />Mostrar todas las reservas</button></div>}
      <section className="reservation-filters" aria-labelledby="reservation-filters-title">
        <div className="reservation-filter-heading"><div><h2 id="reservation-filters-title">Filtros de búsqueda</h2><p>Combina fechas y criterios para localizar citas.</p></div><button type="button" className="booking-button secondary" onClick={() => { setDateFrom(''); setDateTo(''); setStatus(''); setServiceId(''); setProfessionalId(''); setSort('recent'); setQuickRange('all'); setRangeError(''); setAppliedRange(null); setParams({}); resetPage() }}><RotateCcw size={15} />Limpiar filtros</button></div>
        <div className="reservation-quick-filters" role="group" aria-label="Rangos rápidos">{[['today', 'Hoy'], ['week', 'Últimos 7 días'], ['month', 'Este mes']].map(([id, label]) => <button type="button" key={id} aria-pressed={quickRange === id} onClick={() => quick(id)}>{label}</button>)}<button type="button" aria-pressed={quickRange === 'custom'} onClick={() => setQuickRange('custom')}>Personalizado</button></div>
        <div className="reservation-filter-grid reservation-primary-filters">
          <label className="booking-field">Fecha desde<input aria-label="Fecha desde" type="date" value={dateFrom} onChange={event => { setDateFrom(event.target.value); setQuickRange('custom') }} /></label>
          <label className="booking-field">Fecha hasta<input aria-label="Fecha hasta" type="date" value={dateTo} onChange={event => { setDateTo(event.target.value); setQuickRange('custom') }} /></label>
          <label className="booking-field">Estado<select aria-label="Estado" value={status} onChange={event => { setStatus(event.target.value); resetPage() }}><option value="">Todos</option>{Object.entries(reservationStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <div className="reservation-apply-inline"><button className="booking-button" type="button" onClick={() => applyRange(dateFrom, dateTo)}><CalendarDays size={16} />Aplicar filtros</button></div>
        </div>
        <details className="reservation-advanced-filters"><summary>Filtros avanzados{(serviceId || professionalId || sort !== 'recent') && <span>Activos</span>}</summary><div className="reservation-filter-grid">
          <label className="booking-field">Servicio<select aria-label="Servicio" value={serviceId} onChange={event => { setServiceId(event.target.value); resetPage() }}><option value="">Todos</option>{filterOptions.services.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
          {membership.role === 'admin' && <label className="booking-field">Profesional<select aria-label="Profesional" value={professionalId} onChange={event => { setProfessionalId(event.target.value); resetPage() }}><option value="">Todos</option>{filterOptions.professionals.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>}
          <label className="booking-field">Ordenar por<select aria-label="Ordenar por" value={sort} onChange={event => { setSort(event.target.value); resetPage() }}><option value="recent">Fecha (más reciente)</option><option value="oldest">Fecha (más antigua)</option></select></label>
        </div></details>
        <div className="reservation-filter-meta"><p className="reservation-timezone">Zona horaria del negocio: <strong>{zone}</strong></p>{rangeError && <p className="reservation-range-error" role="alert">{rangeError}</p>}{activeFilters.length > 0 && <div className="reservation-active-filters" aria-label="Filtros activos">{activeFilters.map((filter, index) => <span key={`${filter}-${index}`}>{filter}</span>)}</div>}</div>
        {pageData.countError && <p className="reservation-range-error" role="alert">{pageData.countError}</p>}
      </section>
      <div className="reservation-results-heading"><div><h2>Resultados</h2><span>{pageData.countLoading ? 'Calculando…' : `${pageData.totalFiltered ?? '—'} ${pageData.totalFiltered === 1 ? 'reserva' : 'reservas'} con estos filtros`}</span></div><label className="reservation-search"><Search size={15} /><input aria-label="Buscar en la página actual" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar en esta página" /></label><label className="reservation-page-size">Por página<select aria-label="Registros por página" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); resetPage() }}>{[10, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}</select></label></div>
      {pageData.error && <Alert tone="error">{pageData.error}</Alert>}
      {pageData.loading ? <p role="status" className="reservation-loading">Cargando la página de reservas…</p> : pageData.items.length === 0 ? <p className="reservation-empty" role="status">No hay reservas para estos filtros.</p> : visibleRows.length === 0 ? <p className="reservation-empty" role="status">No hay coincidencias en esta página. La búsqueda local solo revisa los registros cargados.</p> : <>
        <p className="reservation-page-note">La búsqueda local revisa esta página; los filtros y el orden se aplican en Firestore.</p>
        <div className="reservation-table-wrap"><table className="reservation-table"><thead><tr><th>Fecha y hora</th><th>Servicio</th><th>Cliente</th><th>Profesional</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
          {visibleRows.map(record => <tr key={record.id}><td><strong>{formatAppointmentDate(record.startAt, zone)}</strong><span>{formatAppointmentDate(record.startAt, zone, true)}</span></td><td><strong>{record.serviceName || 'Servicio'}</strong>{Number.isFinite(record.price) && <span>{new Intl.NumberFormat('es-BO', { style: 'currency', currency: record.currencyCode || 'BOB' }).format(record.price)}</span>}</td><td><strong>{record.clientName || 'Cliente'}</strong><span>{record.clientEmail || record.clientPhone || 'Sin contacto'}</span></td><td>{record.professionalName || 'Profesional'}</td><td><span className={`reservation-status status-${record.displayStatus || record.status}`}><i aria-hidden="true" />{reservationStatuses[record.displayStatus || record.status] || 'Por confirmar'}</span></td><td><Link className="booking-button secondary reservation-detail-link" to={`/reservas/${encodeURIComponent(record.id)}`}>Ver detalle</Link></td></tr>)}
        </tbody></table></div>
        <div className="reservation-mobile-list">{visibleRows.map(record => <article className="reservation-mobile-card" key={record.id}><div className="reservation-mobile-card-head"><div><strong>{formatAppointmentDate(record.startAt, zone)}</strong><span>{formatAppointmentDate(record.startAt, zone, true)}</span></div><span className={`reservation-status status-${record.displayStatus || record.status}`}><i aria-hidden="true" />{reservationStatuses[record.displayStatus || record.status] || 'Por confirmar'}</span></div><h3>{record.clientName || 'Cliente'}</h3><p>{record.serviceName || 'Servicio'}{record.professionalName ? ` · ${record.professionalName}` : ''}</p><Link className="booking-button secondary reservation-detail-link" to={`/reservas/${encodeURIComponent(record.id)}`}>Ver detalle</Link></article>)}</div>
      </>}
      <div className="reservation-server-pagination"><span>{resultStart ? `Página ${pageCursors.length} · ${resultStart}–${resultEnd} de ${pageData.totalFiltered ?? '—'}` : `Página ${pageCursors.length} · 0 de ${pageData.totalFiltered ?? '—'}`}</span><div><button type="button" className="booking-button secondary" disabled={pageCursors.length <= 1 || pageData.loading} onClick={() => setPageCursors(current => current.slice(0, -1))}><ChevronLeft size={15} />Anterior</button><button type="button" className="booking-button secondary" disabled={!pageData.hasNext || pageData.loading} onClick={() => pageData.nextCursor && setPageCursors(current => [...current, pageData.nextCursor])}>Siguiente<ChevronRight size={15} /></button></div></div>
    </Card>
  </div>
}
