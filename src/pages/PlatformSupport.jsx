import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, endAt, getCountFromServer, getDoc, getDocs, limit, orderBy, query, startAfter, startAt, Timestamp, where } from 'firebase/firestore'
import { Activity, AlertCircle, ArrowRight, Building2, CalendarDays, Check, CircleHelp, Clock3, ExternalLink, FileText, Globe2, Headset, Image, Info, MapPin, Palette, RefreshCw, Search, ShieldCheck, Users, Wrench } from 'lucide-react'
import { db } from '../firebase/config'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import './PlatformSupport.css'
import '../components/superadmin.css'

const periods = { 7: 'Últimos 7 días', 30: 'Últimos 30 días', 90: 'Últimos 90 días', 180: 'Últimos 6 meses', 365: 'Últimos 12 meses' }
const knownActions = new Set(['businessUpdate', 'platformStatus', 'platformCreate', 'membershipUpdate'])
const actionLabels = { businessUpdate: 'Configuración actualizada', platformStatus: 'Estado del negocio actualizado', platformCreate: 'Negocio registrado', membershipUpdate: 'Membresía actualizada' }
const dateTime = value => value?.toDate ? new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short' }).format(value.toDate()) : 'Fecha no disponible'
const hasText = value => typeof value === 'string' && value.trim().length > 0
const activeHours = hours => hours && typeof hours === 'object' && Object.values(hours).some(day => Array.isArray(day) && day.some(slot => hasText(slot?.start) && hasText(slot?.end)))
const locationDetails = location => ({ address: [location?.addressLine, location?.city, location?.stateRegion, location?.countryCode].filter(hasText).join(', '), coordinates: Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude) })

function eventDescription(event) {
  if (event.action === 'businessUpdate') return event.beforeName !== event.afterName ? 'Se actualizó el nombre o la configuración del negocio.' : 'Se guardó la configuración del negocio.'
  if (event.action === 'platformStatus') return `Se registró el cambio de estado${event.status ? ` a ${event.status}` : ''}.`
  if (event.action === 'platformCreate') return 'Se registró el negocio en la plataforma.'
  if (event.action === 'membershipUpdate') return 'Se actualizó el rol o estado de una membresía.'
  return 'Actividad administrativa registrada.'
}

