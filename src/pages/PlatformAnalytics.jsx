import { useEffect, useState } from 'react'
import { collection, getCountFromServer, getDocs, limit, query, Timestamp, where } from 'firebase/firestore'
import { BarChart3, Building2, CalendarCheck, CheckCircle2, CircleX, Clock3, Users } from 'lucide-react'
import { db } from '../firebase/config'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import '../components/superadmin.css'

const rangeOptions = { 90: 'Últimos 90 días', 180: 'Últimos 6 meses' }
const statuses = [['pending', 'Pendientes', Clock3], ['confirmed', 'Confirmadas', CheckCircle2], ['completed', 'Finalizadas', CalendarCheck], ['cancelled', 'Canceladas', CircleX], ['no_show', 'No asistidas', CircleX]]
export default function PlatformAnalytics() {
  const [range, setRange] = useState(90), [state, setState] = useState({ loading: true, error: '', stats: null })
  useEffect(() => {
    let live = true
    async function load() {
      try {
        const now = new Date()
        const rangeStart = new Date(now.getTime() - range * 86400000)
        const start = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
        const bucketCount = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth() + 1
        const buckets = Array.from({ length: bucketCount }, (_, i) => { const monthStart = new Date(start.getFullYear(), start.getMonth() + i, 1); const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1); return { from: monthStart < rangeStart ? rangeStart : monthStart, to: monthEnd > now ? now : monthEnd, label: new Intl.DateTimeFormat('es-BO', { month: 'short' }).format(monthStart).replace('.', '') } })
        const reservations = collection(db, 'reservations')
        const businesses = collection(db, 'businesses')
        const memberships = collection(db, 'memberships')
        const startStamp = Timestamp.fromDate(new Date(now.getTime() - range * 86400000))
        const operations = [
          getCountFromServer(query(businesses, where('status', '!=', 'deleted'))),
          getCountFromServer(query(businesses, where('status', '==', 'active'))),
          getCountFromServer(query(memberships, where('role', '==', 'admin'))),
          getCountFromServer(query(reservations, where('createdAt', '>=', startStamp))),
          ...statuses.map(([status]) => getCountFromServer(query(reservations, where('createdAt', '>=', startStamp), where('status', '==', status)))),
          ...buckets.map(bucket => getCountFromServer(query(reservations, where('createdAt', '>=', Timestamp.fromDate(bucket.from)), where('createdAt', '<', Timestamp.fromDate(bucket.to))))),
          getDocs(query(businesses, limit(10)))
        ]
        const results = await Promise.all(operations)
        if (!live) return
        const count = index => results[index].data().count
        const businessDocs = results.at(-1).docs.map(item => ({ ...item.data(), id: item.id })).filter(item => item.status !== 'deleted')
        setState({ loading: false, error: '', stats: { totalBusinesses: count(0), activeBusinesses: count(1), administrators: count(2), reservations: count(3), statuses: statuses.map(([status, label]) => ({ status, label, value: count(4 + statuses.findIndex(item => item[0] === status)) })), months: buckets.map((bucket, i) => ({ label: bucket.label, value: count(4 + statuses.length + i) })), businesses: businessDocs } })
      } catch (error) { if (live) setState({ loading: false, error: error.code === 'permission-denied' ? 'No hay permisos para consultar todas las métricas globales.' : 'No se pudieron calcular las estadísticas. Comprueba las reglas e índices de Firestore.', stats: null }) }
    }
    load()
    return () => { live = false }
  }, [range])
  const stats = state.stats, max = Math.max(1, ...(stats?.months || []).map(item => item.value))
  return <div><PageHeader title="Estadísticas y reportes" description="Métricas agregadas de la actividad de CitasPro, calculadas bajo demanda." />
    <label className="platform-period-label">Período<select className="platform-period" aria-label="Período de estadísticas" value={range} onChange={event => { setState(previous => ({ ...previous, loading: true, error: '' })); setRange(Number(event.target.value)) }}>{Object.entries(rangeOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {state.error && <p role="alert" className="platform-alert">{state.error}</p>}{state.loading && <p role="status" className="platform-loading">Calculando indicadores agregados…</p>}
    {!state.loading && stats && <><section className="platform-stat-grid platform-stat-grid-three"><Stat icon={Building2} label="Negocios registrados" value={stats.totalBusinesses} note={`${stats.activeBusinesses} activos`} /><Stat icon={CalendarCheck} label="Reservas del período" value={stats.reservations} note={rangeOptions[range]} /><Stat icon={Users} label="Membresías administradoras" value={stats.administrators} note="Incluye cada asignación de rol administrador" /></section>
      <div className="platform-grid-two"><Card className="platform-panel"><div className="platform-panel-head"><div><h2>Reservas por mes</h2><p>Conteos agregados sobre el campo de creación.</p></div><BarChart3 size={20} /></div><div className="platform-panel-body">{stats.months.every(item => !item.value) ? <p className="platform-empty">No hay reservas en el período seleccionado.</p> : <div className="platform-chart" style={{ '--columns': stats.months.length }} role="img" aria-label={`Reservas mensuales: ${stats.months.map(item => `${item.label}: ${item.value}`).join(', ')}`}>{stats.months.map(item => <div className="platform-chart-col" key={item.label}><strong>{item.value || ''}</strong><span className="platform-chart-bar" style={{ height: `${Math.max(2, item.value / max * 100)}%` }} /><small>{item.label}</small></div>)}</div>}</div></Card>
      <Card className="platform-panel"><div className="platform-panel-head"><div><h2>Estado de reservas</h2><p>Conteo por estado persistido.</p></div></div><div className="platform-status-metrics">{stats.statuses.map(item => <div key={item.status}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div><p className="platform-data-note">Estados derivados como “en curso” o “pendiente de cierre” no se cuentan aparte porque dependen de la hora actual.</p></Card></div>
      <Card className="platform-panel mt-4"><div className="platform-panel-head"><div><h2>Actividad de negocios</h2><p>Muestra de hasta diez negocios cargados para orientación; no representa un ranking total.</p></div></div>{stats.businesses.length ? <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Negocio</th><th>Estado</th><th>Tipo</th></tr></thead><tbody>{stats.businesses.map(item => <tr key={item.id}><td><strong>{item.name || item.id}</strong></td><td>{item.status || 'Sin estado'}</td><td>{item.activityType || item.category || 'No configurado'}</td></tr>)}</tbody></table></div> : <p className="platform-empty">No hay negocios disponibles.</p>}</Card>
      <p className="platform-note mt-4">No se calculan ingresos: el precio de una reserva no confirma que se haya pagado. Los gráficos usan consultas de conteo agregadas y períodos acotados; cada actualización ejecuta lecturas nuevas.</p>
    </>}
  </div>
}
function Stat({ icon: Icon, label, value, note }) { return <article className="platform-stat"><span className="platform-stat-icon"><Icon size={20} /></span><span><small>{label}</small><strong>{value}</strong><span className="platform-stat-note">{note}</span></span></article> }
