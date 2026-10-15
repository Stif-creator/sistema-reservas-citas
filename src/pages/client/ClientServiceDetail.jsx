import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Clock3, Sparkles, Tag, Wallet } from 'lucide-react'
import { useClientBusiness } from '../../context/client-context'
import { safeImageUrl } from '../../lib/brand'
import { formatPrice } from '../../lib/clientPresentation'
import BookingContactCard from '../../components/client/BookingContactCard'
import CatalogState from '../../components/client/CatalogState'
import FavoriteButton from '../../components/client/FavoriteButton'
import RatingSummary from '../../components/client/RatingSummary'
import DataList from '../../components/ui/DataList'

export default function ClientServiceDetail() {
  const { serviceId } = useParams()
  const { business, services, categories, professionals, reviews, communityLoading, communityError, reloadCommunity } = useClientBusiness()
  const serviceReviews = reviews.filter(r => r.serviceId === serviceId)
  const service = services.find(item => item.id === serviceId)
  const image = safeImageUrl(service?.image?.url)
  const category = categories.find(item => item.id === service?.categoryId)
  return <section className="public-container client-section">
    <Link className="client-back" to="/cliente/servicios"><ArrowLeft size={17} />Volver a servicios</Link>
    <CatalogState>{!service ? <div className="client-empty"><h1>Servicio no disponible</h1><p>El servicio ya no está disponible en el catálogo de este negocio.</p><Link className="public-button" to="/cliente/servicios">Explorar servicios</Link></div> :
      <div className="client-detail-grid"><article>
        <div className="client-detail-cover">{image ? <img src={image} alt={service.name} /> : <Sparkles size={80} strokeWidth={1} />}</div>
        <div className="client-page-heading"><div>{category && <span className="client-overline">{category.name}</span>}<h1>{service.name}</h1><p>Conoce los detalles de tu próxima visita.</p></div></div>
        <div className="client-detail-social"><FavoriteButton service={service} />{!communityLoading && !communityError && <RatingSummary reviews={serviceReviews} />}</div>
        <dl className="client-service-facts">
          <div><Clock3 size={23} /><dt>Duración</dt><dd>{service.durationMinutes} minutos</dd></div>
          <div><Wallet size={23} /><dt>Precio</dt><dd>{formatPrice(service.price, service.currencyCode || business.settings?.currencyCode)}</dd></div>
          {category && <div><Tag size={23} /><dt>Categoría</dt><dd>{category.name}</dd></div>}
        </dl>
        <div className="client-description"><h2>Acerca del servicio</h2><p>{service.description || 'Contacta al negocio para conocer más detalles de este servicio.'}</p></div>
        {communityLoading ? <p role="status">Cargando profesionales y opiniones…</p> : communityError ? <p className="public-alert" role="alert">No pudimos cargar profesionales y opiniones. <button onClick={reloadCommunity}>Reintentar</button></p> : <>
          <section className="client-community-section"><h2>Profesionales que realizan este servicio</h2><DataList label="Profesionales del servicio" items={professionals.filter(p => p.serviceIds.includes(service.id))} searchText={p => `${p.displayName} ${p.jobTitle}`}>{rows => <div className="client-professional-grid">{rows.map(p => <article className="client-professional-card" key={p.id}>
            {safeImageUrl(p.photoUrl) ? <img src={p.photoUrl} alt="" /> : <span className="client-professional-initial" aria-hidden="true">{p.displayName.slice(0, 1)}</span>}
            <h3>{p.displayName}</h3><p>{p.jobTitle}</p><RatingSummary professional reviews={reviews.filter(r => r.professionalId === p.id)} /><p>{p.bio}</p>
          </article>)}</div>}</DataList></section>
          <section className="client-community-section"><h2>Opiniones de clientes</h2><p>Opiniones de citas finalizadas. Puedes valorar tu experiencia desde el detalle de tu reserva.</p><Link className="client-back" to="/cliente/reservas">Ir a mis reservas</Link>
            <DataList label="Opiniones del servicio" items={serviceReviews} searchText={r => `${r.authorName} ${r.comment} ${r.professionalName || ''}`}>{rows => <div className="client-review-list">{rows.map(r => <article className="client-review-card" key={r.id}><div><strong>{r.authorName || 'Cliente'}</strong><RatingSummary reviews={[r]} /></div><p>{r.comment}</p>{r.professionalName && <small>Atención de {r.professionalName}{r.professionalRating ? ` · ${r.professionalRating}/5` : ''}</small>}</article>)}</div>}</DataList>
          </section>
        </>}
      </article><BookingContactCard serviceId={service.id} /></div>}
    </CatalogState>
  </section>
}
