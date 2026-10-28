import { useCallback, useEffect, useRef, useState } from 'react'
import { collection, doc, getDoc, getDocs, limit, query, startAfter, where } from 'firebase/firestore'
import { Building2, Search, ShieldCheck, Users } from 'lucide-react'
import { db } from '../firebase/config'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import '../components/superadmin.css'

const PAGE_SIZE = 25
export default function PlatformAdministrators() {
  const [page, setPage] = useState([]), [cursor, setCursor] = useState(null), [canNext, setCanNext] = useState(false), [canPrevious, setCanPrevious] = useState(false)
  const history = useRef([])
  const [search, setSearch] = useState(''), [status, setStatus] = useState('all')
  const [state, setState] = useState({ loading: true, error: '' })
  const load = useCallback(async (nextCursor = null, direction = 'initial') => {
    try {
      const base = query(collection(db, 'memberships'), where('role', '==', 'admin'))
      const snap = await getDocs(query(base, ...(nextCursor ? [startAfter(nextCursor)] : []), limit(PAGE_SIZE + 1)))
      const docs = snap.docs.slice(0, PAGE_SIZE)
      const userIds = [...new Set(docs.map(item => item.data().userId).filter(Boolean))]
      const businessIds = [...new Set(docs.map(item => item.data().businessId).filter(Boolean))]
      const [users, businesses] = await Promise.all([
        Promise.all(userIds.map(async id => { const item = await getDoc(doc(db, 'users', id)); return [id, item.exists() ? item.data() : null] })),
        Promise.all(businessIds.map(async id => { const item = await getDoc(doc(db, 'businesses', id)); return [id, item.exists() ? item.data() : null] }))
      ])
      setPage(docs.map(item => ({ ...item.data(), id: item.id, user: users.find(([id]) => id === item.data().userId)?.[1], business: businesses.find(([id]) => id === item.data().businessId)?.[1] })))
      setCursor(docs.at(-1) || null); setCanNext(snap.docs.length > PAGE_SIZE)
      history.current = direction === 'previous' ? history.current.slice(0, -1) : direction === 'next' ? [...history.current, nextCursor] : [null]
      setCanPrevious(history.current.length > 1)
    } catch (error) { setState({ loading: false, error: error.code === 'permission-denied' ? 'Firestore no permite consultar las membresías desde esta cuenta. Verifica las reglas desplegadas.' : 'No se pudieron cargar administradores.' }); return }
    setState({ loading: false, error: '' })
  }, [])
  useEffect(() => { const timer = window.setTimeout(() => load(), 0); return () => window.clearTimeout(timer) }, [load])
  const visible = page.filter(item => {
    const user = item.user || item
    const text = [user.firstName, user.lastName, user.email, item.business?.name, item.businessId].join(' ').toLocaleLowerCase('es')
    return (status === 'all' || item.status === status) && text.includes(search.trim().toLocaleLowerCase('es'))
  })
  return <div><PageHeader title="Administradores" description="Consulta las cuentas con rol de administrador y los negocios que tienen asignados." />
    <div className="platform-stat-grid platform-stat-grid-three"><Stat icon={Users} label="Membresías cargadas" value={page.length} /><Stat icon={Building2} label="Negocios en esta página" value={new Set(page.map(item => item.businessId)).size} /><Stat icon={ShieldCheck} label="Acceso activo" value={page.filter(item => item.status === 'active' && item.user?.status === 'active').length} /></div>
    <Card className="platform-panel platform-admins-panel"><div className="platform-panel-head"><div><h2>Asignaciones administrativas</h2><p>Consulta paginada de membresías. Los cambios de cuentas requieren una operación segura del servidor.</p></div><span>{page.length} registros</span></div>
      <div className="platform-filter-row platform-admin-filters"><label className="platform-search-field"><Search size={16} /><input aria-label="Buscar administradores" placeholder="Nombre, correo o negocio…" value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label="Filtrar estado" value={status} onChange={event => setStatus(event.target.value)}><option value="all">Todos los estados</option><option value="active">Activos</option><option value="inactive">Inactivos</option><option value="pending">Pendientes</option></select></div>
      {state.error && <p role="alert" className="platform-alert">{state.error}</p>}{state.loading && <p role="status" className="platform-loading">Cargando administradores…</p>}
      {!state.loading && !state.error && (visible.length ? <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Administrador</th><th>Correo</th><th>Negocio asignado</th><th>Rol</th><th>Estado de acceso</th></tr></thead><tbody>{visible.map(item => { const user = item.user || item; const name = [user.firstName || item.firstName, user.lastName || item.lastName].filter(Boolean).join(' ') || 'Cuenta sin nombre'; const access = item.status === 'active' && user.status === 'active'; return <tr key={item.id}><td><strong>{name}</strong></td><td>{user.email || item.email || 'No disponible'}</td><td>{item.business?.name || item.businessId || 'No disponible'}</td><td>Administrador</td><td><span className={`platform-status ${access ? 'active' : 'inactive'}`}>{access ? 'Activo' : item.status === 'pending' ? 'Pendiente' : 'Inactivo'}</span></td></tr> })}</tbody></table></div> : <p className="platform-empty">No hay administradores que coincidan con la búsqueda.</p>)}
      <footer className="platform-pagination"><span>Los administradores no se pueden suplantar ni editar desde esta tabla.</span><div><button disabled={state.loading || !canPrevious} onClick={() => { setState({ loading: true, error: '' }); load(history.current.at(-2) || null, 'previous') }}>Anterior</button><button disabled={state.loading || !canNext} onClick={() => { setState({ loading: true, error: '' }); load(cursor, 'next') }}>Siguiente</button></div></footer>
    </Card>
    <p className="platform-note">Para cambios de asignación que no estén disponibles en el flujo de creación de negocio, se requiere un mecanismo administrativo backend validado. Esta pantalla permanece en modo consulta.</p>
  </div>
}

function Stat({ icon: Icon, label, value }) { return <article className="platform-stat"><span className="platform-stat-icon"><Icon size={20} /></span><span><small>{label}</small><strong>{value}</strong></span></article> }
