import { useState } from 'react'
import { Search } from 'lucide-react'
import { useClientBusiness } from '../../context/client-context'
import ServiceCard from '../../components/client/ServiceCard'
import CatalogState from '../../components/client/CatalogState'

export default function ClientServices() {
  const { business, services, categories } = useClientBusiness()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('')
  const options = categories.filter(category => services.some(service => service.categoryId === category.id))
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0) || a.name.localeCompare(b.name))
  const categoryId = options.some(option => option.id === selected) ? selected : ''
  const normalize = value => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const filtered = services.filter(service => (!categoryId || service.categoryId === categoryId) &&
    normalize(`${service.name} ${service.description || ''}`).includes(normalize(search.trim())))
    .sort((a, b) => a.name.localeCompare(b.name))
  return <section className="public-container client-section">
    <div className="client-page-heading"><div><span className="client-overline">ENCUENTRA TU PRÓXIMO MOMENTO</span><h1>Servicios</h1><p>Explora nuestros servicios y elige el que mejor se adapte a ti.</p></div>
      <label className="client-search"><Search size={18} /><span className="sr-only">Buscar servicios</span><input type="search" placeholder="Buscar un servicio…" value={search} onChange={event => setSearch(event.target.value)} /></label>
    </div>
    <div className="client-filters" role="group" aria-label="Categorías de servicios">
      <button aria-pressed={!categoryId} onClick={() => setSelected('')}>Todos</button>
      {options.map(category => <button key={category.id} aria-pressed={categoryId === category.id} onClick={() => setSelected(category.id)}>{category.name}</button>)}
    </div>
    <CatalogState empty={!filtered.length}><p className="client-results" role="status">{filtered.length} {filtered.length === 1 ? 'servicio disponible' : 'servicios disponibles'}</p><div className="client-service-grid">{filtered.map(service => <ServiceCard key={service.id} service={service} category={categories.find(category => category.id === service.categoryId)?.name} currency={business.settings?.currencyCode} />)}</div></CatalogState>
  </section>
}
