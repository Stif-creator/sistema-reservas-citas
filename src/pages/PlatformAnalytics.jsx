import { useEffect, useState } from 'react'
import { collection, endAt, getCountFromServer, getDocs, limit, orderBy, query, startAt, Timestamp, where } from 'firebase/firestore'
import { BarChart3, Building2, CalendarCheck, Clock3, Users, Search, RotateCcw, UserRound, BriefcaseBusiness, RefreshCw } from 'lucide-react'
import { db } from '../firebase/config'
import { bookingRequest } from '../lib/bookingApi'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import '../components/superadmin.css'

const rangeOptions = { 30: 'Últimos 30 días', 90: 'Últimos 90 días', 180: 'Últimos 6 meses', 365: 'Últimos 12 meses' }
const statusInfo = { pending: ['Pendientes', '#f6b844'], confirmed: ['Confirmadas', '#24b879'], completed: ['Finalizadas', '#8b5cf6'], cancelled: ['Canceladas', '#ef5361'], no_show: ['No asistidas', '#94a3b8'] }
const dateRange = days => new Date(Date.now() - days * 86400000)

export default function PlatformAnalytics() {
  const [range, setRange] = useState(90)
  const [businessId, setBusinessId] = useState('')
  const [search, setSearch] = useState('')
  const [businesses, setBusinesses] = useState([])
  const [searching, setSearching] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [state, setState] = useState({ loading: true, error: '', stats: null })

  useEffect(() => {
    let live = true
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const base = collection(db, 'businesses')
        const term = search.trim()
        const q = term ? query(base, orderBy('name'), startAt(term), endAt(`${term}\uf8ff`), limit(50)) : query(base, orderBy('name'), limit(50))
        const snapshot = await getDocs(q)
        if (live) setBusinesses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(item => item.status !== 'deleted'))
      } catch { if (live) setBusinesses([]) }
      finally { if (live) setSearching(false) }
    }, search ? 200 : 0)
    return () => { live = false; clearTimeout(timer) }
  }, [search])

  useEffect(() => {
    let live = true
    async function load() {
      setState(previous => ({ ...previous, loading: true, error: '' }))
      try {
        if (businessId) {
          const stats = await bookingRequest({ action: 'platformAnalytics', businessId, range })
          if (live) setState({ loading: false, error: '', stats: { ...stats, scope: 'business' } })
          return
        }
        const now = new Date(), rangeStart = dateRange(range), start = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
        const buckets = Array.from({ length: (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth() + 1 }, (_, i) => {
          const from = new Date(start.getFullYear(), start.getMonth() + i, 1), to = new Date(from.getFullYear(), from.getMonth() + 1, 1)
          return { from: from < rangeStart ? rangeStart : from, to: to > now ? now : to, label: new Intl.DateTimeFormat('es-BO', { month: 'short', year: '2-digit' }).format(from).replace('.', '') }
        })
        const reservations = collection(db, 'reservations'), businessesRef = collection(db, 'businesses'), memberships = collection(db, 'memberships')
        const startStamp = Timestamp.fromDate(rangeStart)
        const statuses = Object.keys(statusInfo)
        const results = await Promise.all([
          getCountFromServer(query(businessesRef, where('status', '!=', 'deleted'))),
          getCountFromServer(query(businessesRef, where('status', '==', 'active'))),
          getCountFromServer(query(memberships, where('role', '==', 'admin'))),
          getCountFromServer(query(reservations, where('createdAt', '>=', startStamp))),
          ...statuses.map(status => getCountFromServer(query(reservations, where('createdAt', '>=', startStamp), where('status', '==', status)))),
          ...buckets.map(bucket => getCountFromServer(query(reservations, where('createdAt', '>=', Timestamp.fromDate(bucket.from)), where('createdAt', '<', Timestamp.fromDate(bucket.to))))),
          getDocs(query(businessesRef, limit(10))),
        ])
        if (!live) return
        const count = index => results[index].data().count, sample = results.at(-1).docs.map(doc => ({ ...doc.data(), id: doc.id })).filter(item => item.status !== 'deleted')
        setState({ loading: false, error: '', stats: { scope: 'global', range, totalBusinesses: count(0), activeBusinesses: count(1), administrators: count(2), reservations: count(3),
          statuses: statuses.map((status, i) => ({ status, value: count(4 + i) })), months: buckets.map((bucket, i) => ({ label: bucket.label, value: count(4 + statuses.length + i) })), businesses: sample } })
      } catch (error) { if (live) setState({ loading: false, error: error.code === 'permission-denied' ? 'No hay permisos para consultar estas métricas.' : 'No se pudieron calcular las estadísticas. Comprueba las reglas e índices de Firestore.', stats: null }) }
    }
    load()
    return () => { live = false }
  }, [range, businessId, refresh])

  const stats = state.stats
  const businessOptions = businessId && stats?.business?.id === businessId && !businesses.some(item => item.id === businessId) ? [stats.business, ...businesses] : businesses
  const clearFilters = () => { setBusinessId(''); setSearch(''); setRange(90) }
  return <div><PageHeader title="Estadísticas y reportes" description="Analiza la actividad de toda la plataforma o de un negocio específico de CitasPro." />
    <div className="platform-analytics-filters">
      <label className="platform-scope-control"><span>Alcance</span><span className="platform-analytics-select"><Building2 size={17} /><select aria-label="Alcance de estadísticas" value={businessId} onChange={event => setBusinessId(event.target.value)}><option value="">Toda la plataforma</option>{businessOptions.map(item => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</select></span></label>
      <label className="platform-scope-search"><span>Buscar negocio</span><span className="platform-analytics-select"><Search size={17} /><input aria-label="Buscar negocio por nombre" value={search} onChange={event => setSearch(event.target.value)} placeholder="Escribe el nombre del negocio" />{searching && <small>Buscando…</small>}</span></label>
      <label className="platform-period-label">Período<select className="platform-period" aria-label="Período de estadísticas" value={range} onChange={event => setRange(Number(event.target.value))}>{Object.entries(rangeOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button className="platform-analytics-clear" type="button" onClick={clearFilters}><RotateCcw size={16} />Limpiar filtros</button>
      <button className="platform-analytics-clear" type="button" onClick={() => setRefresh(v => v + 1)} disabled={state.loading}><RefreshCw size={16} />Actualizar</button>
    </div>
    {state.error && <p role="alert" className="platform-alert">{state.error}</p>}{state.loading && <p role="status" className="platform-loading">Calculando indicadores agregados…</p>}
    {!state.loading && stats && <>
      {stats.scope === 'business' ? <BusinessReport stats={stats} range={range} /> : <GlobalReport stats={stats} range={range} />}
    </>}
  </div>
}

function GlobalReport({ stats, range }) {
  return <><section className="platform-stat-grid platform-stat-grid-three"><Stat icon={Building2} label="Negocios registrados" value={stats.totalBusinesses} note={`${stats.activeBusinesses} activos`} /><Stat icon={CalendarCheck} label="Reservas del período" value={stats.reservations} note={rangeOptions[range]} /><Stat icon={Users} label="Membresías administradoras" value={stats.administrators} note="Asignaciones de rol administrador" /></section>
    <Charts stats={stats} />
    <Card className="platform-panel mt-4"><div className="platform-panel-head"><div><h2>Actividad de negocios</h2><p>Muestra de hasta diez negocios cargados para orientación.</p></div></div>{stats.businesses.length ? <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Negocio</th><th>Estado</th><th>Tipo</th></tr></thead><tbody>{stats.businesses.map(item => <tr key={item.id}><td><strong>{item.name || item.id}</strong></td><td>{item.status || 'Sin estado'}</td><td>{item.activityType || item.category || 'No configurado'}</td></tr>)}</tbody></table></div> : <p className="platform-empty">No hay negocios disponibles.</p>}</Card>
    <p className="platform-note mt-4">No se calculan ingresos: el precio de una reserva no confirma que se haya pagado. Las métricas son agregadas y se consultan al actualizar.</p></>
}

function BusinessReport({ stats, range }) {
  return <><div className="platform-business-report-heading"><div><h2>{stats.business.name}</h2><span>Estado general: <strong>{businessStatus(stats.business.status)}</strong></span></div><small>{rangeOptions[range]}</small></div>
    <section className="platform-stat-grid"><Stat icon={Users} label="Clientes registrados" value={stats.clients} note="Existencias actuales" /><Stat icon={UserRound} label="Profesionales" value={stats.professionals} note={`${stats.activeProfessionals} activos`} /><Stat icon={BriefcaseBusiness} label="Servicios" value={stats.services} note={`${stats.activeServices} activos`} /><Stat icon={CalendarCheck} label="Reservas del período" value={stats.reservations} note={rangeOptions[range]} /><Stat icon={Building2} label="Administradores asignados" value={stats.admins} note={`${stats.activeAdmins} activos`} /><Stat icon={CalendarCheck} label="Promociones activas" value={stats.activePromotions} note="Vigentes actualmente" /></section>
    <Charts stats={stats} />
    <Card className="platform-panel mt-4 platform-business-ops"><div className="platform-panel-head"><div><h2>Información operativa del negocio</h2><p>Resumen agregado, sin datos personales ni historiales individuales.</p></div><span className="platform-business-status">{businessStatus(stats.business.status)}</span></div>
      <div className="platform-ops-grid"><Stat icon={Users} label="Clientes registrados" value={stats.clients} note="Total actual" /><Stat icon={UserRound} label="Profesionales activos" value={stats.activeProfessionals} note="Membresías y perfiles activos" /><Stat icon={Building2} label="Usuarios autorizados" value={stats.activeAdmins + stats.activeProfessionals} note={`${stats.activeAdmins} administradores · ${stats.activeProfessionals} profesionales`} /><Stat icon={BriefcaseBusiness} label="Servicios activos" value={stats.activeServices} note="Disponibles en el negocio" /><Stat icon={CalendarCheck} label="Promociones activas" value={stats.activePromotions} note="Vigentes actualmente" /><Stat icon={Clock3} label="Actividad reciente" value={stats.recentActivity} note="Reservas creadas en los últimos 7 días" /></div>
    </Card><p className="platform-note mt-4">Los clientes se muestran únicamente como cantidad agregada. No se calculan ingresos ni se presentan perfiles personales.</p></>
}

function Charts({ stats }) {
  const max = Math.max(1, ...(stats.months || []).map(item => item.value)), total = stats.statuses.reduce((sum, item) => sum + item.value, 0)
  let angle = 0
  const stops = stats.statuses.map(item => { const color = statusInfo[item.status]?.[1] || '#94a3b8', next = angle + (total ? item.value / total * 360 : 0); const stop = `${color} ${angle}deg ${next}deg`; angle = next; return stop })
  const cancelled = stats.statuses.find(item => item.status === 'cancelled')?.value || 0
  return <div className="platform-grid-two platform-analytics-charts"><Card className="platform-panel"><div className="platform-panel-head"><div><h2>Reservas por mes</h2><p>Cantidad de reservas registradas en el período seleccionado.</p></div><BarChart3 size={20} /></div><div className="platform-panel-body">{stats.months.every(item => !item.value) ? <p className="platform-empty">No hay reservas en el período seleccionado.</p> : <div className="platform-chart" style={{ '--columns': stats.months.length }} role="img" aria-label={`Reservas mensuales: ${stats.months.map(item => `${item.label}: ${item.value}`).join(', ')}`}>{stats.months.map((item, index) => <div className="platform-chart-col" key={`${item.label}-${index}`}><strong>{item.value || ''}</strong><span className="platform-chart-bar" style={{ height: `${Math.max(item.value ? 5 : 0, item.value / max * 100)}%` }} /><small>{item.label}</small></div>)}</div>}</div></Card>
    <Card className="platform-panel"><div className="platform-panel-head"><div><h2>Estado de reservas</h2><p>Conteo por estado persistido durante el período.</p></div></div><div className="platform-donut-area"><div className="platform-donut" style={{ background: total ? `conic-gradient(${stops.join(', ')})` : '#e6edf6' }} role="img" aria-label={`Total de reservas: ${total}`}><span><strong>{total}</strong><small>Reservas<br />totales</small></span></div><div className="platform-donut-legend">{stats.statuses.map(item => <div key={item.status}><i style={{ background: statusInfo[item.status]?.[1] || '#94a3b8' }} /><span>{statusInfo[item.status]?.[0] || item.status}</span><strong>{item.value}</strong><small>{total ? `${(item.value / total * 100).toFixed(1)}%` : '0.0%'}</small></div>)}</div></div><div className="platform-cancel-rate"><strong>{total ? (cancelled / total * 100).toFixed(1) : '0.0'}% de cancelaciones</strong><span>Porcentaje calculado sobre reservas del período.</span></div></Card></div>
}

function businessStatus(status) { return ({ active: 'Activo', inactive: 'Inactivo', deleted: 'Archivado' })[status] || 'Sin estado' }
function Stat({ icon: Icon, label, value, note }) { return <article className="platform-stat"><span className="platform-stat-icon"><Icon size={20} /></span><span><small>{label}</small><strong>{value}</strong><span className="platform-stat-note">{note}</span></span></article> }
