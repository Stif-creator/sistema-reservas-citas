import { Link } from 'react-router-dom'
import { ArrowUpRight, Clock3, Sparkles } from 'lucide-react'
import { safeImageUrl } from '../../lib/brand'
import { formatPrice } from '../../lib/clientPresentation'

export default function ServiceCard({ service, category, currency }) {
  const image = safeImageUrl(service.image?.url)
  return <article className="client-service-card">
    <Link to={`/cliente/servicios/${encodeURIComponent(service.id)}`} className="client-service-image" aria-label={`Ver ${service.name}`}>
      {image ? <img src={image} alt="" loading="lazy" /> : <Sparkles size={48} strokeWidth={1.2} />}
      {category && <span className="client-category-tag">{category}</span>}
    </Link>
    <div className="client-service-copy">
      <h3><Link to={`/cliente/servicios/${encodeURIComponent(service.id)}`}>{service.name}</Link></h3>
      <p>{service.description || 'Conoce los detalles de este servicio.'}</p>
      <div className="client-service-meta"><span><Clock3 size={14} />{service.durationMinutes} minutos</span><strong>{formatPrice(service.price, service.currencyCode || currency)}</strong></div>
      <Link className="public-button secondary" to={`/cliente/servicios/${encodeURIComponent(service.id)}`}>Ver servicio <ArrowUpRight size={16} /></Link>
    </div>
  </article>
}
