import { useCallback, useEffect, useState } from 'react'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { History, Search, ShieldAlert } from 'lucide-react'
import { db } from '../firebase/config'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import '../components/superadmin.css'

const actionLabels = { platformCreate: 'Negocio creado', platformStatus: 'Estado de negocio actualizado', businessUpdate: 'Configuración del negocio actualizada', membershipUpdate: 'Membresía actualizada', superadmin_granted: 'Acceso de superadministrador otorgado', superadmin_revoked: 'Acceso de superadministrador retirado' }
export default function PlatformSecurity() {
  const [state, setState] = useState({ loading: true, error: '', items: [] }), [search, setSearch] = useState(''), [action, setAction] = useState('all')
  const load = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(50)))
      setState({ loading: false, error: '', items: snap.docs.map(item => ({ ...item.data(), id: item.id })) })
    } catch (error) { setState({ loading: false, error: error.code === 'permission-denied' ? 'Firestore no permite leer los registros de auditoría con las reglas actuales.' : 'No se pudieron cargar los registros de auditoría.', items: [] }) }
  }, [])
  useEffect(() => { const timer = window.setTimeout(() => load(), 0); return () => window.clearTimeout(timer) }, [load])
  const visible = state.items.filter(item => (action === 'all' || item.action === action) && `${actionLabels[item.action] || item.action} ${item.businessId || ''} ${item.actorUserId || ''} ${item.targetUserId || ''}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')))
  const actions = [...new Set(state.items.map(item => item.action).filter(Boolean))]
  return <div><PageHeader title="Seguridad y auditoría" description="Consulta eventos administrativos que ya están registrados en Firestore." />
    <p className="platform-note platform-audit-disclaimer"><ShieldAlert size={18} />La auditoría disponible depende de acciones que generan registros mediante los flujos existentes. Firebase Spark no ofrece un registro automático inviolable de cada lectura o inicio de sesión.</p>
    <Card className="platform-panel mt-4"><div className="platform-panel-head"><div><h2>Eventos administrativos</h2><p>Últimos 50 registros ordenados por fecha.</p></div><button className="platform-link-button" onClick={() => { setState(previous => ({ ...previous, loading: true, error: '' })); load() }} disabled={state.loading}>Actualizar</button></div>
      <div className="platform-filter-row platform-admin-filters"><label className="platform-search-field"><Search size={16} /><input aria-label="Buscar en auditoría" placeholder="Buscar actor o negocio…" value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label="Filtrar tipo de evento" value={action} onChange={event => setAction(event.target.value)}><option value="all">Todos los eventos</option>{actions.map(value => <option key={value} value={value}>{actionLabels[value] || value}</option>)}</select></div>
      {state.error && <p role="alert" className="platform-alert">{state.error}</p>}{state.loading && <p role="status" className="platform-loading">Cargando auditoría…</p>}
      {!state.loading && visible.length ? <ul className="platform-audit-list">{visible.map(item => <li key={item.id}><span className="platform-audit-icon"><History size={18} /></span><div><strong>{actionLabels[item.action] || item.action || 'Evento administrativo'}</strong><p>Negocio: {item.businessId || 'No especificado'} · Actor: {item.actorUserId || 'No especificado'}</p>{item.targetUserId && <p>Cuenta relacionada: {item.targetUserId}</p>}{item.status && <p>Estado registrado: {item.status}</p>}<time>{item.createdAt?.toDate ? new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short' }).format(item.createdAt.toDate()) : 'Fecha no disponible'}</time></div></li>)}</ul> : !state.loading && <p className="platform-empty">No hay eventos para mostrar.</p>}
    </Card>
  </div>
}
