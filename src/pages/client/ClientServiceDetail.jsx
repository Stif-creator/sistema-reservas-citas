import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Clock3, MessageCircle, Sparkles, Star, Tag, Wallet } from 'lucide-react'
import { useClientBusiness } from '../../context/client-context'
import { safeImageUrl } from '../../lib/brand'
import { dateMillis, formatPrice } from '../../lib/clientPresentation'
import { getServiceProfessionals } from '../../lib/serviceProfessionals'
import { bookingEnabled } from '../../lib/bookingApi'
import BookingContactCard from '../../components/client/BookingContactCard'
import CatalogState from '../../components/client/CatalogState'
import FavoriteButton from '../../components/client/FavoriteButton'
import RatingSummary from '../../components/client/RatingSummary'
import DataList from '../../components/ui/DataList'

function reviewDate(value) {
  const stamp = dateMillis(value)
  return Number.isFinite(stamp)
    ? new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeZone: 'UTC' }).format(stamp)
    : ''
}

export default function ClientServiceDetail() {
  const { serviceId } = useParams()
  const { business, services, categories, professionals, reviews, communityLoading, communityError, reloadCommunity } = useClientBusiness()
  const serviceReviews = reviews.filter(r => r.serviceId === serviceId)
  const service = services.find(item => item.id === serviceId)
  const image = safeImageUrl(service?.image?.url)
  const category = categories.find(item => item.id === service?.categoryId)
  const serviceProfessionals = getServiceProfessionals(service, professionals)
  const ratingValues = serviceReviews.map(review => review.rating).filter(rating => Number.isInteger(rating) && rating >= 1 && rating <= 5)
  const averageRating = ratingValues.length
    ? (ratingValues.reduce((total, rating) => total + rating, 0) / ratingValues.length).toLocaleString('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : ''
  return <section className="public-container client-section">
    <Link className="client-back" to="/cliente/servicios"><ArrowLeft size={17} />Volver a servicios</Link>
    <CatalogState>{!service ? <div className="client-empty"><h1>Servicio no disponible</h1><p>El servicio ya no está disponible en el catálogo de este negocio.</p><Link className="public-button" to="/cliente/servicios">Explorar servicios</Link></div> :
      <div className="client-detail-layout">
        <div className="client-detail-grid">
          <article className="client-detail-main">
            <div className="client-detail-cover">{image ? <img src={image} alt={service.name} /> : <Sparkles size={64} strokeWidth={1.2} aria-hidden="true" />}</div>
            <div className="client-detail-title">{category && <span className="client-overline">{category.name}</span>}<h1>{service.name}</h1><p>{service.description || 'Conoce los detalles y profesionales disponibles para este servicio.'}</p></div>
            <div className="client-detail-social"><FavoriteButton service={service} />{communityLoading ? <span role="status">Cargando opiniones…</span> : !communityError && <RatingSummary reviews={serviceReviews} />}</div>
            <dl className="client-service-facts">
              <div><Clock3 size={21} /><dt>Duración</dt><dd>{service.durationMinutes} minutos</dd></div>
              <div><Wallet size={21} /><dt>Precio</dt><dd>{formatPrice(service.price, service.currencyCode || business.settings?.currencyCode)}</dd></div>
              {category && <div><Tag size={21} /><dt>Categoría</dt><dd>{category.name}</dd></div>}
            </dl>
            <div className="client-description"><h2>Acerca del servicio</h2><p>{service.description || 'Contacta al negocio para conocer más detalles de este servicio.'}</p></div>
          </article>
          <BookingContactCard serviceId={service.id} />
        </div>
        {communityLoading ? <p role="status" className="client-community-loading">Cargando profesionales y opiniones…</p> : communityError
          ? <p className="public-alert" role="alert">No pudimos cargar profesionales y opiniones. <button type="button" onClick={reloadCommunity}>Reintentar</button></p>
          : <>
            <section className="client-community-section client-detail-community">
              <div className="client-community-heading"><div><span className="client-section-kicker">ATENCIÓN ESPECIALIZADA</span><h2>Profesionales que realizan este servicio</h2><p>Elige con quién prefieres reservar.</p></div></div>
              <DataList label="Profesionales del servicio" items={serviceProfessionals} searchText={professional => `${professional.displayName} ${professional.jobTitle} ${professional.bio}`}>{rows => rows.length
                ? <div className="client-professional-grid">{rows.map(professional => {
                  const photo = safeImageUrl(professional.photoUrl)
                  const professionalReviews = reviews.filter(review => review.professionalId === professional.id)
                  return <article className="client-professional-card" key={professional.id}>
                    {photo ? <img className="client-professional-photo" src={photo} alt="" loading="lazy" /> : <span className="client-professional-initial" aria-hidden="true">{professional.displayName?.trim().charAt(0).toUpperCase() || 'P'}</span>}
                    <div className="client-professional-info"><h3>{professional.displayName}</h3><p className="client-professional-specialty">{professional.jobTitle || 'Profesional del equipo'}</p>{professionalReviews.length > 0 && <RatingSummary professional reviews={professionalReviews} />}</div>
                    {professional.bio && <p className="client-professional-bio">{professional.bio}</p>}
                    {bookingEnabled && <Link className="public-button" to={`/cliente/reservar?servicio=${encodeURIComponent(service.id)}&profesional=${encodeURIComponent(professional.id)}`}><CalendarDays size={16} />Ver disponibilidad</Link>}
                  </article>
                })}</div>
                : <p className="client-community-empty">Todavía no hay profesionales asociados a este servicio.</p>}</DataList>
            </section>
            <section className="client-community-section client-detail-community">
              <div className="client-community-heading"><div><span className="client-section-kicker">EXPERIENCIAS REALES</span><h2>Opiniones de clientes</h2><p>Valoraciones de clientes que finalizaron este servicio.</p></div><Link className="client-review-link" to="/cliente/reservas"><MessageCircle size={16} />Mis reservas</Link></div>
              {ratingValues.length > 0
                ? <div className="client-review-overview">
                  <div className="client-review-score"><strong>{averageRating}</strong><span className="client-review-score-stars" aria-label={`${averageRating} de 5 estrellas`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={17} fill={index < Math.round(Number(averageRating.replace(',', '.'))) ? 'currentColor' : 'none'} />)}</span><span>{ratingValues.length} {ratingValues.length === 1 ? 'valoración' : 'valoraciones'}</span></div>
                  <div className="client-rating-distribution" aria-label="Distribución de valoraciones">{[5, 4, 3, 2, 1].map(stars => {
                    const count = ratingValues.filter(rating => rating === stars).length
                    const percent = Math.round(count / ratingValues.length * 100)
                    return <div className="client-rating-row" key={stars} aria-label={`${stars} estrellas: ${count} valoraciones`}><span>{stars} <Star size={13} fill="currentColor" /></span><span className="client-rating-bar"><i style={{ width: `${percent}%` }} /></span><strong>{count}</strong></div>
                  })}</div>
                </div>
                : <div className="client-community-empty client-reviews-empty"><Star size={25} /><h3>Este servicio todavía no tiene opiniones</h3><p>Cuando un cliente comparta su experiencia, aparecerá aquí.</p></div>}
              {serviceReviews.length > 0 && <DataList label="Opiniones del servicio" items={serviceReviews} searchText={review => `${review.authorName} ${review.comment} ${review.professionalName || ''}`}>{rows => <div className="client-review-list">{rows.map(review => {
                const publishedDate = reviewDate(review.reviewedAt)
                return <article className="client-review-card" key={review.id}><div className="client-review-card-heading"><div><strong>{review.authorName || 'Cliente'}</strong>{publishedDate && <time dateTime={new Date(dateMillis(review.reviewedAt)).toISOString()}>{publishedDate}</time>}</div><RatingSummary reviews={[review]} /></div><p>{review.comment}</p>{review.professionalName && <small>Atención de {review.professionalName}{review.professionalRating ? ` · ${review.professionalRating}/5` : ''}</small>}</article>
              })}</div>}</DataList>}
            </section>
          </>}
      </div>}
    </CatalogState>
  </section>
}
