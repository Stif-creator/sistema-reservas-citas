import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Mail, Phone, RefreshCw, Scissors, UserRound, Users } from 'lucide-react'
import DataList from '../components/ui/DataList'
import Alert from '../components/ui/Alert'
import PageHeader from '../components/ui/PageHeader'
import { useAuth } from '../context/auth-context'
import useSprintData from '../hooks/useSprintData'
import { dayKey } from '../lib/calendarDates'
import './waitlist.css'

const EMPTY_ENTRIES = []

function formatDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return 'Fecha no disponible'
  try {
    return new Intl.DateTimeFormat('es-BO', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
  } catch {
    return date
  }
}

function formatCreatedAt(value, timeZone) {
  const stamp = typeof value === 'number' ? value : value?.toMillis?.()
  if (!Number.isFinite(stamp)) return ''
  try {
    return new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(stamp)
  } catch {
    return ''
  }
}

export default function Waitlist() {
  const { membership, isSuperadmin } = useAuth()
  const { data, error, refreshing, reload } = useSprintData('waitlist')
  const [filter, setFilter] = useState('all')
  const [today, setToday] = useState('')
  const entries = Array.isArray(data) ? data : EMPTY_ENTRIES
  const timeZone = entries[0]?.businessTimeZone || 'America/La_Paz'
  useEffect(() => {
    const updateToday = () => setToday(dayKey(Date.now(), timeZone))
    updateToday()
    const timer = setInterval(updateToday, 60000)
    return () => clearInterval(timer)
  }, [timeZone])
  const upcoming = useMemo(() => today ? entries.filter(entry => entry.date >= today) : [], [entries, today])
  const visible = filter === 'upcoming' ? upcoming : entries
  const isProfessional = membership.role === 'professional'
  const servicesRequested = new Set(entries.map(entry => entry.serviceId)).size

  return <section className="waitlist-page">
    <PageHeader
      title={isProfessional ? 'Interés en mis horarios' : 'Lista de espera'}
      description={isProfessional
        ? 'Clientes que desean una cita con servicios que atiendes.'
        : 'Solicitudes de clientes de este negocio. Usa sus datos de contacto para dar seguimiento; la solicitud no reserva un horario.'}
      actions={<button type="button" className="waitlist-refresh" disabled={refreshing} onClick={reload}><RefreshCw size={16} />{refreshing ? 'Actualizando…' : 'Actualizar'}</button>}
    />
    {error && <Alert tone="error">{error}</Alert>}
    <div className="waitlist-summary" aria-label="Resumen de la lista de espera">
      <article><span className="waitlist-summary-icon"><Users size={19} /></span><div><strong>{entries.length}</strong><span>{isProfessional ? 'Solicitudes asignadas' : 'Solicitudes del negocio'}</span></div></article>
      <article><span className="waitlist-summary-icon"><CalendarDays size={19} /></span><div><strong>{upcoming.length}</strong><span>Fechas próximas</span></div></article>
      <article><span className="waitlist-summary-icon"><Scissors size={19} /></span><div><strong>{servicesRequested}</strong><span>Servicios solicitados</span></div></article>
    </div>
    <div className="waitlist-toolbar" role="group" aria-label="Filtrar solicitudes">
      <span>Mostrar</span>
      <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Todas ({entries.length})</button>
      <button type="button" aria-pressed={filter === 'upcoming'} onClick={() => setFilter('upcoming')}>Fechas próximas ({upcoming.length})</button>
    </div>
    {error && data === null
      ? null
      : refreshing && data === null
      ? <p role="status" className="panel-loading">Cargando solicitudes de espera…</p>
      : !error && visible.length === 0
        ? <div className="waitlist-empty"><span><CalendarDays size={24} /></span><h2>{entries.length ? 'No hay fechas próximas' : 'Todavía no hay solicitudes'}</h2><p>{entries.length ? 'Las solicitudes anteriores siguen disponibles en el filtro «Todas».' : 'Cuando un cliente deje sus datos en la lista de espera, aparecerá aquí para que el equipo pueda contactarlo.'}</p></div>
        : <DataList label="Solicitudes de espera" items={visible} searchText={entry => `${entry.clientName} ${entry.clientPhone} ${entry.clientEmail} ${entry.serviceName} ${entry.professionalName} ${entry.date}`}>
          {rows => <div className="waitlist-list">{rows.map(entry => <article className="waitlist-card" key={entry.id}>
            <div className="waitlist-client-icon"><UserRound size={21} /></div>
            <div className="waitlist-client"><h2>{entry.clientName || 'Cliente'}</h2><p>{entry.serviceName}</p><span>{entry.professionalName}</span></div>
            <div className="waitlist-date"><CalendarDays size={17} /><div><strong>{formatDate(entry.date)}</strong><small>Fecha de interés, no es una reserva</small></div></div>
            <div className="waitlist-contact">
              {entry.clientPhone && <a href={`tel:${entry.clientPhone}`}><Phone size={15} />{entry.clientPhone}</a>}
              {entry.clientEmail && <a href={`mailto:${encodeURIComponent(entry.clientEmail)}?subject=${encodeURIComponent(`Consulta sobre ${entry.serviceName}`)}`}><Mail size={15} />Contactar por correo</a>}
              {!entry.clientPhone && !entry.clientEmail && <span>El cliente no tiene contacto disponible.</span>}
            </div>
            <p className="waitlist-created">{formatCreatedAt(entry.createdAt, timeZone) ? `Registrada ${formatCreatedAt(entry.createdAt, timeZone)}` : 'Solicitud registrada'}</p>
          </article>)}</div>}
        </DataList>}
    {isSuperadmin && <p className="waitlist-platform-note">Las solicitudes pertenecen al negocio seleccionado. La lista no muestra solicitudes de otros negocios.</p>}
  </section>
}
