import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
import { dayKey } from '../lib/calendarDates'

export default function Reservations({ detail = false, manual = false }) {
  const { membership } = useAuth()
  const { business, items, loading, error } = useBusinessReservations()
  const { reservationId } = useParams()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [date, setDate] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState(false)
  if (error) return <Alert tone="error">{error}</Alert>
  if (loading) return <p role="status">Cargando reservas…</p>
  const item = items.find(value => value.id === reservationId)
  const zone = business.settings?.timezone || 'America/La_Paz'
  if (manual) return <div className="space-y-6"><PageHeader title="Reserva manual" description="Registra una cita solicitada por teléfono u otro medio." /><BookingFlow business={business} manual onSuccess={result => navigate(`/reservas/${result.id}`, { replace: true })} /></div>
  if (detail) return <div className="space-y-6 booking-scope">
    <Link className="text-sm text-primary underline" to="/reservas">← Volver a reservas</Link>
    <PageHeader title="Detalle de reserva" description={item ? `Estado: ${reservationStatuses[item.status] || 'Por confirmar'}` : 'Reserva no disponible.'} />
    {item && (editing ? <><BookingFlow key={item.id} business={business} reservation={item} onSuccess={() => setEditing(false)} /><button className="booking-button secondary" onClick={() => setEditing(false)}>Volver al detalle</button></> : <>
      <div className="grid gap-6 lg:grid-cols-2"><BookingSummary service={{ name: item.serviceName || 'Servicio reservado' }} professional={{ displayName: item.professionalName || 'Profesional asignado' }} slot={{ start: dateMillis(item.startAt) }} quote={item} timeZone={zone} />
        <Card title="Cliente"><dl className="space-y-3 text-sm"><div><dt className="text-muted">Nombre</dt><dd>{item.clientName || 'Cliente'}</dd></div><div><dt className="text-muted">Correo</dt><dd className="break-all">{item.clientEmail || 'Sin correo'}</dd></div><div><dt className="text-muted">Teléfono</dt><dd>{item.clientPhone || 'Sin teléfono'}</dd></div><div><dt className="text-muted">Notas</dt><dd>{item.notes || 'Sin notas'}</dd></div><div><dt className="text-muted">Origen</dt><dd>{item.source === 'manual' ? 'Reserva manual' : 'Panel del cliente'}</dd></div></dl></Card></div>
      <ReservationActions reservation={item} business={business} onReschedule={membership.role === 'admin' ? () => setEditing(true) : undefined} />
    </>)}
  </div>
  const filtered = items.filter(item => (!status || item.status === status) && (!date || (Number.isFinite(dateMillis(item.startAt)) && dayKey(dateMillis(item.startAt), zone) === date)) &&
    `${item.serviceName || ''} ${item.clientName || ''} ${item.professionalName || ''}`.toLowerCase().includes(search.toLowerCase().trim()))
    .sort((a, b) => dateMillis(b.startAt) - dateMillis(a.startAt))
  return <div className="space-y-6 booking-scope">
    <PageHeader title="Reservas" description={membership.role === 'professional' ? 'Gestiona el estado de tus citas asignadas.' : 'Consulta y gestiona las citas de tu negocio.'}
      actions={membership.role === 'admin' && bookingEnabled && <Link className="booking-button" to="/reservas/nueva">Reserva manual</Link>} />
    {!bookingEnabled && <Alert>Las reservas en línea todavía no están habilitadas.</Alert>}
    <Card><div className="mb-6 grid gap-4 md:grid-cols-3">
      <label className="booking-field">Buscar reservas<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Cliente, servicio o profesional" /></label>
      <label className="booking-field">Fecha<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <label className="booking-field">Estado<select value={status} onChange={event => setStatus(event.target.value)}><option value="">Todos</option>{Object.entries(reservationStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div><p className="mb-4 text-xs text-muted">Zona horaria: {zone}</p>
      {!filtered.length ? <p>No hay reservas para esta selección.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border"><th className="p-3">Fecha y hora</th><th className="p-3">Servicio</th><th className="p-3">Cliente</th><th className="p-3">Profesional</th><th className="p-3">Estado</th><th className="p-3">Acción</th></tr></thead><tbody>
        {filtered.map(item => <tr key={item.id} className="border-b border-border"><td className="p-3">{formatAppointmentDate(item.startAt, zone)}<br />{formatAppointmentDate(item.startAt, zone, true)}</td><td className="p-3">{item.serviceName || 'Servicio'}</td><td className="p-3">{item.clientName || 'Cliente'}</td><td className="p-3">{item.professionalName || 'Profesional'}</td><td className="p-3">{reservationStatuses[item.status] || 'Por confirmar'}</td><td className="p-3"><Link className="text-primary underline" to={`/reservas/${encodeURIComponent(item.id)}`}>Ver detalle</Link></td></tr>)}
      </tbody></table></div>}
    </Card>
  </div>
}
