import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Clock3, Sparkles, Tag, Wallet } from 'lucide-react'
import { useClientBusiness } from '../../context/client-context'
import { safeImageUrl } from '../../lib/brand'
import { formatPrice } from '../../lib/clientPresentation'
import BookingContactCard from '../../components/client/BookingContactCard'
import CatalogState from '../../components/client/CatalogState'

export default function ClientServiceDetail() {
  const { serviceId } = useParams()
  const { business, services, categories } = useClientBusiness()
  const service = services.find(item => item.id === serviceId)
  const image = safeImageUrl(service?.image?.url)
  const category = categories.find(item => item.id === service?.categoryId)
  return <section className="public-container client-section">
    <Link className="client-back" to="/cliente/servicios"><ArrowLeft size={17} />Volver a servicios</Link>
    <CatalogState>{!service ? <div className="client-empty"><h1>Servicio no disponible</h1><p>El servicio ya no está disponible en el catálogo de este negocio.</p><Link className="public-button" to="/cliente/servicios">Explorar servicios</Link></div> :
      <div className="client-detail-grid"><article>
        <div className="client-detail-cover">{image ? <img src={image} alt={service.name} /> : <Sparkles size={80} strokeWidth={1} />}</div>
        <div className="client-page-heading"><div>{category && <span className="client-overline">{category.name}</span>}<h1>{service.name}</h1><p>Conoce los detalles de tu próxima visita.</p></div></div>
        <dl className="client-service-facts">
          <div><Clock3 size={23} /><dt>Duración</dt><dd>{service.durationMinutes} minutos</dd></div>
          <div><Wallet size={23} /><dt>Precio</dt><dd>{formatPrice(service.price, service.currencyCode || business.settings?.currencyCode)}</dd></div>
          {category && <div><Tag size={23} /><dt>Categoría</dt><dd>{category.name}</dd></div>}
        </dl>
        <div className="client-description"><h2>Acerca del servicio</h2><p>{service.description || 'Contacta al negocio para conocer más detalles de este servicio.'}</p></div>
      </article><BookingContactCard /></div>}
    </CatalogState>
  </section>
}
