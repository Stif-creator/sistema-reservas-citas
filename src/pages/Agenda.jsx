import { useState } from 'react'
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
  if (data.error) return <Alert tone="error">{data.error}</Alert>
  if (data.loading) return <p role="status">Cargando agenda…</p>
  return <AgendaView key={data.business.id} business={data.business} items={data.items} />
}

function AgendaView({ business, items }) {
  const zone = business.settings?.timezone || 'America/La_Paz'
  const [date, setDate] = useState(() => dayKey(Date.now(), zone))
  const [view, setView] = useState('week')
  const [professional, setProfessional] = useState('')
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
    <PageHeader title="Agenda del negocio" description={`Reservas por día, semana y mes. Zona horaria: ${zone}. Las canceladas se consultan en Reservas.`} />
    <div className="agenda-toolbar"><div className="flex flex-wrap gap-2" role="group" aria-label="Vista de agenda">{[['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']].map(([value, label]) => <button key={value} className={`booking-button ${view === value ? '' : 'secondary'}`} aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>)}</div>
      <div className="flex flex-wrap items-center gap-2"><button className="booking-button secondary" aria-label="Período anterior" onClick={() => move(-1)}>←</button><label className="booking-field"><span className="sr-only">Fecha de agenda</span><input type="date" required value={date} onChange={event => { if (event.target.value) setDate(event.target.value) }} /></label><button className="booking-button secondary" aria-label="Período siguiente" onClick={() => move(1)}>→</button><button className="booking-button secondary" onClick={() => setDate(dayKey(Date.now(), zone))}>Hoy</button></div>
      <label className="booking-field"><span className="sr-only">Filtrar profesional</span><select value={professional} onChange={event => setProfessional(event.target.value)}><option value="">Todos los profesionales</option>{professionals.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    </div>
    <div className="agenda-scroll"><div className={`agenda-grid agenda-${view}`} aria-label={`Agenda ${view === 'day' ? 'del día' : view === 'week' ? 'semanal' : 'mensual'}`}>
      {days.map(day => {
        const appointments = filtered.filter(item => dayKey(dateMillis(item.startAt), zone) === day).sort((a, b) => dateMillis(a.startAt) - dateMillis(b.startAt))
        const label = new Intl.DateTimeFormat('es-BO', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${day}T12:00Z`))
        return <section key={day} className={`agenda-day ${day === date ? 'selected-day' : ''} ${view === 'month' && day.slice(0, 7) !== date.slice(0, 7) ? 'outside-month' : ''}`}>
          <h2><button onClick={() => { setDate(day); setView('day') }}>{label}</button></h2>
          {!appointments.length && <p className="agenda-empty">Sin citas</p>}
          {appointments.map(item => <Link key={item.id} className={`agenda-appointment agenda-${item.status}`} to={`/reservas/${encodeURIComponent(item.id)}`}><strong>{formatAppointmentDate(item.startAt, zone, true)} · {item.serviceName || 'Servicio'}</strong><span>{item.clientName || 'Cliente'}</span><span>{item.professionalName || 'Profesional'}</span><small>{reservationStatuses[item.status] || 'Por confirmar'}</small></Link>)}
        </section>
      })}
    </div></div>
  </div>
}
