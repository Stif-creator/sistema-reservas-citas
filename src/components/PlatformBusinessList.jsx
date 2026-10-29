import { useContext, useEffect, useState } from 'react'
import { collection, getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { Building2, Eye, Pencil, Search } from 'lucide-react'
import { db } from '../firebase/config'
import { safeImageUrl } from '../lib/brand'
import { ListSearchContext } from '../context/list-search-context'
import { useFeedback } from '../context/feedback-context'
import Card from './ui/Card'
import './platform-businesses.css'
import Button from './ui/Button'

const PAGE_SIZE = 10
export default function PlatformBusinessList({ refresh, busy, mutate, onArchive }) {
  const globalSearch = useContext(ListSearchContext)
  const { confirm } = useFeedback()
  const [search, setSearch] = useState('')
  const [prefix, setPrefix] = useState('')
  const [status, setStatus] = useState('all')
  const [archived, setArchived] = useState(false)
  const [position, setPosition] = useState({ key: '', index: 0, cursors: [null] })
  const [result, setResult] = useState({ items: [], loading: true, error: '' })
  const searchValue = (search || globalSearch || '').trim()
  const key = `${prefix}:${status}:${archived}:${refresh}`
  const index = position.key === key ? position.index : 0
  const cursor = position.key === key ? position.cursors[index] : null
  useEffect(() => {
    const timer = setTimeout(() => setPrefix(searchValue), 350)
    return () => clearTimeout(timer)
  }, [searchValue])
  useEffect(() => {
    let live = true
    const constraints = []
    if (status !== 'all') constraints.push(where('status', '==', status))
    else if (!archived) constraints.push(where('status', 'in', ['active', 'inactive', 'pending']))
    if (prefix) constraints.push(where('name', '>=', prefix), where('name', '<=', `${prefix}\uf8ff`))
    getDocs(query(collection(db, 'businesses'), ...constraints, orderBy('name'), ...(cursor ? [startAfter(cursor)] : []), limit(PAGE_SIZE + 1)))
      .then(snapshot => { if (live) setResult({ key, index, items: snapshot.docs.slice(0, PAGE_SIZE).map(item => ({ ...item.data(), id: item.id })), next: snapshot.size > PAGE_SIZE ? snapshot.docs[PAGE_SIZE - 1] : null, error: '', loading: false }) })
      .catch(() => { if (live) setResult({ key, index, items: [], error: 'No se pudieron cargar los negocios. Comprueba permisos e índices y vuelve a intentar.', loading: false }) })
    return () => { live = false }
  }, [key, index, cursor, prefix, status, archived])
  const loading = prefix !== searchValue || result.key !== key || result.index !== index || result.loading
  function move(next) {
    setPosition(previous => ({ key, index: next, cursors: next > index ? [...(previous.key === key ? previous.cursors.slice(0, index + 1) : [null]), result.next] : previous.cursors }))
  }
  return <Card title="Negocios" description="Configura cada negocio y consulta sus datos generales.">
    <div className="platform-business-filters">
      <label><span><Search size={15} />Buscar negocios por nombre</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Inicio del nombre…" /></label>
      <label>Estado<select aria-label="Filtrar por estado del negocio" value={status} onChange={event => setStatus(event.target.value)}><option value="all">Todos los estados</option><option value="active">Activos</option><option value="inactive">Desactivados</option><option value="deleted">Archivados</option></select></label>
      <label className="platform-archived-filter"><input type="checkbox" checked={archived} disabled={status !== 'all'} onChange={event => setArchived(event.target.checked)} />Incluir archivados</label>
    </div>
    <p className="text-xs text-muted mb-4">Busca desde el inicio del nombre, respetando mayúsculas y acentos. La búsqueda y el estado se aplican a todos los negocios, con diez resultados por página.</p>
    {loading ? <p className="platform-loading" role="status">Cargando negocios…</p> : result.error ? <p className="platform-alert" role="alert">{result.error}</p> : <>
      <div className="platform-business-table-head" aria-hidden="true"><span>Negocio</span><span>Administrador</span><span>Estado</span><span>Acciones</span></div>
      {result.items.map(b => <article key={b.id} className="platform-business-row">
        <div className="platform-business-name"><span className="platform-business-thumb">{safeImageUrl(b.logo?.url) ? <img src={b.logo.url} alt={`Logo de ${b.name}`} /> : <Building2 size={22} />}</span><div><h3>{b.name || b.id}</h3><small>{b.location?.city || 'Sin ciudad registrada'}</small></div></div>
        <div className="platform-business-admin"><strong>{b.administratorName || 'Responsable registrado'}</strong><small>{b.administratorEmail || b.ownerUserId || 'Sin información'}</small></div>
        <span className={`platform-status ${b.status}`}>{({ active: 'Activo', inactive: 'Desactivado', deleted: 'Archivado', pending: 'Pendiente' })[b.status] || 'Sin estado'}</span>
        <div className="platform-business-actions"><Link className="platform-link-button" to={`/plataforma/negocios/${encodeURIComponent(b.id)}`}><Eye size={15} />Ver detalles</Link><Link className="platform-link-button" to={`/plataforma/negocios/${encodeURIComponent(b.id)}/editar`}><Pencil size={15} />Editar negocio</Link>
          <Button disabled={busy} variant="secondary" onClick={async () => { if (b.status !== 'active' || await confirm({ title: '¿Desactivar este negocio?', description: 'El negocio dejará de estar disponible y sus usuarios perderán el acceso.', confirmLabel: 'Desactivar negocio' })) await mutate({ action: 'platformStatus', businessId: b.id, status: b.status === 'active' ? 'inactive' : 'active' }) }}>{b.status === 'active' ? 'Desactivar' : 'Activar / restaurar'}</Button>
          {b.status === 'inactive' && <Button disabled={busy} variant="ghost" onClick={() => onArchive(b)}>Archivar</Button>}
        </div>
      </article>)}
      {!result.items.length && <p className="platform-empty" role="status">No hay negocios para esta búsqueda.</p>}
    </>}
    <nav className="platform-pagination" aria-label="Paginación de negocios"><span>Página {index + 1}{!loading && !result.error ? ` · ${result.items.length} negocios` : ''}</span><div><Button variant="secondary" disabled={loading || busy || index === 0} onClick={() => move(index - 1)}>Anterior</Button><Button variant="secondary" disabled={loading || busy || !result.next || !!result.error} onClick={() => move(index + 1)}>Siguiente</Button></div></nav>
  </Card>
}
