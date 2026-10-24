import DataList from '../components/ui/DataList'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import useBusinessReservations from '../hooks/useBusinessReservations'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import Alert from '../components/ui/Alert'
import BookingFlow from '../components/booking/BookingFlow'
import BookingSummary from '../components/booking/BookingSummary'
import ReservationActions from '../components/booking/ReservationActions'
import { bookingEnabled } from '../lib/bookingApi'
import { dateMillis, formatAppointmentDate, reservationStatuses } from '../lib/clientPresentation'
import { addDays, dayKey, zonedDateBoundary } from '../lib/calendarDates'
import { CalendarDays, CheckCircle2, CircleX, Clock3, ListChecks, RotateCcw, UserRoundX } from 'lucide-react'
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

export default function Reservations({ detail = false, manual = false }) {
  const { membership } = useAuth()
  const [appliedRange, setAppliedRange] = useState(null)
  const { business, items, loading, rangeFallback, error } = useBusinessReservations(!detail && !manual ? appliedRange?.query || null : null)
  const { reservationId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [status, setStatus] = useState(() => params.get('estado') || '')
  const [serviceId, setServiceId] = useState('')
  const [professionalId, setProfessionalId] = useState('')
  const [sort, setSort] = useState('recent')
  const [rangeError, setRangeError] = useState('')
  const [quickRange, setQuickRange] = useState('all')
  const [editing, setEditing] = useState(false)
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer) }, [])
  if (error) return <Alert tone="error">{error}</Alert>
  if (loading) return <p role="status">Cargando reservas…</p>
  const item = items.find(value => value.id === reservationId)
  const zone = business.settings?.timezone || 'America/La_Paz'
  const today = dayKey(now, zone)
  const applyRange = (from, to, label = 'custom') => {
    setRangeError('')
    setDateFrom(from); setDateTo(to); setQuickRange(label)
    if (!from && !to) { setAppliedRange({ from: '', to: '', query: null }); return }
    if (!from || !to) { setRangeError('Selecciona las dos fechas del rango.'); return }
    if (!Number.isFinite(zonedDateBoundary(from, zone)) || !Number.isFinite(zonedDateBoundary(to, zone))) { setRangeError('Ingresa fechas válidas.'); return }
    if (from > to) { setRangeError('La fecha desde no puede ser posterior a la fecha hasta.'); return }
    const query = localRange(from, to, zone)
    if (!query) { setRangeError('No se pudo interpretar el rango en la zona horaria del negocio.'); return }
    setAppliedRange({ from, to, query })
  }
  const quick = (preset) => {
    setQuickRange(preset)
    if (preset === 'today') applyRange(today, today, preset)
    if (preset === 'week') applyRange(addDays(today, -6), today, preset)
    if (preset === 'month') applyRange(...Object.values(monthBounds(today)), preset)
  }
  if (manual) return <div className="space-y-6 booking-scope manual-reservation-page">
    <PageHeader title="Reserva manual" description="Agenda una cita solicitada por teléfono o presencialmente." actions={<Link className="booking-button secondary" to="/reservas"><CalendarDays size={16} />Volver a reservas</Link>} />
    <div className="manual-reservation-intro"><span><CalendarDays size={21} /></span><div><h2>Agenda para un cliente</h2><p>Elige el servicio, profesional y horario. El sistema vuelve a comprobar disponibilidad antes de guardar.</p></div></div>
    <BookingFlow business={business} manual onSuccess={result => navigate(`/reservas/${result.id}`, { replace: true })} />
  </div>
  if (detail) return <div className="space-y-6 booking-scope">
    <Link className="text-sm text-primary underline" to="/reservas">← Volver a reservas</Link>
    <PageHeader title="Detalle de reserva" description={item ? `Estado: ${reservationStatuses[item.displayStatus || item.status] || 'Por confirmar'}` : 'Reserva no disponible.'} />
    {item && (editing ? <><BookingFlow key={item.id} business={business} reservation={item} onSuccess={() => setEditing(false)} /><button className="booking-button secondary" onClick={() => setEditing(false)}>Volver al detalle</button></> : <>
      <div className="grid gap-6 lg:grid-cols-2"><BookingSummary service={{ name: item.serviceName || 'Servicio reservado' }} professional={{ displayName: item.professionalName || 'Profesional asignado' }} slot={{ start: dateMillis(item.startAt) }} quote={item} timeZone={zone} />
        <Card title="Cliente"><dl className="space-y-3 text-sm"><div><dt className="text-muted">Nombre</dt><dd>{item.clientName || 'Cliente'}</dd></div><div><dt className="text-muted">Correo</dt><dd className="break-all">{item.clientEmail || 'Sin correo'}</dd></div><div><dt className="text-muted">Teléfono</dt><dd>{item.clientPhone || 'Sin teléfono'}</dd></div><div><dt className="text-muted">Notas</dt><dd>{item.notes || 'Sin notas'}</dd></div><div><dt className="text-muted">Origen</dt><dd>{item.source === 'manual' ? 'Reserva manual' : 'Panel del cliente'}</dd></div></dl></Card></div>
      <ReservationActions reservation={item} business={business} onReschedule={() => setEditing(true)} />
    </>)}
  </div>
  const filtered = items.filter(item => (!params.has('cierre') || ['expired', 'awaiting_closure'].includes(item.displayStatus))
    && (!status || (item.displayStatus || item.status) === status)
    && (!serviceId || item.serviceId === serviceId)
    && (!professionalId || item.professionalId === professionalId))
    .sort((a, b) => (sort === 'recent' ? -1 : 1) * (dateMillis(a.startAt) - dateMillis(b.startAt)))
  const services = [...new Map(items.map(item => [item.serviceId, item.serviceName]).filter(([id, name]) => id && name))]
  const professionals = [...new Map(items.map(item => [item.professionalId, item.professionalName]).filter(([id, name]) => id && name))]
  const stats = [
    { label: 'Total de reservas', value: filtered.length, icon: ListChecks, tone: 'purple' },
    { label: 'Confirmadas', value: filtered.filter(item => item.status === 'confirmed').length, icon: CheckCircle2, tone: 'green' },
    { label: 'Finalizadas', value: filtered.filter(item => item.status === 'completed').length, icon: Clock3, tone: 'blue' },
    { label: 'Canceladas', value: filtered.filter(item => item.status === 'cancelled').length, icon: CircleX, tone: 'red' },
    { label: 'No asistidas', value: filtered.filter(item => item.status === 'no_show').length, icon: UserRoundX, tone: 'gray' },
  ]
  return <div className="space-y-6 booking-scope reservation-page">
    <PageHeader title="Reservas" description={membership.role === 'professional' ? 'Gestiona el estado de tus citas asignadas.' : 'Consulta y gestiona las citas de tu negocio.'}
      actions={membership.role === 'admin' && bookingEnabled && <Link className="booking-button" to="/reservas/nueva"><CalendarDays size={17} />Reserva manual</Link>} />
    {!bookingEnabled && <Alert>Las reservas en línea todavía no están habilitadas.</Alert>}
    {items.some(r => ['expired', 'awaiting_closure'].includes(r.displayStatus)) && <Alert>Tienes {items.filter(r => ['expired', 'awaiting_closure'].includes(r.displayStatus)).length} citas pendientes de cerrar. Revisa el detalle para finalizar, marcar inasistencia o reprogramar.</Alert>}
    {params.has('cierre') && <button className="booking-button secondary" onClick={() => setParams({})}>Mostrar todas las reservas</button>}
    <div className="reservation-stats">{stats.map(({ label, value, icon: Icon, tone }) => <article className={`reservation-stat tone-${tone}`} key={label}><span aria-hidden="true"><Icon size={21} /></span><div><strong>{value}</strong><p>{label}</p></div></article>)}</div>
    <Card>
      <section className="reservation-filters" aria-labelledby="reservation-filters-title">
        <div className="reservation-filter-heading"><div><h2 id="reservation-filters-title">Filtros de búsqueda</h2><p>Combina fechas y criterios para localizar citas.</p></div><button type="button" className="booking-button secondary" onClick={() => { setDateFrom(''); setDateTo(''); setStatus(''); setServiceId(''); setProfessionalId(''); setSort('recent'); setQuickRange('all'); setRangeError(''); setAppliedRange(null); setParams({}) }}><RotateCcw size={15} />Limpiar filtros</button></div>
        <div className="reservation-quick-filters" role="group" aria-label="Rangos rápidos">
          {[['today', 'Hoy'], ['week', 'Últimos 7 días'], ['month', 'Este mes']].map(([id, label]) => <button type="button" key={id} aria-pressed={quickRange === id} onClick={() => quick(id)}>{label}</button>)}
          <button type="button" aria-pressed={quickRange === 'custom'} onClick={() => setQuickRange('custom')}>Personalizado</button>
        </div>
        <div className="reservation-filter-grid">
          <label className="booking-field">Fecha desde<input aria-label="Fecha desde" type="date" value={dateFrom} onChange={event => { setDateFrom(event.target.value); setQuickRange('custom') }} /></label>
          <label className="booking-field">Fecha hasta<input aria-label="Fecha hasta" type="date" value={dateTo} onChange={event => { setDateTo(event.target.value); setQuickRange('custom') }} /></label>
          <label className="booking-field">Estado<select aria-label="Estado" value={status} onChange={event => setStatus(event.target.value)}><option value="">Todos</option>{Object.entries(reservationStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="booking-field">Servicio<select aria-label="Servicio" value={serviceId} onChange={event => setServiceId(event.target.value)}><option value="">Todos</option>{services.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          {membership.role === 'admin' && <label className="booking-field">Profesional<select aria-label="Profesional" value={professionalId} onChange={event => setProfessionalId(event.target.value)}><option value="">Todos</option>{professionals.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
          <label className="booking-field">Ordenar por<select aria-label="Ordenar por" value={sort} onChange={event => setSort(event.target.value)}><option value="recent">Fecha (más reciente)</option><option value="oldest">Fecha (más antigua)</option></select></label>
        </div>
        <p className="reservation-timezone">Zona horaria del negocio: <strong>{zone}</strong></p>
        {rangeError && <p className="reservation-range-error" role="alert">{rangeError}</p>}
        {rangeFallback && <p className="reservation-index-notice" role="status">El filtro de fechas está funcionando con respaldo local. Publica los índices de Firestore para optimizar las lecturas.</p>}
        <div className="reservation-filter-actions"><button className="booking-button" type="button" onClick={() => applyRange(dateFrom, dateTo)}><CalendarDays size={16} />Aplicar filtros</button></div>
      </section>
      <div className="reservation-results-heading"><div><h2>Resultados</h2><span>{filtered.length} {filtered.length === 1 ? 'reserva' : 'reservas'}</span></div></div>
      {loading ? <p role="status" className="reservation-loading">Cargando las reservas del rango…</p>
        : <DataList items={filtered} label="Reservas" resetKey={`${appliedRange?.from || ''}:${appliedRange?.to || ''}:${status}:${serviceId}:${professionalId}:${sort}`} searchText={r => `${r.serviceName} ${r.clientName} ${r.clientEmail || ''} ${r.clientPhone || ''} ${r.professionalName} ${reservationStatuses[r.displayStatus || r.status]} ${formatAppointmentDate(r.startAt, zone)}`}>
          {rows => <div className="reservation-table-wrap"><table className="reservation-table"><thead><tr><th>Fecha y hora</th><th>Servicio</th><th>Cliente</th><th>Profesional</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
            {rows.map(item => <tr key={item.id}><td><strong>{formatAppointmentDate(item.startAt, zone)}</strong><span>{formatAppointmentDate(item.startAt, zone, true)}</span></td><td><strong>{item.serviceName || 'Servicio'}</strong>{Number.isFinite(item.price) && <span>{new Intl.NumberFormat('es-BO', { style: 'currency', currency: item.currencyCode || 'BOB' }).format(item.price)}</span>}</td><td><strong>{item.clientName || 'Cliente'}</strong><span>{item.clientEmail || item.clientPhone || 'Sin contacto'}</span></td><td>{item.professionalName || 'Profesional'}</td><td><span className={`reservation-status status-${item.displayStatus || item.status}`}><i aria-hidden="true" />{reservationStatuses[item.displayStatus || item.status] || 'Por confirmar'}</span></td><td><Link className="booking-button secondary reservation-detail-link" to={`/reservas/${encodeURIComponent(item.id)}`}>Ver detalle</Link></td></tr>)}
          </tbody></table></div>}
        </DataList>}
    </Card>
  </div>
}
