import { useEffect, useState } from 'react'
import { collection, getCountFromServer, getDocs, limit, query, Timestamp, where } from 'firebase/firestore'
import { Activity, CalendarDays, Search } from 'lucide-react'
import { db } from '../firebase/config'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import '../components/superadmin.css'

export default function PlatformActivity() {
  const [days, setDays] = useState(30), [search, setSearch] = useState(''), [state, setState] = useState({ loading: true, error: '', items: [] })
  useEffect(() => {
    let live = true
    async function load() {
      try {
        const businesses = await getDocs(query(collection(db, 'businesses'), limit(20)))
        const since = Timestamp.fromDate(new Date(Date.now() - days * 86400000))
        const docs = businesses.docs.map(item => ({ ...item.data(), id: item.id })).filter(item => item.status !== 'deleted')
        const counts = await Promise.all(docs.map(item => getCountFromServer(query(collection(db, 'reservations'), where('businessId', '==', item.id), where('createdAt', '>=', since)))))
        if (live) setState({ loading: false, error: '', items: docs.map((item, index) => ({ ...item, reservations: counts[index].data().count })).sort((a, b) => b.reservations - a.reservations) })
      } catch (error) { if (live) setState({ loading: false, error: error.code === 'permission-denied' ? 'No hay permisos para consultar la actividad agregada.' : 'No se pudo cargar la actividad de negocios.', items: [] }) }
    }
    load()
    return () => { live = false }
  }, [days])
  const items = state.items.filter(item => `${item.name || ''} ${item.activityType || item.category || ''} ${item.status || ''}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')))
  return <div><PageHeader title="Actividad de negocios" description="Resumen de actividad por negocio sin mostrar detalles ni datos personales de clientes." />
    <div className="platform-activity-toolbar"><label><Search size={16} /><input aria-label="Buscar negocio" placeholder="Buscar negocio…" value={search} onChange={event => setSearch(event.target.value)} /></label><label className="platform-period-label"><CalendarDays size={15} />Período<select className="platform-period" aria-label="Período de actividad" value={days} onChange={event => { setState(previous => ({ ...previous, loading: true, error: '' })); setDays(Number(event.target.value)) }}><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option></select></label></div>
    {state.error && <p role="alert" className="platform-alert">{state.error}</p>}{state.loading && <p role="status" className="platform-loading">Consultando actividad agregada…</p>}
    {!state.loading && <Card className="platform-panel"><div className="platform-panel-head"><div><h2>Reservas registradas por negocio</h2><p>Se muestra una ventana de hasta 20 negocios por lectura. Cambiar el período vuelve a ejecutar los conteos.</p></div><Activity size={20} /></div>{items.length ? <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Negocio</th><th>Actividad</th><th>Estado del negocio</th><th>Reservas del período</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><strong>{item.name || item.id}</strong></td><td>{item.activityType || item.category || 'No configurada'}</td><td><span className={`platform-status ${item.status || ''}`}>{item.status || 'Sin estado'}</span></td><td><strong>{item.reservations}</strong></td></tr>)}</tbody></table></div> : <p className="platform-empty">No encontramos negocios para esta búsqueda.</p>}</Card>}
    <p className="platform-note mt-4">Este módulo no consulta clientes, datos clínicos, notas privadas ni documentos de reservas. Servicios y profesionales no se consultan globalmente porque las reglas actuales reservan esos perfiles al negocio.</p>
  </div>
}
