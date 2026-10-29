import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { collection, documentId, getCountFromServer, getDocs, limit, orderBy, query, startAfter, Timestamp, where } from 'firebase/firestore'
import { CalendarDays, ChevronLeft, ChevronRight, Eye, History, RefreshCw, RotateCcw, Search, ShieldAlert, ShieldCheck } from 'lucide-react'
import { db } from '../firebase/config'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import EditorDialog from '../components/ui/EditorDialog'
import './PlatformSecurity.css'
import '../components/superadmin.css'

const PAGE_SIZE = 20
const labels = {
  platformCreate: 'Negocio registrado', platformStatus: 'Estado del negocio', businessUpdate: 'Configuración',
  membershipUpdate: 'Membresía', superadmin_granted: 'Acceso superadministrador otorgado',
  superadmin_revoked: 'Acceso superadministrador retirado', repair_owner_profile: 'Reparación de perfil responsable',
  businessRequestSubmitted: 'Solicitud de negocio recibida', businessRequestin_review: 'Solicitud en revisión', businessRequestneeds_info: 'Información solicitada', businessRequestrejected: 'Solicitud rechazada', businessRequestApproved: 'Solicitud aprobada', businessRequestInfoProvided: 'Información adicional recibida',
}
const dateTime = value => value?.toDate ? new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short' }).format(value.toDate()) : 'Fecha no disponible'
const getQuery = (days, businessId, action, now) => {
  const filters = []
  if (days) filters.push(where('createdAt', '>=', Timestamp.fromDate(new Date(now.toMillis() - days * 86400000))), where('createdAt', '<=', now))
  if (businessId) filters.push(where('businessId', '==', businessId))
  if (action) filters.push(where('action', '==', action))
  return filters
}
const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))
const nameOf = user => [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
const descriptionOf = event => {
  if (event.action === 'businessUpdate') return event.beforeName !== event.afterName ? 'Nombre del negocio actualizado.' : 'Configuración del negocio actualizada.'
  if (event.action === 'platformStatus') return `Estado del negocio cambiado${event.status ? ` a ${event.status}` : ''}.`
  if (event.action === 'platformCreate') return 'Negocio registrado en la plataforma.'
  if (event.action === 'membershipUpdate') return 'Rol o estado de una membresía actualizado.'
  if (event.action === 'superadmin_granted') return 'Se otorgó acceso de superadministrador.'
  if (event.action === 'superadmin_revoked') return 'Se retiró acceso de superadministrador.'
  if (event.action === 'repair_owner_profile') return 'Se registró una reparación del perfil responsable.'
  return event.action ? `Evento administrativo: ${event.action}` : 'Evento administrativo sin tipo identificado.'
}

export default function PlatformSecurity() {
  const [days, setDays] = useState(30)
  const [businessId, setBusinessId] = useState('')
  const [action, setAction] = useState('')
  const [search, setSearch] = useState('')
  const [businesses, setBusinesses] = useState([])
  const [page, setPage] = useState({ loading: true, error: '', events: [], hasMore: false })
  const [metrics, setMetrics] = useState({ total: null, config: null, status: null })
  const [cursorStack, setCursorStack] = useState([])
  const [cursor, setCursor] = useState(null)
  const [refresh, setRefresh] = useState(0)
  const [selected, setSelected] = useState(null)
  const [names, setNames] = useState({ businesses: {}, users: {} })
  const namesCache = useRef(names)

  useEffect(() => {
    let live = true
    getDocs(query(collection(db, 'businesses'), orderBy('name'), limit(200))).then(snapshot => {
      if (live) setBusinesses(snapshot.docs.map(item => ({ id: item.id, name: item.data().name || 'Negocio sin nombre' })))
    }).catch(() => { if (live) setBusinesses([]) })
    return () => { live = false }
  }, [])

  const load = useCallback(async () => {
    const now = Timestamp.now()
    const filters = getQuery(days, businessId, action, now)
    try {
      const base = collection(db, 'auditLogs')
      let eventsQuery = query(base, ...filters, orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(PAGE_SIZE + 1))
      const [snapshot, totalSnapshot, configSnapshot, statusSnapshot] = await Promise.all([
        getDocs(eventsQuery),
        getCountFromServer(query(base, ...getQuery(days, businessId, '', now))),
        getCountFromServer(query(base, ...getQuery(days, businessId, 'businessUpdate', now))),
        getCountFromServer(query(base, ...getQuery(days, businessId, 'platformStatus', now))),
      ])
      const docs = snapshot.docs.slice(0, PAGE_SIZE)
      const events = docs.map(item => ({ id: item.id, ...item.data() }))
      const businessKeys = [...new Set(events.map(item => item.businessId).filter(Boolean))]
      const actorKeys = [...new Set(events.map(item => item.actorUserId).filter(Boolean))]
      const [businessResults, actorResults] = await Promise.all([
        Promise.all(chunk(businessKeys.filter(id => !(id in namesCache.current.businesses)), 30).map(ids => getDocs(query(collection(db, 'businesses'), where(documentId(), 'in', ids))))),
        Promise.all(chunk(actorKeys.filter(id => !(id in namesCache.current.users)), 30).map(ids => getDocs(query(collection(db, 'users'), where(documentId(), 'in', ids))))),
      ])
      const businessNames = Object.fromEntries(businessResults.flatMap(result => result.docs.map(item => [item.id, item.data().name || 'Negocio sin nombre'])))
      const userNames = Object.fromEntries(actorResults.flatMap(result => result.docs.map(item => [item.id, nameOf(item.data()) || ''])))
      namesCache.current = { businesses: { ...namesCache.current.businesses, ...businessNames }, users: { ...namesCache.current.users, ...userNames } }
      setNames(namesCache.current)
      setPage({ loading: false, error: '', events, hasMore: snapshot.docs.length > PAGE_SIZE, last: docs.at(-1) || null })
      setMetrics({ total: totalSnapshot.data().count, config: configSnapshot.data().count, status: statusSnapshot.data().count })
    } catch (error) {
      console.error('No se pudo cargar la auditoría:', error)
      setPage({ loading: false, error: error.code === 'permission-denied'
        ? 'Firestore no permite leer estos registros con las reglas actuales.'
        : error.code === 'failed-precondition'
          ? 'Firestore solicita un índice para esta combinación de filtros. Revisa el enlace del error en la consola.'
          : 'No se pudieron cargar los registros de auditoría. Inténtalo de nuevo.', events: [], hasMore: false })
    }
  }, [days, businessId, action, cursor])

  useEffect(() => { load() }, [load, refresh])
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es')
    if (!term) return page.events
    return page.events.filter(event => `${labels[event.action] || event.action || ''} ${descriptionOf(event)} ${names.businesses[event.businessId] || ''} ${names.users[event.actorUserId] || ''} ${event.businessId || ''} ${event.actorUserId || ''}`.toLocaleLowerCase('es').includes(term))
  }, [page.events, search, names])
  const reset = () => { setPage(previous => ({ ...previous, loading: true, error: '' })); setDays(30); setBusinessId(''); setAction(''); setSearch(''); setCursor(null); setCursorStack([]) }
  const changeFilter = (setter, value) => { setPage(previous => ({ ...previous, loading: true, error: '' })); setter(value); setCursor(null); setCursorStack([]); setSearch('') }
  const refreshPage = () => { setPage(previous => ({ ...previous, loading: true, error: '' })); setRefresh(value => value + 1) }

  return <div className="platform-security-page">
    <PageHeader title="Seguridad y auditoría" description="Consulta las operaciones administrativas registradas en la plataforma." />
    <div className="platform-security-heading"><p><ShieldAlert size={17} /> El historial muestra únicamente eventos registrados por las operaciones existentes. No representa lecturas ni intentos de acceso.</p></div>
    <section className="platform-security-stats" aria-label="Resumen de auditoría">
      <Metric icon={<History size={19} />} label="Eventos del período" value={metrics.total} detail={`Últimos ${days} días${businessId ? ' · negocio seleccionado' : ' · plataforma'}`} />
      <Metric icon={<ShieldCheck size={19} />} label="Cambios de configuración" value={metrics.config} detail="Período completo y negocio seleccionado" />
      <Metric icon={<RefreshCw size={19} />} label="Cambios de estado" value={metrics.status} detail="Período completo y negocio seleccionado" />
      <Metric icon={<Eye size={19} />} label="Negocios con eventos" value={new Set(page.events.map(item => item.businessId).filter(Boolean)).size} detail="En esta página de resultados" />
    </section>
    <Card className="platform-security-card">
      <div className="platform-security-toolbar">
        <label className="platform-security-search"><Search size={16} /><input aria-label="Buscar eventos en la página actual" placeholder="Buscar en esta página…" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label>Negocio<select aria-label="Filtrar por negocio" value={businessId} onChange={event => changeFilter(setBusinessId, event.target.value)}><option value="">Todos los negocios</option>{businesses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Tipo de evento<select aria-label="Filtrar por tipo de evento" value={action} onChange={event => changeFilter(setAction, event.target.value)}><option value="">Todos los eventos</option>{Object.entries(labels).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
        <label className="platform-security-period"><CalendarDays size={15} /><span>Período</span><select aria-label="Período de auditoría" value={days} onChange={event => changeFilter(setDays, Number(event.target.value))}><option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option><option value={365}>Últimos 12 meses</option></select></label>
        <button type="button" className="platform-security-button" onClick={reset}><RotateCcw size={15} />Limpiar filtros</button>
        <button type="button" className="platform-security-button" onClick={refreshPage} disabled={page.loading}><RefreshCw size={15} />Actualizar</button>
      </div>
      <div className="platform-security-table-head"><div><h2>Eventos administrativos</h2><p>{metrics.total === null ? 'Consultando registros…' : `${metrics.total.toLocaleString('es-BO')} registros para el período y el negocio seleccionados.`}</p></div></div>
      {page.error && <p role="alert" className="platform-security-error">{page.error}</p>}
      {page.loading && <p role="status" className="platform-loading">Cargando auditoría…</p>}
      {!page.loading && !page.error && <>
        {visible.length ? <div className="platform-table-wrap platform-security-table-wrap"><table className="platform-table"><thead><tr><th>Fecha y hora</th><th>Tipo</th><th>Descripción</th><th>Negocio</th><th>Actor</th><th>Detalles</th></tr></thead><tbody>{visible.map(event => <tr key={event.id}>
          <td>{dateTime(event.createdAt)}</td><td><span className={`platform-security-badge ${event.action === 'platformStatus' ? 'status' : event.action === 'businessUpdate' ? 'config' : ''}`}>{labels[event.action] || event.action || 'Tipo desconocido'}</span></td>
          <td>{descriptionOf(event)}</td><td>{event.businessId ? <><strong>{names.businesses[event.businessId] || 'No disponible'}</strong><small className="platform-security-id">{event.businessId}</small></> : 'No identificado'}</td>
          <td>{event.actorUserId ? <><strong>{names.users[event.actorUserId] || 'No identificado'}</strong><small className="platform-security-id">{event.actorUserId}</small></> : 'No identificado'}</td>
          <td><button type="button" className="platform-security-view" onClick={() => setSelected(event)}>Ver</button></td>
        </tr>)}</tbody></table></div> : <p className="platform-empty">{search ? 'No hay coincidencias en esta página.' : 'No hay eventos para estos filtros.'}</p>}
        <div className="platform-security-pagination"><span>Página {cursorStack.length + 1} · {visible.length} registros visibles. La búsqueda se limita a esta página.</span><div><button type="button" className="platform-security-button" disabled={!cursorStack.length || page.loading} onClick={() => { setPage(previous => ({ ...previous, loading: true, error: '' })); setCursor(cursorStack.at(-1) || null); setCursorStack(items => items.slice(0, -1)); setSearch('') }}><ChevronLeft size={15} />Anterior</button><button type="button" className="platform-security-button" disabled={!page.hasMore || page.loading} onClick={() => { setPage(previous => ({ ...previous, loading: true, error: '' })); setCursorStack(items => [...items, cursor]); setCursor(page.last); setSearch('') }}>Siguiente<ChevronRight size={15} /></button></div></div>
      </>}
    </Card>
    {selected && <EditorDialog title="Detalle del evento" onClose={() => setSelected(null)}><EventDetails event={selected} names={names} /></EditorDialog>}
  </div>
}

function Metric({ icon, label, value, detail }) {
  return <Card className="platform-security-metric"><span className="platform-security-metric-icon">{icon}</span><div><span>{label}</span><strong>{value === null ? '—' : value.toLocaleString('es-BO')}</strong><small>{detail}</small></div></Card>
}

function EventDetails({ event, names }) {
  const appearanceKeys = ['primaryColor', 'secondaryColor', 'accentColor', 'surfaceColor']
  const appearanceLabels = { primaryColor: 'Color principal', secondaryColor: 'Color secundario', accentColor: 'Color de acento', surfaceColor: 'Color de superficie' }
  const appearance = (value = {}) => appearanceKeys.filter(key => value?.[key] !== undefined).map(key => ({ key, label: appearanceLabels[key], value: String(value[key]) }))
  const changes = event.action === 'businessUpdate' ? [
    ...(event.beforeName !== undefined || event.afterName !== undefined ? [{ label: 'Nombre', before: event.beforeName || '—', after: event.afterName || '—' }] : []),
    ...appearanceKeys.map(key => ({ key, before: event.beforeAppearance?.[key], after: event.afterAppearance?.[key] })).filter(item => item.before !== undefined || item.after !== undefined).map(item => ({ label: appearanceLabels[item.key], before: item.before ?? '—', after: item.after ?? '—' })),
  ] : event.action === 'membershipUpdate' ? [
    { label: 'Rol', before: event.beforeRole || '—', after: event.afterRole || '—' },
    { label: 'Estado', before: event.beforeStatus || '—', after: event.afterStatus || '—' },
  ].filter(item => item.before !== '—' || item.after !== '—') : []
  const beforeAppearance = appearance(event.beforeAppearance), afterAppearance = appearance(event.afterAppearance)
  return <div className="platform-security-details"><p><strong>Operación</strong><span>{labels[event.action] || event.action || 'Evento desconocido'} <small>({event.action || 'sin identificador'})</small></span></p>
    <p><strong>Fecha y hora</strong><span>{dateTime(event.createdAt)}</span></p>
    <p><strong>Negocio afectado</strong><span>{event.businessId ? `${names.businesses[event.businessId] || 'No disponible'} · ${event.businessId}` : 'No identificado'}</span></p>
    <p><strong>Actor responsable</strong><span>{event.actorUserId ? `${names.users[event.actorUserId] || 'No identificado'} · ${event.actorUserId}` : 'No identificado'}</span></p>
    {event.targetUserId && <p><strong>Cuenta relacionada</strong><span>{event.targetUserId}</span></p>}
    {event.status !== undefined && <p><strong>Estado registrado</strong><span>{event.status}</span></p>}
    {changes.length > 0 && <section><h3>Cambios registrados</h3>{changes.map(item => <p key={item.label}><strong>{item.label}</strong><span>{String(item.before)} → {String(item.after)}</span></p>)}</section>}
    {(beforeAppearance.length > 0 || afterAppearance.length > 0) && <section><h3>Apariencia registrada</h3><div className="platform-security-appearance"><div><strong>Anterior</strong>{beforeAppearance.length ? beforeAppearance.map(item => <p key={item.key}>{item.label}: {item.value}</p>) : <p>Sin valores registrados</p>}</div><div><strong>Posterior</strong>{afterAppearance.length ? afterAppearance.map(item => <p key={item.key}>{item.label}: {item.value}</p>) : <p>Sin valores registrados</p>}</div></div></section>}
    {changes.length === 0 && beforeAppearance.length === 0 && afterAppearance.length === 0 && event.status === undefined && <p className="platform-security-nochange">Este registro no contiene valores anteriores o posteriores.</p>}
  </div>
}
