import { useEffect, useState } from 'react'
import { safeImageUrl } from '../lib/brand'
import { Link } from 'react-router-dom'
import { collection, getCountFromServer, getDocs, limit, query, Timestamp, where } from 'firebase/firestore'
import { Activity, AlertTriangle, ArrowRight, Building2, CalendarDays, Headset, Users } from 'lucide-react'
import { db } from '../firebase/config'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import '../components/superadmin.css'

const periods = { 30: 'Últimos 30 días', 90: 'Últimos 90 días', 365: 'Últimos 12 meses' }
const dateValue = value => value?.toDate ? value.toDate() : value ? new Date(value) : null
const statusLabel = status => ({ active: 'Activo', inactive: 'Desactivado', pending: 'Pendiente', deleted: 'Archivado' }[status] || 'Sin estado')

export default function PlatformDashboard() {
  const [period, setPeriod] = useState(90)
  const [state, setState] = useState({ loading: true, error: '', businesses: [], stats: null, chart: [] })
  useEffect(() => {
    let live = true
    async function load() {
      try {
        const businessesRef = collection(db, 'businesses')
        const reservationsRef = collection(db, 'reservations')
        const membershipsRef = collection(db, 'memberships')
        const now = new Date()
        const rangeStart = new Date(now.getTime() - period * 86400000)
        const firstMonth = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
        const months = (now.getFullYear() - firstMonth.getFullYear()) * 12 + now.getMonth() - firstMonth.getMonth() + 1
        const reservationCounts = Array.from({ length: months }, (_, index) => {
          const monthStart = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + index, 1)
          const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
          const from = monthStart < rangeStart ? rangeStart : monthStart
          const to = monthEnd > now ? now : monthEnd
          return { label: new Intl.DateTimeFormat('es-BO', { month: 'short' }).format(monthStart).replace('.', ''), from, to }
        })
        const [businessTotal, activeTotal, adminTotal, businessPage, ...reservationTotals] = await Promise.all([
          getCountFromServer(query(businessesRef)),
          getCountFromServer(query(businessesRef, where('status', '==', 'active'))),
          getCountFromServer(query(membershipsRef, where('role', '==', 'admin'))),
          getDocs(query(businessesRef, limit(8))),
          ...reservationCounts.map(bucket => getCountFromServer(query(reservationsRef, where('createdAt', '>=', Timestamp.fromDate(bucket.from)), where('createdAt', '<', Timestamp.fromDate(bucket.to)))))
        ])
        if (!live) return
        const chart = reservationCounts.map((bucket, index) => ({ label: bucket.label, value: reservationTotals[index].data().count }))
        setState({ loading: false, error: '', businesses: businessPage.docs.map(doc => ({ ...doc.data(), id: doc.id })).filter(item => item.status !== 'deleted').sort((a, b) => (a.name || '').localeCompare(b.name || '')).slice(0, 5), stats: { businesses: businessTotal.data().count, active: activeTotal.data().count, administrators: adminTotal.data().count, reservations: chart.reduce((sum, item) => sum + item.value, 0) }, chart })
      } catch (error) {
        if (live) setState({ loading: false, error: `No se pudo cargar el resumen global. ${error.code === 'permission-denied' ? 'Revisa el acceso global del superadministrador en Firestore.' : 'Comprueba la conexión y vuelve a intentarlo.'}`, businesses: [], stats: null, chart: [] })
      }
    }
    load()
    return () => { live = false }
  }, [period])
  const max = Math.max(1, ...state.chart.map(item => item.value))
  return <div>
    <PageHeader title="Resumen de la plataforma" description="Supervisa los negocios y la actividad general de CitasPro." />
    <div className="platform-dashboard-toolbar"><span className="platform-dashboard-caption"><Activity size={15} />Datos agregados de la plataforma</span><label className="platform-period-label">Período<select aria-label="Período del resumen" className="platform-period" value={period} onChange={event => { setState(previous => ({ ...previous, loading: true, error: '' })); setPeriod(Number(event.target.value)) }}>{Object.entries(periods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    {state.error && <p role="alert" className="platform-alert">{state.error}</p>}
    {state.loading && <p className="platform-loading" role="status">Cargando indicadores globales…</p>}
    {!state.loading && !state.error && state.stats && <>
      <section className="platform-stat-grid" aria-label="Indicadores de la plataforma">
        <Stat icon={Building2} label="Negocios registrados" value={state.stats.businesses} note={`${state.stats.active} activos`} />
        <Stat icon={CalendarDays} label="Reservas del período" value={state.stats.reservations} note={periods[period]} tone="teal" />
        <Stat icon={Users} label="Administradores" value={state.stats.administrators} note="Asignaciones registradas" tone="violet" />
        <Stat icon={AlertTriangle} label="Incidencias abiertas" value="—" note="No hay una fuente de incidencias en el sistema" tone="rose" />
      </section>
      <div className="platform-grid-two">
        <Card className="platform-panel platform-chart-card"><div className="platform-panel-head"><div><h2>Actividad de reservas</h2><p>Conteos por mes según la fecha de creación</p></div></div><div className="platform-panel-body">{state.chart.every(item => item.value === 0) ? <p className="platform-empty">No hay reservas registradas en este período.</p> : <div className="platform-chart" style={{ '--columns': state.chart.length }} role="img" aria-label={`Reservas por mes: ${state.chart.map(item => `${item.label}: ${item.value}`).join(', ')}`}>{state.chart.map(item => <div className="platform-chart-col" key={item.label} title={`${item.label}: ${item.value}`}><strong>{item.value || ''}</strong><span className="platform-chart-bar" style={{ height: `${Math.max(2, item.value / max * 100)}%` }} /><small>{item.label}</small></div>)}</div>}<p className="platform-data-note">Los conteos usan agregaciones de Firestore por rango; el panel no descarga documentos de reservas.</p></div></Card>
        <Card className="platform-panel"><div className="platform-panel-head"><div><h2>Estado de los negocios</h2><p>Muestra de hasta cinco negocios; no es un listado completo</p></div><Link className="platform-link-button" to="/plataforma/negocios">Ver todos <ArrowRight size={14} /></Link></div><div className="platform-panel-body">{state.businesses.length ? state.businesses.map(item => <BusinessMini key={item.id} item={item} />) : <p className="platform-empty">Todavía no hay negocios registrados.</p>}</div></Card>
      </div>
      <Card className="platform-panel platform-business-table-card"><div className="platform-panel-head"><div><h2>Negocios registrados</h2><p>Muestra de hasta cinco negocios: consulta su responsable y abre el detalle.</p></div><Link className="platform-link-button" to="/plataforma/negocios">Administrar negocios <ArrowRight size={14} /></Link></div><div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Negocio</th><th>Administrador responsable</th><th>Estado</th><th>Registro</th><th>Acción</th></tr></thead><tbody>{state.businesses.map(item => <tr key={item.id}><td><strong>{item.name || item.id}</strong><small className="platform-cell-subtitle">{item.activityType || item.category || 'Categoría no configurada'}</small></td><td>{item.administratorName || item.ownerName || 'Consultar detalle'}</td><td><Status value={item.status} /></td><td>{dateValue(item.createdAt) ? new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium' }).format(dateValue(item.createdAt)) : '—'}</td><td><Link className="platform-action-button primary" to={`/plataforma/negocios/${encodeURIComponent(item.id)}`}>Supervisar <ArrowRight size={14} /></Link></td></tr>)}</tbody></table></div></Card>
      <section className="platform-support-box platform-dashboard-support"><span className="platform-stat-icon"><Headset size={22} /></span><div><strong>Soporte técnico de solo lectura</strong><p>Consulta diagnósticos sin iniciar sesión como otra persona ni cambiar datos operativos del negocio.</p></div><Link className="platform-action-button primary" to="/plataforma/soporte">Abrir soporte <ArrowRight size={14} /></Link></section>
    </>}
  </div>
}

function Stat({ icon: Icon, label, value, note, tone = 'blue' }) { return <article className="platform-stat"><span className={`platform-stat-icon ${tone}`}><Icon size={21} /></span><span><small>{label}</small><strong>{value}</strong><span className="platform-stat-note">{note}</span></span></article> }
function Status({ value }) { return <span className={`platform-status ${value || 'unknown'}`}>{statusLabel(value)}</span> }
function BusinessMini({ item }) { return <article className="platform-business-mini"><span className="platform-business-logo">{safeImageUrl(item.logo?.url) ? <img src={item.logo.url} alt="" /> : <Building2 size={19} />}</span><span><strong>{item.name || item.id}</strong><small>{item.activityType || item.category || 'Tipo no configurado'}</small></span><Status value={item.status} /><Link className="platform-link-button" to={`/plataforma/negocios/${encodeURIComponent(item.id)}`}>Ver supervisión <ArrowRight size={13} /></Link></article> }
