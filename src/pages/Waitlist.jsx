import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarDays, Mail, Phone, RefreshCw, Scissors, UserRound, Users } from 'lucide-react'
import DataList from '../components/ui/DataList'
import Alert from '../components/ui/Alert'
import PageHeader from '../components/ui/PageHeader'
import EditorDialog from '../components/ui/EditorDialog'
import { useFeedback } from '../context/feedback-context'
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
  const { membership } = useAuth()
  const { data, error, refreshing, reload, mutate, busy } = useSprintData('waitlist')
  const { notify } = useFeedback()
  const [searchParams] = useSearchParams()
  const [filter, setFilter] = useState('all')
  const [today, setToday] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [nextStatus, setNextStatus] = useState('pending')
  const [reason, setReason] = useState('')
  const submitLock = useRef(false)
  const entries = Array.isArray(data) ? data : EMPTY_ENTRIES
  const timeZone = entries[0]?.businessTimeZone || 'America/La_Paz'
  useEffect(() => {
    const updateToday = () => setToday(dayKey(Date.now(), timeZone))
    updateToday()
    const timer = setInterval(updateToday, 60000)
    return () => clearInterval(timer)
  }, [timeZone])
  const upcoming = useMemo(() => today ? entries.filter(entry => entry.date >= today) : [], [entries, today])
  const visible = (filter === 'upcoming' ? upcoming : entries).filter(entry => statusFilter === 'all' || (entry.followUpStatus || 'pending') === statusFilter)
  const requestedId = searchParams.get('solicitud')
  const requestedEntry = requestedId ? entries.find(entry => entry.id === requestedId) : null
  const listItems = requestedId ? requestedEntry ? [requestedEntry] : [] : visible
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
      <label className="waitlist-status-filter">Estado del seguimiento <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">Todos</option><option value="pending">Pendiente</option><option value="contacted">Contactado</option><option value="resolved">Resuelto</option><option value="closed">Cerrado</option></select></label>
    </div>
    {requestedId && requestedEntry && <p className="waitlist-request-context" role="status">Solicitud abierta desde una notificación. <Link to="/lista-espera">Volver a todas las solicitudes</Link></p>}
    {error && data === null
      ? null
      : refreshing && data === null
      ? <p role="status" className="panel-loading">Cargando solicitudes de espera…</p>
      : !error && listItems.length === 0
        ? <div className="waitlist-empty"><span><CalendarDays size={24} /></span><h2>{requestedId ? 'Solicitud no disponible' : entries.length ? 'No hay fechas próximas' : 'Todavía no hay solicitudes'}</h2><p>{requestedId ? 'No encontramos esta solicitud entre las que puedes consultar. Puede haberse retirado o pertenecer a otro negocio.' : entries.length ? 'Las solicitudes anteriores siguen disponibles en el filtro «Todas».' : 'Cuando un cliente deje sus datos en la lista de espera, aparecerá aquí para que el equipo pueda contactarlo.'}</p>{requestedId && <Link to="/lista-espera">Volver a todas las solicitudes</Link>}</div>
        : requestedEntry
          ? <div className="waitlist-list"><WaitlistCard entry={requestedEntry} timeZone={timeZone} today={today} onEdit={openEntry => { setEditing(openEntry); setNextStatus(openEntry.followUpStatus || 'pending'); setReason(openEntry.followUpCloseReason || '') }} /></div>
          : <DataList label="Solicitudes de espera" resetKey={`${filter}:${statusFilter}`} items={listItems} searchText={entry => `${entry.clientName} ${entry.clientPhone} ${entry.clientEmail} ${entry.serviceName} ${entry.professionalName} ${entry.date} ${entry.followUpStatus || 'pending'} ${entry.followUpCloseReason || ''}`}>
            {rows => <div className="waitlist-list">{rows.map(entry => <WaitlistCard key={entry.id} entry={entry} timeZone={timeZone} today={today} onEdit={openEntry => { setEditing(openEntry); setNextStatus(openEntry.followUpStatus || 'pending'); setReason(openEntry.followUpCloseReason || '') }} />)}</div>}
          </DataList>}
    {editing && <EditorDialog title="Seguimiento de solicitud" onClose={() => setEditing(null)} busy={busy}>
      <form className="waitlist-followup-form" onSubmit={async event => { event.preventDefault(); if (submitLock.current) return; submitLock.current = true; try { const ok = await mutate({ action: 'waitlistUpdate', id: editing.id, status: nextStatus, reason }); if (ok) { setEditing(null); notify({ title: 'Seguimiento actualizado', message: 'El estado de la solicitud se guardó.', type: 'success' }) } } finally { submitLock.current = false } }}>
        {error && <Alert tone="error">{error}</Alert>}
        <p><strong>{editing.clientName || 'Cliente'}</strong> · {editing.serviceName} · {formatDate(editing.date)}</p>
        <label>Estado<select value={nextStatus} onChange={event => setNextStatus(event.target.value)} disabled={busy}>{[['pending','Pendiente'],['contacted','Contactado'],['resolved','Resuelto'],['closed','Cerrado']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {nextStatus === 'closed' && <label>Motivo breve (opcional)<textarea value={reason} maxLength={240} onChange={event => setReason(event.target.value)} disabled={busy} /></label>}
        {editing.followUpUpdatedAt && <small>Último cambio: {formatCreatedAt(editing.followUpUpdatedAt, timeZone)}{editing.followUpUpdatedByName ? ` · ${editing.followUpUpdatedByName}` : ''}</small>}
        <div><button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button><button type="submit" disabled={busy || nextStatus === (editing.followUpStatus || 'pending')}>{busy ? 'Guardando…' : 'Guardar estado'}</button></div>
      </form>
    </EditorDialog>}
  </section>
}

function WaitlistCard({ entry, timeZone, today, onEdit }) {
  const registeredAt = formatCreatedAt(entry.createdAt, timeZone)
  const status = entry.followUpStatus || 'pending'
  const statusLabels = { pending: 'Pendiente', contacted: 'Contactado', resolved: 'Resuelto', closed: 'Cerrado' }
  return <article className="waitlist-card" id={`waitlist-${entry.id}`}>
    <div className="waitlist-client-icon"><UserRound size={21} /></div>
    <div className="waitlist-client"><h2>{entry.clientName || 'Cliente'}</h2><p>{entry.serviceName}</p><span>{entry.professionalName}</span></div>
    <div className="waitlist-date"><CalendarDays size={17} /><div><strong>{formatDate(entry.date)}</strong><small>Fecha de interés, no es una reserva</small>{today && entry.date < today && <span className="waitlist-past-date">Fecha de interés pasada</span>}</div></div>
    <div className="waitlist-contact">
      {entry.clientPhone && <a href={`tel:${entry.clientPhone}`}><Phone size={15} />{entry.clientPhone}</a>}
      {entry.clientEmail && <a href={`mailto:${encodeURIComponent(entry.clientEmail)}?subject=${encodeURIComponent(`Consulta sobre ${entry.serviceName}`)}`}><Mail size={15} />Contactar por correo</a>}
      {!entry.clientPhone && !entry.clientEmail && <span>El cliente no tiene contacto disponible.</span>}
    </div>
    <div className="waitlist-followup"><span className={`waitlist-followup-status is-${status}`}>{statusLabels[status] || 'Pendiente'}</span>{entry.followUpCloseReason && <small>{entry.followUpCloseReason}</small>}<button type="button" onClick={() => onEdit(entry)}>Actualizar seguimiento</button>{entry.followUpUpdatedAt && <small>Actualizada {formatCreatedAt(entry.followUpUpdatedAt, timeZone)}{entry.followUpUpdatedByName ? ` · ${entry.followUpUpdatedByName}` : ''}</small>}</div>
    <p className="waitlist-created">{registeredAt ? `Registrada ${registeredAt}` : 'Solicitud registrada'}</p>
  </article>
}
