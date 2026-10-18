import { ChevronLeft, ChevronRight, CalendarDays, Clock, UserRound, BriefcaseBusiness } from 'lucide-react'
import Card from '../components/ui/Card'
import DataList from '../components/ui/DataList'
import { useAuth } from '../context/auth-context'
import { useEffect, useState } from 'react'
import { bookingRequest } from '../lib/bookingApi'
import { Link } from 'react-router-dom'
import useBusinessReservations from '../hooks/useBusinessReservations'
import { addDays, agendaDays, dayKey } from '../lib/calendarDates'
import { dateMillis, formatAppointmentDate, reservationStatuses } from '../lib/clientPresentation'
import PageHeader from '../components/ui/PageHeader'
import Alert from '../components/ui/Alert'
import '../components/booking/booking.css'
import '../components/booking/agenda.css'

export default function Agenda() {
  const data = useBusinessReservations()
  const { membership } = useAuth()
  if (data.error) return <Alert tone="error">{data.error}</Alert>
  if (data.loading) return <p role="status">Cargando agenda…</p>
  return <AgendaView key={data.business.id} business={data.business} items={data.items} own={membership.role === 'professional'} />
}

function AgendaView({ business, items, own }) {
  const zone = business.settings?.timezone || 'America/La_Paz'
  const [date, setDate] = useState(() => dayKey(Date.now(), zone))
  const [view, setView] = useState('week')
  const [professional, setProfessional] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const selected = items.find(item => item.id === selectedId)
  const days = agendaDays(date, view)
  const professionals = [...new Map(items.map(item => [item.professionalId, item.professionalName || 'Profesional'])).entries()]
  function move(direction) {
    if (view !== 'month') { setDate(addDays(date, direction * (view === 'week' ? 7 : 1))); return }
    const value = new Date(`${date.slice(0, 7)}-01T12:00:00Z`)
    value.setUTCMonth(value.getUTCMonth() + direction)
    setDate(value.toISOString().slice(0, 10))
  }
  const filtered = items.filter(item => item.status !== 'cancelled' && (!professional || item.professionalId === professional) && Number.isFinite(dateMillis(item.startAt)))
  return <div className="booking-scope space-y-6">
    <PageHeader title={own ? 'Mi agenda profesional' : 'Agenda del negocio'} description={`Reservas por día, semana y mes. Zona horaria: ${zone}. Las canceladas se consultan en Reservas.`} />

    <div className="agenda-toolbar"><div className="flex flex-wrap gap-2" role="group" aria-label="Vista de agenda">{[['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']].map(([value, label]) => <button key={value} className={`booking-button ${view === value ? '' : 'secondary'}`} aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>)}</div>
      <div className="flex flex-wrap items-center gap-2"><button className="booking-button secondary" aria-label="Período anterior" onClick={() => move(-1)}><ChevronLeft size={18} /></button><label className="booking-field"><span className="sr-only">Fecha de agenda</span><input type="date" required value={date} onChange={event => { if (event.target.value) setDate(event.target.value) }} /></label><button className="booking-button secondary" aria-label="Período siguiente" onClick={() => move(1)}><ChevronRight size={18} /></button><button className="booking-button secondary" onClick={() => setDate(dayKey(Date.now(), zone))}>Hoy</button></div>
      {!own && <label className="booking-field"><span className="sr-only">Filtrar profesional</span><select value={professional} onChange={event => setProfessional(event.target.value)}><option value="">Todos los profesionales</option>{professionals.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px] items-start"><div className="agenda-scroll"><div className={`agenda-grid agenda-${view}`} aria-label={`Agenda ${view === 'day' ? 'del día' : view === 'week' ? 'semanal' : 'mensual'}`}>
      {days.map(day => {
        const appointments = filtered.filter(item => dayKey(dateMillis(item.startAt), zone) === day).sort((a, b) => dateMillis(a.startAt) - dateMillis(b.startAt))
        const label = new Intl.DateTimeFormat('es-BO', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${day}T12:00Z`))
        return <section key={day} className={`agenda-day ${day === date ? 'selected-day' : ''} ${view === 'month' && day.slice(0, 7) !== date.slice(0, 7) ? 'outside-month' : ''}`}>
          <h2><button onClick={() => { setDate(day); setView('day') }}>{label}</button></h2>
          {!appointments.length && <p className="agenda-empty">Sin citas</p>}
          {appointments.map(item => <button type="button" key={item.id} className={`agenda-appointment agenda-${item.status} w-full text-left`} aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)}><strong>{formatAppointmentDate(item.startAt, zone, true)} · {item.serviceName || 'Servicio'}</strong><span>{item.clientName || 'Cliente'}</span><span>{item.professionalName || 'Profesional'}</span><small>{reservationStatuses[item.status] || 'Por confirmar'}</small></button>)}
        </section>
      })}
    </div></div><Card title="Detalle de cita">{selected ? <div className="space-y-5 text-sm"><p className="font-semibold text-lg">{selected.clientName}</p><p>{selected.serviceName}</p><p className="inline-block rounded-full bg-indigo-50 px-3 py-1 text-primary">{reservationStatuses[selected.status]}</p><p className="flex gap-2"><CalendarDays size={18} />{formatAppointmentDate(selected.startAt,zone)}</p><p className="flex gap-2"><Clock size={18} />{formatAppointmentDate(selected.startAt,zone,true)}</p><p className="flex gap-2"><UserRound size={18} />{selected.professionalName}</p><Link className="booking-button w-full" to={`/reservas/${encodeURIComponent(selected.id)}`}>Ver detalle</Link></div> : <p className="text-sm text-muted">Selecciona una cita del calendario para ver sus datos.</p>}</Card></div>
    {own && <AssignedServices businessId={business.id} />}
  </div>
}

function AssignedServices({ businessId }) {
  const [items, setItems] = useState(null), [error, setError] = useState('')
  useEffect(() => { let active = true; bookingRequest({ action:'options', businessId }).then(r => { if (active) setItems(r.services) }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [businessId])
  return <section className="booking-panel assigned-services">
    <div className="assigned-services-heading"><span className="assigned-services-symbol"><BriefcaseBusiness size={23} aria-hidden="true" /></span><div><h2>Mis servicios asignados</h2><p>Estos son los servicios que puedes atender en este negocio.</p></div>{items && <span className="assigned-services-count">{items.length} {items.length === 1 ? 'servicio' : 'servicios'}</span>}</div>
    {error && <Alert tone="error">{error}</Alert>}
    {!items && !error && <p role="status" className="panel-loading">Cargando servicios…</p>}
    {items && !error && <DataList label="Servicios asignados" items={items}>{rows => <ul className="assigned-services-grid">{rows.map(s => <li key={s.id} className="assigned-service-card"><span className="assigned-service-icon"><BriefcaseBusiness size={20} aria-hidden="true" /></span><div><h3>{s.name}</h3><span className="assigned-service-duration"><Clock size={14} aria-hidden="true" />{s.durationMinutes} minutos</span></div></li>)}</ul>}</DataList>}
  </section>
}