export default function PlatformSupport() {
  const [search, setSearch] = useState('')
  const [businesses, setBusinesses] = useState([])
  const [businessId, setBusinessId] = useState('')
  const [selectedBusinessOption, setSelectedBusinessOption] = useState(null)
  const selectedId = useRef('')
  const businessCursor = useRef(null)
  const [businessPage, setBusinessPage] = useState(0)
  const [businessHasMore, setBusinessHasMore] = useState(false)
  const [period, setPeriod] = useState(30)
  const [refresh, setRefresh] = useState(0)
  const [businessesState, setBusinessesState] = useState({ loading: true, error: '' })
  const [state, setState] = useState({ loading: false, error: '', data: null })

  useEffect(() => {
    let live = true
    const timer = window.setTimeout(async () => {
      setBusinessesState({ loading: true, error: '' })
      try {
        const base = collection(db, 'businesses')
        const term = search.trim()
        const titleCase = term.split(/\s+/).map(word => word ? `${word[0].toLocaleUpperCase('es')}${word.slice(1)}` : '').join(' ')
        const candidates = term ? [...new Set([term, titleCase, term.toLocaleLowerCase('es'), term.toLocaleUpperCase('es')])] : ['']
        const cursorState = businessCursor.current
        const prefixes = businessPage && cursorState ? [cursorState.prefix] : candidates
        let snapshot, prefix = prefixes[0]
        for (const candidate of prefixes) {
          const constraints = [orderBy('name'), ...(candidate ? [startAt(candidate), endAt(`${candidate}\uf8ff`)] : []), ...(businessPage && cursorState?.snapshot ? [startAfter(cursorState.snapshot)] : []), limit(30)]
          snapshot = await getDocs(query(base, ...constraints))
          prefix = candidate
          if (snapshot.docs.length || businessPage) break
        }
        if (!live) return
        const items = snapshot.docs.map(item => ({ id: item.id, name: item.data().name || 'Negocio sin nombre', status: item.data().status || 'unknown' }))
        setBusinesses(previous => businessPage ? [...previous, ...items] : items)
        businessCursor.current = { prefix, snapshot: snapshot.docs.at(-1) || cursorState?.snapshot || null }
        setBusinessHasMore(snapshot.docs.length === 30)
        setBusinessesState({ loading: false, error: '' })
        if (!selectedId.current && items.length) { selectedId.current = items[0].id; setBusinessId(items[0].id); setSelectedBusinessOption(items[0]); setState({ loading: true, error: '', data: null }) }
      } catch (error) {
        if (live) setBusinessesState({ loading: false, error: error.code === 'permission-denied' ? 'No tienes permiso para buscar negocios.' : 'No se pudieron buscar los negocios. Inténtalo de nuevo.' })
      }
    }, search ? 250 : 0)
    return () => { live = false; window.clearTimeout(timer) }
  }, [search, businessPage])

  useEffect(() => {
    if (!businessId) return undefined
    let live = true
    const load = async () => {
      const now = Timestamp.now()
      const start = Timestamp.fromDate(new Date(now.toMillis() - period * 86400000))
      const previousStart = Timestamp.fromDate(new Date(now.toMillis() - period * 2 * 86400000))
      const reservations = collection(db, 'reservations')
      const scopedReservations = where('businessId', '==', businessId)
      const readCount = async (queryValue, fallback = null) => {
        try { return { value: (await getCountFromServer(queryValue)).data().count, error: false } }
        catch { return { value: fallback, error: true } }
      }
      try {
        const businessSnapshot = await getDoc(doc(db, 'businesses', businessId))
        if (!businessSnapshot.exists()) throw new Error('El negocio seleccionado ya no está disponible.')
        const business = { ...businessSnapshot.data(), id: businessSnapshot.id }
        const [current, previous, professionals, activity] = await Promise.all([
          readCount(query(reservations, scopedReservations, where('createdAt', '>=', start), where('createdAt', '<=', now))),
          readCount(query(reservations, scopedReservations, where('createdAt', '>=', previousStart), where('createdAt', '<', start))),
          readCount(query(collection(db, 'memberships'), where('businessId', '==', businessId), where('role', '==', 'professional'), where('status', '==', 'active'))),
          (async () => { try { return { events: (await getDocs(query(collection(db, 'auditLogs'), where('businessId', '==', businessId), orderBy('createdAt', 'desc'), limit(12)))).docs.map(item => ({ ...item.data(), id: item.id })).filter(item => knownActions.has(item.action)).slice(0, 6), error: false } } catch { return { events: [], error: true } } })(),
        ])
        const pageAvailable = business.settings?.publicPageEnabled === true && business.status === 'active'
        const services = pageAvailable
          ? await readCount(query(collection(db, 'services'), where('businessId', '==', businessId), where('isActive', '==', true), where('isPublic', '==', true)))
          : { value: null, error: false }
        if (live) setState({ loading: false, error: '', data: { business, current, previous, professionals, services, activity, pageAvailable } })
      } catch (error) {
        if (live) setState({ loading: false, error: error.code === 'permission-denied' ? 'Firestore no permitió leer los datos de diagnóstico.' : error.message || 'No se pudo completar el diagnóstico.', data: null })
      }
    }
    load()
    return () => { live = false }
  }, [businessId, period, refresh])

  const selectedBusiness = useMemo(() => businesses.find(item => item.id === businessId) || selectedBusinessOption || state.data?.business, [businesses, businessId, selectedBusinessOption, state.data])
  const runDiagnostic = () => { setState(previous => ({ ...previous, loading: true, error: '' })); setRefresh(value => value + 1) }
  const data = state.data
  const business = data?.business
  const location = locationDetails(business?.location)
  const contactAvailable = hasText(business?.contact?.phone) || hasText(business?.contact?.whatsapp) || hasText(business?.contact?.email)
  const scheduleAvailable = activeHours(business?.weeklyHours)
  const logoAvailable = hasText(business?.logo?.url)
  const coverAvailable = hasText(business?.cover?.url)
  const colorsAvailable = ['primaryColor', 'secondaryColor'].every(key => /^#[0-9a-f]{6}$/i.test(business?.appearance?.[key] || ''))
  const pageEnabled = business?.settings?.publicPageEnabled === true
  const findings = business ? getFindings({ business, location, contactAvailable, scheduleAvailable, logoAvailable, coverAvailable, colorsAvailable, pageEnabled, serviceError: data.services.error }) : []
  const reservationChange = data?.previous.value > 0 && data.current.value !== null ? Math.round((data.current.value - data.previous.value) / data.previous.value * 100) : null
  const links = business ? [
    { title: 'Editar negocio', text: 'Ir al módulo de Negocios', to: `/plataforma/negocios/${encodeURIComponent(business.id)}/editar`, icon: Building2, tone: 'blue' },
    { title: 'Supervisar negocio', text: 'Ver información general', to: `/plataforma/negocios/${encodeURIComponent(business.id)}`, icon: Wrench, tone: 'green' },
    { title: 'Ver estadísticas', text: 'Ir al módulo de Reportes', to: '/plataforma/estadisticas', icon: Activity, tone: 'green' },
    { title: 'Ver auditoría', text: 'Revisar registros disponibles', to: '/plataforma/seguridad', icon: ShieldCheck, tone: 'violet' },
    { title: 'Abrir actividad', text: 'Ver actividad reciente del negocio', to: '/plataforma/actividad', icon: Activity, tone: 'blue' },
  ] : []
  const searchBusinesses = value => { businessCursor.current = null; setBusinessPage(0); setBusinesses([]); setBusinessHasMore(false); setSearch(value) }

  return <div className="platform-support-page">
    <PageHeader title="Soporte técnico" description="Centro de diagnóstico y orientación para negocios. Solo lectura con accesos rápidos a módulos autorizados." />
    <div className="platform-support-box platform-support-readonly"><span className="platform-stat-icon violet"><Headset size={22} /></span><div><strong>Modo de supervisión de solo lectura</strong><p>Esta sección consulta configuración y métricas agregadas. No suplanta usuarios, no modifica datos y no consulta documentos individuales de clientes.</p></div></div>
    <Card className="platform-support-card">
      <div className="platform-support-section-title"><span className="platform-stat-icon blue"><Building2 size={20} /></span><div><h2>Diagnóstico del negocio</h2><p>Consulta el estado general y un análisis de la configuración disponible.</p></div></div>
      <div className="platform-support-controls">
        <label className="platform-support-control platform-support-business-search"><span>Buscar negocio</span><div><Search size={16} /><input aria-label="Buscar negocio por nombre" placeholder="Escribe el nombre del negocio" value={search} onChange={event => searchBusinesses(event.target.value)} /></div></label>
        <label className="platform-support-control"><span>Seleccionar negocio</span><select aria-label="Seleccionar negocio para diagnóstico" value={businessId} onChange={event => { const nextId = event.target.value; selectedId.current = nextId; setSelectedBusinessOption(businesses.find(item => item.id === nextId) || selectedBusinessOption); setBusinessId(nextId); setState(nextId ? { loading: true, error: '', data: null } : { loading: false, error: '', data: null }) }}><option value="">Selecciona un negocio</option>{selectedBusiness && !businesses.some(item => item.id === businessId) && <option value={selectedBusiness.id}>{selectedBusiness.name}</option>}{businesses.map(item => <option key={item.id} value={item.id}>{item.name}{item.status === 'deleted' ? ' · Archivado' : ''}</option>)}</select></label>
        <label className="platform-support-control"><span>Período de análisis</span><select aria-label="Período de análisis" value={period} onChange={event => { setState(previous => ({ ...previous, loading: true, error: '' })); setPeriod(Number(event.target.value)) }}>{Object.entries(periods).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
        <button type="button" className="platform-support-refresh" onClick={runDiagnostic} disabled={!businessId || state.loading}><RefreshCw size={16} />Actualizar diagnóstico</button>
      </div>
      {businessesState.loading && <p role="status" className="platform-loading">Buscando negocios…</p>}
      {businessesState.error && <p role="alert" className="platform-support-error">{businessesState.error}</p>}
      {!businessesState.loading && !businessesState.error && !businesses.length && <p className="platform-empty">{search ? 'No encontramos negocios con ese nombre.' : 'Todavía no hay negocios registrados.'}</p>}
      {!businessesState.loading && businessHasMore && <button type="button" className="platform-support-more" onClick={() => { setBusinessesState({ loading: true, error: '' }); setBusinessPage(value => value + 1) }}>Cargar más negocios</button>}
      {state.error && <p role="alert" className="platform-support-error">{state.error}</p>}
      {state.loading && <p role="status" className="platform-loading">Consultando diagnóstico…</p>}
      {business && !state.loading && <>
        <div className="platform-support-business-heading"><div><h3>{business.name || business.id}</h3><span>Estado del negocio: <strong className={business.status === 'active' ? 'is-good' : 'is-warning'}>{businessStatus(business.status)}</strong></span></div><span className="platform-support-period-pill">{periods[period]}</span></div>
        <section className="platform-support-metrics" aria-label="Indicadores del diagnóstico">
          <Metric icon={<ShieldCheck />} label="Estado del negocio" value={businessStatus(business.status)} tone={business.status === 'active' ? 'green' : 'amber'} />
          <Metric icon={<Globe2 />} label="Página pública" value={data.pageAvailable ? 'Publicada' : pageEnabled ? 'Habilitada · negocio inactivo' : 'No publicada'} tone={data.pageAvailable ? 'green' : 'amber'} />
          <Metric icon={<CalendarDays />} label="Reservas del período" value={countText(data.current)} detail={data.current.error ? 'Error al verificar' : reservationChange === null ? 'Conteo agregado · comparación no disponible' : `${reservationChange >= 0 ? '↑' : '↓'} ${Math.abs(reservationChange)}% vs. período anterior`} tone="violet" />
          <Metric icon={<Users />} label="Profesionales activos" value={countText(data.professionals)} detail="Conteo de membresías activas" tone="violet" />
          <Metric icon={<Building2 />} label="Servicios publicados" value={data.services.value === null ? 'No disponible' : countText(data.services)} detail={data.services.error ? 'Error al verificar' : data.pageAvailable ? 'Activos y públicos' : 'Requiere página pública activa'} tone="amber" />
        </section>
        <div className="platform-support-main-grid">
          <Card className="platform-support-panel"><PanelTitle icon={<AlertCircle />} title="Problemas detectados" subtitle={findings.length ? 'Puntos de atención basados en los datos disponibles del negocio.' : 'No encontramos problemas de configuración en los campos revisados.'} />
            {findings.length ? <div className="platform-support-findings">{findings.map((item, index) => <Finding key={`${item.title}-${index}`} item={item} businessId={business.id} />)}</div> : <div className="platform-support-all-good"><Check size={17} />No se detectaron hallazgos en las verificaciones disponibles.</div>}
          </Card>
          <Card className="platform-support-panel"><PanelTitle icon={<Activity />} title="Accesos rápidos" subtitle="Navega a módulos existentes para gestionar la información del negocio." />
            <div className="platform-support-links">{links.map(item => <Link key={item.title} className="platform-support-link" to={item.to}><span className={`platform-support-link-icon ${item.tone}`}><item.icon size={18} /></span><span><strong>{item.title}</strong><small>{item.text}</small></span><ArrowRight size={16} /></Link>)}
              <a className={`platform-support-link ${!data.pageAvailable ? 'is-disabled' : ''}`} href={data.pageAvailable ? `/b/${encodeURIComponent(business.id)}` : undefined} target={data.pageAvailable ? '_blank' : undefined} rel={data.pageAvailable ? 'noreferrer' : undefined} aria-disabled={!data.pageAvailable} onClick={event => { if (!data.pageAvailable) event.preventDefault() }}><span className="platform-support-link-icon blue"><Globe2 size={18} /></span><span><strong>Página pública</strong><small>{data.pageAvailable ? 'Abrir página en otra pestaña' : 'No está publicada actualmente'}</small></span><ExternalLink size={15} /></a>
            </div>
          </Card>
        </div>
        <div className="platform-support-lower-grid">
          <Card className="platform-support-panel"><PanelTitle icon={<Clock3 />} title="Actividad reciente del negocio" subtitle="Eventos administrativos disponibles en el historial." />
            {data.activity.error ? <p className="platform-support-unavailable"><Info size={15} />No se pudo verificar la actividad registrada.</p> : data.activity.events.length ? <div className="platform-support-activity">{data.activity.events.map(event => <div className="platform-support-activity-item" key={event.id}><span className={`platform-support-dot ${event.action === 'platformStatus' ? 'green' : 'blue'}`} /><div><strong>{actionLabels[event.action] || event.action}</strong><p>{eventDescription(event)}</p></div><time>{dateTime(event.createdAt)}</time></div>)}</div> : <p className="platform-empty">No hay eventos administrativos recientes registrados para este negocio.</p>}
            <Link className="platform-support-text-link" to="/plataforma/seguridad">Consultar auditoría disponible <ArrowRight size={14} /></Link>
          </Card>
          <Card className="platform-support-panel"><PanelTitle icon={<FileText />} title="Resumen de soporte" subtitle="Estado de verificaciones generales de configuración." />
            <div className="platform-support-checks">
              <CheckRow icon={<Image />} label="Logo configurado" value={logoAvailable} optional />
              <CheckRow icon={<Image />} label="Portada configurada" value={coverAvailable} optional />
              <CheckRow icon={<CircleHelp />} label="Datos de contacto" value={contactAvailable} />
              <CheckRow icon={<MapPin />} label="Dirección registrada" value={Boolean(location.address)} />
              <CheckRow icon={<MapPin />} label="Coordenadas registradas" value={location.coordinates} />
              <CheckRow icon={<Clock3 />} label="Horarios configurados" value={scheduleAvailable} />
              <CheckRow icon={<Globe2 />} label="Página pública habilitada" value={pageEnabled} />
              <CheckRow icon={<Palette />} label="Colores del negocio definidos" value={colorsAvailable} optional />
            </div>
            {data.current.error && <p className="platform-support-unavailable"><Info size={14} />Error al verificar el conteo de reservas.</p>}
            {data.professionals.error && <p className="platform-support-unavailable"><Info size={14} />Error al verificar las membresías activas.</p>}
            {data.services.error && <p className="platform-support-unavailable"><Info size={14} />Error al verificar los servicios publicados.</p>}
            <p className="platform-support-footnote">Estos estados revisan los datos guardados. No confirman el funcionamiento de servicios externos ni el flujo completo de reservas.</p>
          </Card>
        </div>
      </>}
    </Card>
    <p className="platform-support-footer"><Info size={14} />Este módulo orienta y diagnostica. Los cambios se realizan en los módulos autorizados para mantener la trazabilidad.</p>
  </div>
}

function businessStatus(status) { return ({ active: 'Activo', inactive: 'Inactivo', pending: 'Pendiente', deleted: 'Archivado' }[status] || 'No disponible') }
function countText(result) { return result.error ? 'Error al verificar' : result.value === null ? 'No disponible' : result.value.toLocaleString('es-BO') }
function getFindings({ business, location, contactAvailable, scheduleAvailable, logoAvailable, coverAvailable, colorsAvailable, pageEnabled, serviceError }) {
  const result = []
  if (business.status !== 'active') result.push({ title: 'Negocio inactivo o archivado', description: `El estado registrado es «${businessStatus(business.status)}». La página pública no está disponible mientras el negocio no esté activo.`, severity: 'warning', recommendation: 'Revisar el estado desde Supervisar negocio.', route: `/plataforma/negocios/${encodeURIComponent(business.id)}` })
  if (!scheduleAvailable) result.push({ title: 'Horarios incompletos', description: 'No se encontraron bloques de atención con hora de inicio y fin en la configuración.', severity: 'warning', recommendation: 'Completar los horarios de atención en la configuración del negocio.', route: `/plataforma/negocios/${encodeURIComponent(business.id)}/editar` })
  if (!contactAvailable) result.push({ title: 'Canal de contacto incompleto', description: 'No hay teléfono, WhatsApp ni correo de contacto registrados.', severity: 'warning', recommendation: 'Agregar al menos un canal de contacto para facilitar las consultas.', route: `/plataforma/negocios/${encodeURIComponent(business.id)}/editar` })
  if (!location.address || !location.coordinates) result.push({ title: 'Ubicación incompleta', description: !location.address && !location.coordinates ? 'Faltan la dirección y las coordenadas.' : !location.address ? 'No hay una dirección legible registrada.' : 'No hay coordenadas registradas.' , severity: 'warning', recommendation: 'Revisar la dirección y el punto del mapa en la configuración. No se verificó la ubicación con un servicio externo.', route: `/plataforma/negocios/${encodeURIComponent(business.id)}/editar` })
  if (!pageEnabled) result.push({ title: 'Página pública desactivada', description: 'La configuración del negocio no tiene habilitada la publicación de su página.', severity: 'warning', recommendation: 'Revisar la publicación desde la configuración del negocio.', route: `/plataforma/negocios/${encodeURIComponent(business.id)}/editar` })
  if (!logoAvailable || !coverAvailable || !colorsAvailable) result.push({ title: 'Identidad visual por completar', description: `Falta${[!logoAvailable, !coverAvailable, !colorsAvailable].filter(Boolean).length > 1 ? 'n' : ''} ${[!logoAvailable && 'logo', !coverAvailable && 'portada', !colorsAvailable && 'colores'].filter(Boolean).join(', ')}. Los recursos gráficos y colores se muestran como recomendaciones.`, severity: 'info', recommendation: 'Completar la identidad visual si el negocio lo requiere.', route: `/plataforma/negocios/${encodeURIComponent(business.id)}/editar` })
  if (serviceError) result.push({ title: 'Servicios no verificables', description: 'No se pudo consultar el conteo de servicios públicos.', severity: 'info', recommendation: 'Reintentar el diagnóstico o revisar el acceso a los datos públicos.' })
  return result
}

function Metric({ icon, label, value, detail, tone }) {
  return <div className="platform-support-metric"><span className={`platform-support-metric-icon ${tone}`}>{icon}</span><div><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div></div>
}
function PanelTitle({ icon, title, subtitle }) {
  return <div className="platform-support-panel-title"><span>{icon}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div>
}
function Finding({ item, businessId }) {
  const Icon = item.severity === 'warning' ? AlertCircle : Info
  return <div className="platform-support-finding"><span className={`platform-support-finding-icon ${item.severity}`}><Icon size={17} /></span><div className="platform-support-finding-copy"><strong>{item.title}</strong><p>{item.description}</p><small><b>Recomendación:</b> {item.recommendation}</small></div><span className={`platform-support-severity ${item.severity}`}>{item.severity === 'warning' ? 'Advertencia' : 'Información'}</span>{item.route && businessId && <Link className="platform-support-find-link" to={item.route} aria-label={`Abrir: ${item.title}`}><ArrowRight size={15} /></Link>}</div>
}
function CheckRow({ icon, label, value, optional = false }) {
  return <div className="platform-support-check"><span className={`platform-support-check-icon ${value ? 'ok' : optional ? 'optional' : 'missing'}`}>{icon}</span><span>{label}{optional && <small> · recomendación</small>}</span><strong className={value ? 'ok' : optional ? 'optional' : 'missing'}>{value ? 'Correcto' : optional ? 'Opcional' : 'Incompleto'}</strong></div>
}
