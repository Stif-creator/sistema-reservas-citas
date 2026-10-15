import { Link } from 'react-router-dom'
import { ArrowUpRight, Clock3, Sparkles } from 'lucide-react'
import { safeImageUrl } from '../../lib/brand'
import { formatPrice } from '../../lib/clientPresentation'
import FavoriteButton from './FavoriteButton'
import RatingSummary from './RatingSummary'
import { useClientBusiness } from '../../context/client-context'

export default function ServiceCard({ service, category, currency }) {
  const image = safeImageUrl(service.image?.url)
  const { reviews, communityLoading, communityError } = useClientBusiness()
  return <article className="client-service-card">
    <Link to={`/cliente/servicios/${encodeURIComponent(service.id)}`} className="client-service-image" aria-label={`Ver ${service.name}`}>
      {image ? <img src={image} alt="" loading="lazy" /> : <Sparkles size={48} strokeWidth={1.2} />}
      {category && <span className="client-category-tag">{category}</span>}
    </Link>
    <div className="client-service-copy">
      <h3><Link to={`/cliente/servicios/${encodeURIComponent(service.id)}`}>{service.name}</Link></h3>
      <div className="client-card-social"><FavoriteButton service={service} />{!communityLoading && !communityError && <RatingSummary reviews={reviews.filter(r => r.serviceId === service.id)} />}</div>
      <p>{service.description || 'Conoce los detalles de este servicio.'}</p>
      <div className="client-service-meta"><span><Clock3 size={14} />{service.durationMinutes} minutos</span><strong>{formatPrice(service.price, service.currencyCode || currency)}</strong></div>
      <Link className="public-button secondary" to={`/cliente/servicios/${encodeURIComponent(service.id)}`}>Ver servicio <ArrowUpRight size={16} /></Link>
    </div>
  </article>
}
