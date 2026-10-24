import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarClock, ChevronLeft, ChevronRight, Clock3, Mail, Phone,
  RefreshCw, Search, UserRound, Users, X, Pencil, ClipboardList,
} from 'lucide-react'
import { useAuth } from '../context/auth-context'
import { useFeedback } from '../context/feedback-context'
import useSprintData from '../hooks/useSprintData'
import { bookingRequest } from '../lib/bookingApi'
import { dateMillis, formatAppointmentDate, reservationStatuses } from '../lib/clientPresentation'
import { confirmDiscard, markFormSaved } from '../lib/unsavedForms'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import DataList from '../components/ui/DataList'
import EditorDialog from '../components/ui/EditorDialog'
import PageHeader from '../components/ui/PageHeader'
import PersonAvatar from '../components/ui/PersonAvatar'
import './clients.css'

const pageSize = 10
const fullName = client => [client.firstName, client.lastName].filter(Boolean).join(' ').trim() || 'Cliente sin nombre'
const active = client => client.status === 'active' || client.isActive === true
const inactive = client => ['inactive', 'disabled'].includes(client.status) || client.isActive === false

export default function Clients() {
  const { membership, isSuperadmin } = useAuth()
  const { confirm, notify } = useFeedback()
  const { data, error, refreshing, reload } = useSprintData('clients')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort] = useState('recent')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(undefined)
  const [tab, setTab] = useState('general')
  const [history, setHistory] = useState([])
  const [historyFor, setHistoryFor] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [overrides, setOverrides] = useState({})
  const clients = useMemo(() => (data?.clients || []).map(client => overrides[client.id] || client), [data?.clients, overrides])
  const selectedClient = selected === undefined ? clients[0] || null : clients.find(client => client.id === selected) || null
  const hasStatus = clients.some(client => typeof client.status === 'string' || typeof client.isActive === 'boolean')
  const hasCreatedAt = clients.some(client => client.createdAt != null)

  const filtered = useMemo(() => {
    const needle = search.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    return [...clients]
      .filter(client => {
        const matchesSearch = !needle || `${fullName(client)} ${client.phone || ''} ${client.email || ''}`
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(needle)
        const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? active(client) : inactive(client))
        return matchesSearch && matchesStatus
      })
      .sort((a, b) => sort === 'name'
        ? fullName(a).localeCompare(fullName(b), 'es')
        : (dateMillis(b.createdAt) || 0) - (dateMillis(a.createdAt) || 0))
  }, [clients, search, sort, statusFilter])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
  const newThisMonth = clients.filter(client => dateMillis(client.createdAt) >= monthStart).length

  async function openClient(client) {
    if (editing && !await confirm({ title: '¿Descartar los cambios?', description: 'Tienes cambios sin guardar. Si continúas, se perderán.', confirmLabel: 'Descartar cambios' })) return
    setSelected(client.id)
    setTab('general')
    setHistory([])
    setHistoryFor('')
    setHistoryError('')
    setEditing(false)
  }

  async function showHistory() {
    setTab('history')
    if (!selectedClient || historyFor === selectedClient.id || isSuperadmin) return
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const result = await bookingRequest({ action: 'clientHistory', businessId: membership.businessId, clientId: selectedClient.id })
      setHistory(result.history || [])
      setHistoryFor(selectedClient.id)
    } catch (loadError) {
      setHistoryError(loadError.message || 'No se pudo cargar el historial de citas.')
    } finally {
      setHistoryLoading(false)
    }
  }

  async function saveClient(event) {
    event.preventDefault()
    if (!selectedClient || saving) return
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form))
    setFormError('')
    setSaving(true)
    try {
      await bookingRequest({ action: 'clientUpdate', businessId: membership.businessId, id: selectedClient.id, ...values })
      const updated = { ...selectedClient, ...values }
      setOverrides(current => ({ ...current, [selectedClient.id]: updated }))
      setSelected(updated.id)
      markFormSaved(form, true)
      setEditing(false)
      reload()
      notify({ title: 'Cliente actualizado', message: 'Los datos de contacto se guardaron correctamente.', type: 'success' })
    } catch (saveError) {
      setFormError(saveError.message || 'No se pudieron guardar los datos del cliente.')
    } finally {
      setSaving(false)
    }
  }

  if (isSuperadmin) return <SuperadminClientSummary data={data} error={error} refreshing={refreshing} reload={reload} />

  return <section className="clients-page">
    <PageHeader title="Clientes" description={membership?.role === 'professional'
      ? 'Consulta los datos de contacto y las citas de tus clientes asignados.'
      : 'Consulta los datos de contacto y el historial de citas de tus clientes.'}
      actions={<Button variant="secondary" onClick={reload} disabled={refreshing || saving}><RefreshCw size={17} aria-hidden="true" />{refreshing ? 'Actualizando…' : 'Actualizar clientes'}</Button>} />
    {error && <Alert tone="error">{error}</Alert>}
    {data && <div className="clients-stats" aria-label="Resumen de clientes">
      <Stat icon={Users} label="Total de clientes" value={clients.length} tone="blue" />
      {hasStatus && <Stat icon={UserRound} label="Clientes activos" value={clients.filter(active).length} tone="green" />}
      {hasCreatedAt && <Stat icon={CalendarClock} label="Nuevos este mes" value={newThisMonth} tone="orange" />}
      {hasStatus && clients.some(inactive) && <Stat icon={UserRound} label="Inactivos" value={clients.filter(inactive).length} tone="red" />}
    </div>}

    <div className={`clients-workspace${selectedClient ? ' has-selection' : ''}`}>
      <section className="clients-list-panel" aria-label="Listado de clientes">
        <div className="clients-toolbar">
          <label className="clients-search"><Search size={18} aria-hidden="true" /><span className="sr-only">Buscar clientes</span><input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} placeholder="Buscar por nombre, teléfono o correo…" /></label>
          {hasStatus && <label className="clients-filter">Estado<select value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1) }}><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label>}
          <label className="clients-filter">Ordenar por<select value={sort} onChange={event => { setSort(event.target.value); setPage(1) }}><option value="recent">Más recientes</option><option value="name">Nombre</option></select></label>
        </div>
        {!data && refreshing && <p className="clients-empty" role="status">Cargando clientes…</p>}
        {data && clients.length === 0 && <p className="clients-empty" role="status">Aún no hay clientes registrados.</p>}
        {data && clients.length > 0 && filtered.length === 0 && <p className="clients-empty" role="status">No hay resultados para esta búsqueda.</p>}
        <div className="clients-list" role="list" aria-label="Clientes encontrados">
          {pageRows.map(client => <article className={`clients-row${selectedClient?.id === client.id ? ' selected' : ''}`} key={client.id} role="listitem">
            <PersonAvatar name={fullName(client)} />
            <div className="clients-row-copy"><strong>{fullName(client)}</strong><span>{client.phone || 'Sin teléfono'}</span><span>{client.email || 'Sin correo'}</span></div>
            {hasStatus && clientHasStatus(client) && <StatusBadge client={client} />}
            <button type="button" className="clients-row-button" onClick={() => openClient(client)} aria-label={`Ver detalles de ${fullName(client)}`}>Ver detalles</button>
          </article>)}
        </div>
        {data && <footer className="clients-pagination"><span>{filtered.length ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} de ${filtered.length} registros` : '0 registros'}</span><div><button type="button" aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={17} /></button><span>Página {page} de {pageCount}</span><button type="button" aria-label="Página siguiente" disabled={page >= pageCount} onClick={() => setPage(value => value + 1)}><ChevronRight size={17} /></button></div></footer>}
      </section>

      {selectedClient ? <aside className="clients-detail-panel" aria-label={`Detalles de ${fullName(selectedClient)}`}>
        <header className="clients-detail-header"><PersonAvatar name={fullName(selectedClient)} /><div className="clients-detail-identity"><h2>{fullName(selectedClient)}</h2>{hasStatus && clientHasStatus(selectedClient) && <StatusBadge client={selectedClient} />}
          {selectedClient.phone && <p><Phone size={15} aria-hidden="true" /><span>{selectedClient.phone}</span></p>}
          {selectedClient.email && <p><Mail size={15} aria-hidden="true" /><span>{selectedClient.email}</span></p>}
          {selectedClient.createdAt && <p><Clock3 size={15} aria-hidden="true" /><span>Cliente desde {formatAppointmentDate(selectedClient.createdAt)}</span></p>}
        </div>
        {membership?.role === 'admin' && <Button onClick={() => { setFormError(''); setEditing(true) }}><Pencil size={16} aria-hidden="true" />Editar cliente</Button>}
      <button type="button" className="clients-mobile-close" aria-label="Cerrar detalles" onClick={() => setSelected(null)}><X size={20} /></button>
        </header>
        <div className="clients-tabs" role="tablist" aria-label="Secciones de datos del cliente">
          <button type="button" role="tab" id="client-tab-general" aria-selected={tab === 'general'} aria-controls="client-panel-general" onClick={() => setTab('general')}><UserRound size={16} />Datos generales</button>
          <button type="button" role="tab" id="client-tab-history" aria-selected={tab === 'history'} aria-controls="client-panel-history" onClick={showHistory}><CalendarClock size={16} />Historial de citas</button>
        </div>
        {tab === 'general' ? <div className="clients-detail-content" role="tabpanel" id="client-panel-general" aria-labelledby="client-tab-general">
          <DetailRow label="Nombre completo" value={fullName(selectedClient)} />
          <DetailRow label="Teléfono" value={selectedClient.phone} />
          <DetailRow label="Correo de contacto" value={selectedClient.email} />
          {hasStatus && clientHasStatus(selectedClient) && <DetailRow label="Estado" value={<StatusBadge client={selectedClient} />} />}
          {selectedClient.createdAt && <DetailRow label="Fecha de registro" value={formatAppointmentDate(selectedClient.createdAt)} />}
        </div> : <div className="clients-history" role="tabpanel" id="client-panel-history" aria-labelledby="client-tab-history">
          {historyLoading && <p className="clients-empty" role="status">Cargando historial…</p>}
          {historyError && <Alert tone="error">{historyError}</Alert>}
          {!historyLoading && !historyError && historyFor === selectedClient.id && history.length === 0 && <p className="clients-empty" role="status">Este cliente aún no tiene citas registradas.</p>}
          {!historyLoading && !historyError && historyFor === selectedClient.id && history.length > 0 && <DataList label="citas" items={history} searchText={appointment => `${appointment.serviceName} ${appointment.professionalName} ${formatAppointmentDate(appointment.startAt, appointment.timeZone)} ${reservationStatuses[appointment.status] || appointment.status}`}>
            {rows => <div className="clients-appointments">{rows.map(appointment => <article className="clients-appointment" key={appointment.id}>
              <div className="clients-appointment-copy"><strong>{appointment.serviceName || 'Servicio'}</strong><span>{formatAppointmentDate(appointment.startAt, appointment.timeZone)} · {formatAppointmentDate(appointment.startAt, appointment.timeZone, true)}</span><span>{appointment.professionalName || 'Profesional'}</span><StatusBadge status={appointment.status} /></div>
              <Link to={`/reservas/${encodeURIComponent(appointment.id)}`} className="clients-reservation-link">Ver reserva</Link>
            </article>)}</div>}
          </DataList>}
        </div>}
      </aside> : <aside className="clients-detail-placeholder"><ClipboardList size={28} /><h2>Selecciona un cliente</h2><p>Elige un registro para consultar sus datos y citas autorizadas.</p></aside>}
    </div>

    {editing && selectedClient && <EditClientDialog client={selectedClient} busy={saving} error={formError} onSubmit={saveClient} onClose={() => setEditing(false)} />}
  </section>
}

function clientHasStatus(client) { return typeof client.status === 'string' || typeof client.isActive === 'boolean' }

function Stat({ icon: Icon, label, value, tone }) {
  return <article className={`clients-stat clients-stat-${tone}`}><span><Icon size={19} aria-hidden="true" /></span><div><small>{label}</small><strong>{value}</strong></div></article>
}

function StatusBadge({ client, status }) {
  const value = status || (client?.status || (typeof client?.isActive === 'boolean' ? client.isActive ? 'active' : 'inactive' : ''))
  const label = reservationStatuses[value] || ({ active: 'Activo', inactive: 'Inactivo', disabled: 'Inactivo' }[value] || value)
  if (!label) return null
  return <span className={`clients-badge clients-badge-${['active', 'confirmed', 'completed'].includes(value) ? 'active' : ['inactive', 'cancelled', 'no_show'].includes(value) ? 'inactive' : 'neutral'}`}>{label}</span>
}

function DetailRow({ label, value }) {
  if (value == null || value === '') return null
  return <div className="clients-detail-row"><strong>{label}</strong><span>{value}</span></div>
}

function EditClientDialog({ client, busy, error, onSubmit, onClose }) {
  const form = useRef(null)
  const { confirm } = useFeedback()
  async function cancel() {
    if (await confirmDiscard(form.current, confirm)) onClose()
  }
  return <EditorDialog title="Editar cliente" onClose={onClose} busy={busy}>
    <p className="clients-edit-description">Actualiza únicamente los datos de contacto del cliente.</p>
    <form ref={form} className="clients-edit-form" onSubmit={onSubmit}>
      <label>Nombre<input name="firstName" defaultValue={client.firstName || ''} maxLength={100} autoComplete="given-name" required /></label>
      <label>Apellido<input name="lastName" defaultValue={client.lastName || ''} maxLength={100} autoComplete="family-name" /></label>
      <label>Teléfono<input name="phone" type="tel" defaultValue={client.phone || ''} pattern="\+?[0-9]{8,15}" title="Ingresa entre 8 y 15 dígitos, con + opcional." autoComplete="tel" maxLength={16} required /></label>
      <label>Correo de contacto<input name="email" type="email" defaultValue={client.email || ''} maxLength={254} autoComplete="email" /></label>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="clients-edit-actions"><Button type="button" variant="secondary" disabled={busy} onClick={cancel}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button></div>
    </form>
  </EditorDialog>
}

function SuperadminClientSummary({ data, error, refreshing, reload }) {
  return <section className="clients-page clients-superadmin"><PageHeader title="Clientes de la plataforma" description="Resumen agregado para supervisión. Los datos personales y los historiales se mantienen protegidos." actions={<Button variant="secondary" onClick={reload} disabled={refreshing}><RefreshCw size={17} aria-hidden="true" />{refreshing ? 'Actualizando…' : 'Actualizar resumen'}</Button>} />
    {error && <Alert tone="error">{error}</Alert>}
    {!data && refreshing && <p className="clients-empty" role="status">Cargando resumen…</p>}
    {data?.summaryOnly && <div className="clients-stats"><Stat icon={Users} label="Total de clientes" value={data.totalClients} tone="blue" /><Stat icon={CalendarClock} label="Negocios registrados" value={data.totalBusinesses} tone="green" /></div>}
    <div className="clients-privacy-note"><Users size={22} aria-hidden="true" /><div><strong>Datos personales protegidos</strong><p>Esta vista muestra únicamente cifras globales. No incluye nombres, teléfonos, correos ni historiales de citas.</p></div></div>
  </section>
}
