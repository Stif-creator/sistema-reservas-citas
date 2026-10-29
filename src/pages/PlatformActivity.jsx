import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowDown, ArrowUp, CalendarDays, ChevronLeft, ChevronRight, Clock3, RefreshCw, RotateCcw, Search, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { bookingRequest } from '../lib/bookingApi'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import '../components/superadmin.css'
import './PlatformActivity.css'

const eventTypes = [
  ['platformCreate', 'Negocio creado'], ['platformStatus', 'Estado del negocio'], ['businessUpdate', 'Configuración'],
  ['membershipUpdate', 'Administradores'], ['superadmin_granted', 'Acceso superadministrador otorgado'], ['superadmin_revoked', 'Acceso superadministrador retirado'],
]
const labels = Object.fromEntries(eventTypes)
const dateTime = value => value ? new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short' }).format(value) : '—'
const errorText = error => error?.code === 'permission-denied' ? 'No tienes permiso para consultar esta actividad.' : 'No se pudo cargar la actividad. Inténtalo de nuevo.'

export default function PlatformActivity() {
  const [days, setDays] = useState(30)
  const [search, setSearch] = useState('')
  const [businessId, setBusinessId] = useState('')
  const [action, setAction] = useState('')
  const [businessCursor, setBusinessCursor] = useState(null)
  const [businessHistory, setBusinessHistory] = useState([])
  const [eventCursor, setEventCursor] = useState(null)
  const [eventHistory, setEventHistory] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [state, setState] = useState({ loading: true, error: '', data: null })

  useEffect(() => { let live = true; bookingRequest({ action: 'platformActivity', days, search, businessId, eventType: action, cursor: businessCursor, eventCursor }).then(data => { if (live) setState({ loading: false, error: '', data }) }).catch(error => { if (live) setState({ loading: false, error: errorText(error), data: null }) }); return () => { live = false } }, [days, search, businessId, action, businessCursor, eventCursor, refreshKey])

  const reset = () => { setState(current => ({ ...current, loading: true, error: '' })); setSearch(''); setBusinessId(''); setAction(''); setDays(30); setBusinessCursor(null); setBusinessHistory([]); setEventCursor(null); setEventHistory([]); setRefreshKey(key => key + 1) }
  const changeFilter = setter => value => { setState(current => ({ ...current, loading: true, error: '' })); setter(value); setBusinessCursor(null); setBusinessHistory([]); setEventCursor(null); setEventHistory([]) }
  const data = state.data
  const rows = data?.businesses || []
  const businessesWithActivity = rows.filter(item => item.reservations > 0).length
  const maxReservations = Math.max(1, ...rows.map(item => item.reservations))
  const eventList = useMemo(() => data?.events || [], [data])

  return <div className="platform-activity-page">
    <PageHeader title="Actividad de negocios" description="Monitorea la actividad reciente de cada negocio, con métricas clave y detalles de operaciones importantes." />
    <div className="platform-activity-toolbar platform-activity-filters">
      <label className="platform-activity-search"><Search size={16} /><input aria-label="Buscar negocio" placeholder="Buscar negocio…" value={search} onChange={event => changeFilter(setSearch)(event.target.value)} /></label>
      <label>Negocio<select aria-label="Filtrar por negocio" value={businessId} onChange={event => changeFilter(setBusinessId)(event.target.value)}><option value="">Todos los negocios</option>{rows.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Tipo de actividad<select aria-label="Filtrar tipo de actividad" value={action} onChange={event => changeFilter(setAction)(event.target.value)}><option value="">Todos los tipos</option>{eventTypes.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
      <label className="platform-period-label"><CalendarDays size={15} />Período<select aria-label="Período de actividad" value={days} onChange={event => changeFilter(setDays)(Number(event.target.value))}><option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option></select></label>
      <button type="button" className="platform-analytics-clear" onClick={reset}><RotateCcw size={15} />Limpiar filtros</button>
      <button type="button" className="platform-analytics-clear" onClick={() => { setState(current => ({ ...current, loading: true, error: '' })); setRefreshKey(key => key + 1) }} disabled={state.loading}><RefreshCw size={15} />Actualizar</button>
    </div>
    {state.error && <p role="alert" className="platform-alert">{state.error}</p>}
    {state.loading && <p role="status" className="platform-loading">Consultando actividad agregada…</p>}
    {data && <>
      <section className="platform-stat-grid platform-activity-stats" aria-label="Indicadores de actividad">
        <Metric icon={<CalendarDays size={20} />} label="Total de reservas" value={data.totalReservations} detail={`Últimos ${days} días${businessId ? ' · negocio seleccionado' : ' · plataforma'}`} />
        <Metric icon={<Activity size={20} />} label="Negocios con reservas" value={businessesWithActivity} detail="En la página actual" />
        <Metric icon={<Clock3 size={20} />} label="Sin reservas en el período" value={rows.length - businessesWithActivity} detail="En la página actual" />
        <Metric icon={<ShieldCheck size={20} />} label="Eventos de auditoría" value={data.totalEvents} detail={`Últimos ${days} días · sin datos personales`} />
      </section>
      <div className="platform-activity-charts">
        <Card className="platform-panel"><div className="platform-panel-head"><div><h2>Actividad por negocio</h2><p>Reservas registradas en el período seleccionado. Se muestran los negocios de la página actual.</p></div><Activity size={20} /></div>
          {rows.length ? <div className="platform-activity-bars" role="img" aria-label="Reservas por negocio en la página actual">{rows.map(item => <div className="platform-activity-bar-item" key={item.id}><strong>{item.reservations}</strong><div className="platform-activity-bar-track"><i style={{ height: `${Math.max(item.reservations ? 8 : 2, item.reservations / maxReservations * 100)}%` }} /></div><span title={item.name}>{item.name}</span></div>)}</div> : <p className="platform-empty">No hay negocios en esta página.</p>}
        </Card>
        <Card className="platform-panel"><div className="platform-panel-head"><div><h2>Negocios de esta página</h2><p>Estado y actividad reciente. “Sin reservas” no indica que el negocio esté inactivo.</p></div><Activity size={20} /></div>
          {rows.length ? <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Negocio</th><th>Estado</th><th>Reservas</th><th>Última reserva</th><th>Variación vs. período anterior</th><th /></tr></thead><tbody>{rows.map(item => <tr key={item.id}><td><strong>{item.name}</strong></td><td><span className={`platform-status ${item.status}`}>{item.status === 'active' ? 'Activo' : item.status === 'inactive' ? 'Inactivo' : item.status}</span></td><td><strong>{item.reservations}</strong></td><td>{dateTime(item.lastReservationAt ? new Date(item.lastReservationAt) : null)}</td><td>{item.changePercent === null ? 'Sin período comparable' : <span className={item.changePercent >= 0 ? 'platform-activity-positive' : 'platform-activity-negative'}>{item.changePercent >= 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}{Math.abs(item.changePercent)}%</span>}</td><td><Link className="platform-link-button" to={`/plataforma/negocios/${item.id}`}>Ver negocio</Link></td></tr>)}</tbody></table></div> : <p className="platform-empty">No encontramos negocios para estos filtros.</p>}
          {!businessId && <div className="platform-activity-pagination"><span>Mostrando {rows.length} negocios de la página actual</span><button className="platform-link-button" disabled={!businessHistory.length || state.loading} onClick={() => { const previous = businessHistory.at(-1); setState(current => ({ ...current, loading: true })); setBusinessHistory(history => history.slice(0, -1)); setBusinessCursor(previous || null) }}><ChevronLeft size={14} />Anterior</button><button className="platform-link-button" disabled={!data.hasMoreBusinesses || state.loading} onClick={() => { setState(current => ({ ...current, loading: true })); setBusinessHistory(history => [...history, businessCursor]); setBusinessCursor(data.nextCursor) }}>Siguiente<ChevronRight size={14} /></button></div>}
        </Card>
      </div>
      <Card className="platform-panel platform-activity-events"><div className="platform-panel-head"><div><h2>Eventos recientes</h2><p>Acciones administrativas registradas en la auditoría. Se ocultan correos y datos de clientes.</p></div><Link className="platform-link-button" to="/plataforma/seguridad">Seguridad y auditoría</Link></div>
        {eventList.length ? <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Fecha</th><th>Negocio</th><th>Tipo</th><th>Descripción</th></tr></thead><tbody>{eventList.map(event => <tr key={event.id}><td>{dateTime(event.createdAt ? new Date(event.createdAt) : null)}</td><td>{event.businessId ? <Link to={`/plataforma/negocios/${event.businessId}`}>{event.businessName}</Link> : 'Plataforma'}</td><td><span className="platform-event-badge">{labels[event.action] || 'Actividad administrativa'}</span></td><td>{event.description}</td></tr>)}</tbody></table></div> : <p className="platform-empty">No hay eventos de auditoría para este período.</p>}
        <div className="platform-activity-pagination"><span>{data.totalEvents} eventos registrados para los filtros</span><button className="platform-link-button" disabled={!eventHistory.length || state.loading} onClick={() => { const previous = eventHistory.at(-1); setState(current => ({ ...current, loading: true })); setEventHistory(history => history.slice(0, -1)); setEventCursor(previous || null) }}><ChevronLeft size={14} />Anterior</button><button className="platform-link-button" disabled={!data.eventHasMore || state.loading} onClick={() => { setState(current => ({ ...current, loading: true })); setEventHistory(history => [...history, eventCursor]); setEventCursor(data.nextEventCursor) }}>Siguiente<ChevronRight size={14} /></button></div>
      </Card>
      <p className="platform-note mt-4">Los indicadores de negocio se calculan con conteos de reservas; las filas y el gráfico se limitan a la página actual. La última reserva se obtiene consultando solo su fecha. No se incluyen nombres, teléfonos, correos ni notas de clientes.</p>
    </>}
  </div>
}

function Metric({ icon, label, value, detail }) {
  return <Card className="platform-stat"><span className="platform-stat-icon blue">{icon}</span><div><span>{label}</span><strong>{value.toLocaleString('es-BO')}</strong><small>{detail}</small></div></Card>
}
