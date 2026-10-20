import DataList from '../../components/ui/DataList'
import { useState } from 'react'
import { Heart, Search, SlidersHorizontal, Users } from 'lucide-react'
import { useClientBusiness } from '../../context/client-context'
import ServiceCard from '../../components/client/ServiceCard'
import CatalogState from '../../components/client/CatalogState'

export default function ClientServices() {
  const { business, services, categories, professionals, favorites, communityLoading, communityError, reloadCommunity } = useClientBusiness()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('')
  const [professionalId, setProfessionalId] = useState('')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const options = categories.filter(category => services.some(service => service.categoryId === category.id))
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0) || a.name.localeCompare(b.name))
  const categoryId = options.some(option => option.id === selected) ? selected : ''
  const normalize = value => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const filtered = services.filter(service => (!categoryId || service.categoryId === categoryId) &&
    (!professionalId || professionals.some(p => p.id === professionalId && p.serviceIds.includes(service.id))) &&
    (!onlyFavorites || favorites.some(f => f.kind === 'service' && f.targetId === service.id)) &&
    normalize(`${service.name} ${service.description || ''}`).includes(normalize(search.trim())))
    .sort((a, b) => a.name.localeCompare(b.name))
  return <section className="public-container client-section client-services-page">
    <header className="client-services-hero">
      <div><span className="client-overline">A TU MEDIDA</span><h1>Servicios</h1><p>Explora las opciones disponibles y encuentra la que mejor se adapta a ti.</p></div>
      <span className="client-services-hero-art" aria-hidden="true"><SlidersHorizontal size={34} /></span>
    </header>
    {communityLoading && <p role="status">Cargando profesionales y calificaciones…</p>}
    {communityError && <p className="public-alert" role="alert">No pudimos cargar profesionales y calificaciones. <button type="button" onClick={reloadCommunity}>Reintentar</button></p>}
    <section className="client-catalog-toolbar" aria-label="Buscar y filtrar servicios">
      <div className="client-catalog-controls">
        <label className="client-search"><Search size={18} aria-hidden="true" /><span className="sr-only">Buscar servicios</span><input type="search" placeholder="Buscar por nombre o descripción…" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label className="client-professional-filter"><Users size={17} aria-hidden="true" /><span className="sr-only">Filtrar servicios por profesional</span><select aria-label="Filtrar servicios por profesional" value={professionalId} disabled={communityLoading || !!communityError} onChange={e => setProfessionalId(e.target.value)}><option value="">Todos los profesionales</option>{professionals.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label>
        <button type="button" className="client-favorites-filter" aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites(value => !value)}><Heart size={17} fill={onlyFavorites ? 'currentColor' : 'none'} />{onlyFavorites ? 'Solo favoritos: activo' : 'Solo favoritos'}</button>
      </div>
      <div className="client-filters" role="group" aria-label="Filtrar por categoría">
        <button type="button" aria-pressed={!categoryId} onClick={() => setSelected('')}>Todos ({services.length})</button>
        {options.map(category => <button type="button" key={category.id} aria-pressed={categoryId === category.id} onClick={() => setSelected(category.id)}>{category.name}</button>)}
      </div>
    </section>
    <CatalogState>
      <div className="client-catalog-results"><p className="client-results" role="status">{filtered.length} {filtered.length === 1 ? 'servicio encontrado' : 'servicios encontrados'}</p></div>
      {filtered.length
        ? <DataList label="Servicios" items={filtered} search={false} resetKey={`${search}:${categoryId}:${professionalId}:${onlyFavorites}`}>{rows => <div className="client-service-grid">{rows.map(service => <ServiceCard key={service.id} service={service} category={categories.find(category => category.id === service.categoryId)?.name} currency={business.settings?.currencyCode} />)}</div>}</DataList>
        : <div className="client-empty"><Search size={30} /><h2>No hay servicios para mostrar</h2><p>Prueba otra búsqueda o ajusta los filtros para ver más opciones.</p></div>}
    </CatalogState>
  </section>
}
