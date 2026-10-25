import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { collection, getDocs, limit, query, startAfter, where } from 'firebase/firestore'
import { ArrowDown, ArrowUp, RotateCcw, Search, Store } from 'lucide-react'
import { db } from '../firebase/config'
import usePageMetadata from '../hooks/usePageMetadata'
import { PlatformBusinessCard } from './PlatformHome'
import './platform-site.css'

const BATCH_SIZE = 24
const PAGE_SIZE = 9
const text = value => typeof value === 'string' ? value.trim() : ''
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
const activityOf = business => [business.category, business.activity, business.businessType].map(text).find(Boolean) || ''

export default function PublicBusinesses() {
  const [params] = useSearchParams()
  const [businesses, setBusinesses] = useState([])
  const [search, setSearch] = useState(params.get('q') || '')
  const [category, setCategory] = useState('')
  const [city, setCity] = useState('')
  const [sort, setSort] = useState('az')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const cursor = useRef(null)
  const busy = useRef(false)
  usePageMetadata('Negocios disponibles | CitasPro', 'Explora negocios publicados en CitasPro y encuentra los servicios disponibles cerca de ti.')

  const loadMore = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setLoading(!cursor.current)
    setLoadingMore(Boolean(cursor.current))
    try {
      const constraints = [where('status', '==', 'active'), where('settings.publicPageEnabled', '==', true), ...(cursor.current ? [startAfter(cursor.current)] : []), limit(BATCH_SIZE)]
      const snapshot = await getDocs(query(collection(db, 'businesses'), ...constraints))
      const next = snapshot.docs.map(item => ({ ...item.data(), id: item.id }))
      cursor.current = snapshot.docs.at(-1) || cursor.current
      setBusinesses(previous => [...previous, ...next])
      setHasMore(snapshot.docs.length === BATCH_SIZE)
      setError('')
    } catch {
      setError('No pudimos cargar el catálogo. Comprueba tu conexión e inténtalo de nuevo.')
    } finally {
      busy.current = false
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => { loadMore() }, [loadMore])

  const categories = useMemo(() => [...new Set(businesses.map(activityOf).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [businesses])
  const cities = useMemo(() => [...new Set(businesses.map(item => text(item.location?.city)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [businesses])
  const results = useMemo(() => {
    const needle = normalize(search.trim())
    return businesses.filter(item => {
      const serviceNames = Array.isArray(item.serviceNames) ? item.serviceNames.join(' ') : text(item.serviceNames)
      const matchesText = !needle || normalize([item.name, item.description, activityOf(item), item.location?.city, item.location?.stateRegion, serviceNames].map(text).join(' ')).includes(needle)
      return matchesText && (!category || activityOf(item) === category) && (!city || text(item.location?.city) === city)
    }).sort((a, b) => sort === 'za' ? text(b.name).localeCompare(text(a.name), 'es') : text(a.name).localeCompare(text(b.name), 'es'))
  }, [businesses, search, category, city, sort])
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visible = results.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const clearFilters = () => { setSearch(''); setCategory(''); setCity(''); setSort('az'); setPage(1) }

  return <main id="contenido" className="platform-page platform-directory" tabIndex={-1}>
    <section className="platform-container platform-directory-head"><span className="platform-eyebrow">CATÁLOGO PÚBLICO</span><h1>Encuentra tu próximo servicio</h1><p>Explora los negocios disponibles en CitasPro y encuentra lo que necesitas.</p></section>
    <section className="platform-container platform-directory-content" aria-label="Catálogo de negocios">
      <div className="platform-filter-card">
        <label className="platform-filter-search"><span className="sr-only">Buscar por negocio o ubicación</span><Search size={18} /><input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} placeholder="Buscar negocio o ubicación…" /></label>
        {categories.length > 0 && <label className="platform-filter-field">Actividad<select aria-label="Filtrar por actividad" value={category} onChange={event => { setCategory(event.target.value); setPage(1) }}><option value="">Todas las actividades</option>{categories.map(option => <option key={option} value={option}>{option}</option>)}</select></label>}
        {cities.length > 0 && <label className="platform-filter-field">Ubicación<select aria-label="Filtrar por ubicación" value={city} onChange={event => { setCity(event.target.value); setPage(1) }}><option value="">Todas las ubicaciones</option>{cities.map(option => <option key={option} value={option}>{option}</option>)}</select></label>}
        <label className="platform-filter-field">Ordenar por<select aria-label="Ordenar negocios" value={sort} onChange={event => { setSort(event.target.value); setPage(1) }}><option value="az">Nombre (A–Z)</option><option value="za">Nombre (Z–A)</option></select></label>
        <button type="button" className="platform-clear-filter" onClick={clearFilters}><RotateCcw size={15} />Limpiar filtros</button>
      </div>
      <div className="platform-results-line"><p aria-live="polite">{loading ? 'Cargando negocios…' : `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'} entre ${businesses.length} negocios cargados`}</p>{hasMore && !loading && <span>Hay más negocios disponibles</span>}</div>
      {error && <div className="platform-error" role="alert"><p>{error}</p><button type="button" onClick={loadMore}>Reintentar</button></div>}
      {loading ? <div className="platform-empty" role="status">Cargando negocios publicados…</div> : visible.length ? <div className="platform-business-grid">{visible.map(business => <PlatformBusinessCard key={business.id} business={business} />)}</div> : !error && <div className="platform-empty"><Store size={29} /><h2>{businesses.length ? 'No encontramos coincidencias' : 'Aún no hay negocios publicados'}</h2><p>{businesses.length ? 'Prueba con otra búsqueda o limpia los filtros.' : 'Vuelve más adelante para explorar negocios disponibles.'}</p></div>}
      {results.length > PAGE_SIZE && <nav className="platform-pagination" aria-label="Paginación de negocios"><button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={currentPage === 1}><ArrowUp size={15} />Anterior</button><span>Página {currentPage} de {pageCount}</span><button type="button" onClick={() => setPage(value => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount}>Siguiente <ArrowDown size={15} /></button></nav>}
      {hasMore && <div className="platform-centered-action"><button type="button" className="platform-button secondary" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Cargando…' : 'Cargar más negocios'}</button></div>}
    </section>
  </main>
}
