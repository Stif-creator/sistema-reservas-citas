import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { ArrowRight, CalendarDays, Clock3, Eye, Heart, MapPin, Phone, Search, Sparkles, Star, Tag, Target, Wallet } from 'lucide-react'
import { db } from '../firebase/config'
import { usePublicBusiness } from '../context/PublicBusinessContext'
import { safeImageUrl } from '../lib/brand'
import { bookingEnabled, bookingRequest } from '../lib/bookingApi'
import { formatPrice } from '../lib/clientPresentation'
import '../components/shared/site.css'
import './business-public-home.css'

const PAGE_SIZE = 8
const weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
const initials = value => String(value || 'Profesional').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
const publicDate = value => Number.isFinite(value) ? new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium' }).format(value) : ''
const countryName = code => {
  if (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code)) return code || ''
  try { return new Intl.DisplayNames(['es'], { type: 'region' }).of(code) || code } catch { return code }
}

export default function Home() {
  const { business, businessId, base } = usePublicBusiness()
  const [services, setServices] = useState([])
  const [categories, setCategories] = useState([])
  const [catalogState, setCatalogState] = useState({ loading: true, error: '' })
  const [catalogQuery, setCatalogQuery] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [sort, setSort] = useState('name')
  const [page, setPage] = useState(1)
  const [options, setOptions] = useState(null)
  const [optionsError, setOptionsError] = useState('')
  const [showAllReviews, setShowAllReviews] = useState(false)

  useEffect(() => {
    if (!businessId) return undefined
    const serviceQuery = query(collection(db, 'services'), where('businessId', '==', businessId), where('isActive', '==', true), where('isPublic', '==', true))
    const stopServices = onSnapshot(serviceQuery, snapshot => {
      setServices(snapshot.docs.map(item => ({ ...item.data(), id: item.id })))
      setCatalogState({ loading: false, error: '' })
    }, () => setCatalogState({ loading: false, error: 'No pudimos cargar los servicios. Intenta recargar la página.' }))
    const stopCategories = onSnapshot(query(collection(db, 'categories'), where('businessId', '==', businessId), where('isActive', '==', true)), snapshot => {
      setCategories(snapshot.docs.map(item => ({ ...item.data(), id: item.id })).filter(item => item.isActive !== false).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)))
    }, () => setCategories([]))
    return () => { stopServices(); stopCategories() }
  }, [businessId])

  useEffect(() => {
    if (!bookingEnabled || !businessId) return undefined
    let active = true
    bookingRequest({ action: 'publicOptions', businessId }).then(data => { if (active) setOptions(data) }).catch(() => { if (active) setOptionsError('No pudimos cargar el equipo y las opiniones en este momento.') })
    return () => { active = false }
  }, [businessId])

  const categoryNames = useMemo(() => new Map(categories.map(item => [item.id, item.name])), [categories])
  const visibleServices = useMemo(() => services.filter(service => {
    const matchesCategory = !categoryId || service.categoryId === categoryId
    const categoryName = categoryNames.get(service.categoryId) || ''
    const matchesSearch = !normalize(catalogQuery) || normalize(`${service.name} ${service.description} ${categoryName}`).includes(normalize(catalogQuery))
    return matchesCategory && matchesSearch
  }).sort((a, b) => sort === 'price' ? (a.price || 0) - (b.price || 0) : sort === 'duration' ? (a.durationMinutes || 0) - (b.durationMinutes || 0) : String(a.name || '').localeCompare(String(b.name || ''), 'es')), [services, categoryId, catalogQuery, categoryNames, sort])
  const pageCount = Math.max(1, Math.ceil(visibleServices.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const displayedServices = visibleServices.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const publicProfessionals = (options?.professionals || []).filter(person => person.serviceIds?.some(id => services.some(service => service.id === id)))
  const promotedServices = (options?.services || []).filter(service => service.promotionTitle && services.some(publicService => publicService.id === service.id))
  const reviews = [...(options?.reviews || [])].filter(review => review.isPublic !== false && Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5 && String(review.comment || '').trim()).sort((a, b) => (b.reviewedAt || 0) - (a.reviewedAt || 0))
  const location = business?.location || {}
  const city = [location.city, countryName(location.countryCode)].filter(value => typeof value === 'string' && value.trim()).join(', ')
  const address = [location.addressLine, location.city, location.stateRegion, countryName(location.countryCode)].filter(value => typeof value === 'string' && value.trim()).join(', ')
  const rawPhone = String(business?.contact?.phone || '').trim()
  const phone = /^[+\d][\d\s()-]{6,24}$/.test(rawPhone) ? rawPhone : ''
  const phoneHref = phone.replace(/[^\d+]/g, '')
  const rawWhatsapp = String(business?.contact?.whatsapp || '').trim()
  const whatsapp = /^[+\d][\d\s()-]{6,24}$/.test(rawWhatsapp) ? rawWhatsapp.replace(/\D/g, '') : ''
  const rawEmail = String(business?.contact?.email || '').trim()
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : ''
  const mapHref = Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
    ? `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=17/${location.latitude}/${location.longitude}`
    : address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : ''
  const hours = weekdays.flatMap((day, index) => {
    const ranges = Array.isArray(business?.weeklyHours?.[String(index + 1)]) ? business.weeklyHours[String(index + 1)] : []
    return ranges.length ? [{ day, ranges: ranges.filter(range => range?.start && range?.end).map(range => `${range.start}–${range.end}`) }] : []
  }).filter(item => item.ranges.length)
  const cover = safeImageUrl(business?.cover?.url)
  const reservationUrl = `${base}/reservar`
  const about = business?.about || {}
  const description = String(business?.description || '').trim()

  return <main id="contenido" className="business-public-home" tabIndex={-1}>
    <section id="inicio" className="business-home-hero">
      <div className="public-container business-home-hero-grid">
        <div className="business-home-copy">
          <span className="business-home-kicker"><Sparkles size={15} /> {city || 'Atención con cita'}</span>
          <h1>{business?.name || 'Reserva con este negocio'}<span>Agenda el servicio que necesitas.</span></h1>
          {description && <p className="business-home-description">{description}</p>}
          <div className="business-home-facts">
            {city && <div><span><MapPin size={19} /></span><p><strong>Ubicación</strong><small>{city}{mapHref && <a href={mapHref} target="_blank" rel="noreferrer">Cómo llegar <ArrowRight size={13} /></a>}</small></p></div>}
            {hours.length > 0 && <div><span><Clock3 size={19} /></span><p><strong>Horario de atención</strong><small>{hours.slice(0, 2).map(item => `${item.day}: ${item.ranges.join(', ')}`).join(' · ')}{hours.length > 2 ? ' · Ver todos en Contacto' : ''}</small></p></div>}
            {services.length > 0 && <div><span><CalendarDays size={19} /></span><p><strong>Servicios disponibles</strong><small>{services.length} opciones para reservar</small></p></div>}
          </div>
          <div className="business-home-actions"><Link className="public-button" to={reservationUrl}><CalendarDays size={18} /> Reservar cita <ArrowRight size={16} /></Link><a className="public-button secondary" href="#servicios">Explorar servicios</a></div>
        </div>
        <div className={`business-home-cover${cover ? ' has-cover' : ''}`}>
          {cover ? <img src={cover} alt={`Portada de ${business?.name || 'el negocio'}`} fetchPriority="high" /> : <div className="business-home-cover-fallback" aria-hidden="true"><span><CalendarDays size={52} /></span><i /><i /><i /></div>}
          <div className="business-cover-note"><span><Heart size={19} /></span><strong>{business?.name}</strong><small>{description || 'Consulta servicios y horarios disponibles.'}</small></div>
        </div>
      </div>
    </section>

    <section className="public-container business-home-services" id="servicios" aria-labelledby="services-title">
      <div className="business-section-heading"><div><span className="business-section-kicker">CATÁLOGO DEL NEGOCIO</span><h2 id="services-title">Servicios <em>disponibles</em></h2><p>Consulta opciones, precios y duración antes de reservar.</p></div><span className="business-count">{services.length} {services.length === 1 ? 'servicio' : 'servicios'}</span></div>
      <div className="business-catalog-tools">
        <label className="business-search"><Search size={18} /><span className="sr-only">Buscar servicios</span><input type="search" value={catalogQuery} onChange={event => { setCatalogQuery(event.target.value); setPage(1) }} placeholder="Buscar un servicio…" /></label>
        {categories.length > 0 && <label className="business-filter">Categoría<select aria-label="Filtrar por categoría" value={categoryId} onChange={event => { setCategoryId(event.target.value); setPage(1) }}><option value="">Todas</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}
        <label className="business-filter">Ordenar por<select aria-label="Ordenar servicios" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Nombre (A–Z)</option><option value="price">Menor precio</option><option value="duration">Menor duración</option></select></label>
      </div>
      {catalogState.loading ? <p className="business-state" role="status">Cargando servicios…</p> : catalogState.error ? <p className="business-state business-error" role="alert">{catalogState.error}</p> : displayedServices.length === 0 ? <div className="business-empty"><Sparkles size={24} /><p>{services.length ? 'No hay servicios que coincidan con tu búsqueda.' : 'Este negocio aún no publicó servicios.'}</p></div> : <div className="business-service-grid">{displayedServices.map(service => {
        const image = safeImageUrl(service.image?.url)
        const category = categoryNames.get(service.categoryId)
        return <article className="business-service-card" key={service.id}>
          <div className="business-service-image">{image ? <img src={image} alt="" loading="lazy" /> : <span><Sparkles size={27} /></span>}{category && <small>{category}</small>}</div>
          <div className="business-service-body"><h3>{service.name}</h3><p className="business-service-description">{service.description || 'Consulta los detalles al reservar.'}</p>
            <div className="business-service-meta"><span><Clock3 size={15} />{service.durationMinutes} min</span><strong><Wallet size={15} />{formatPrice(service.price, service.currencyCode || business?.settings?.currencyCode || 'BOB')}</strong></div>
            {service.description && <details className="business-service-details"><summary>Ver detalles</summary><p>{service.description}</p></details>}
            <Link className="public-button business-card-action" to={`${reservationUrl}?servicio=${encodeURIComponent(service.id)}`}><CalendarDays size={16} /> Reservar</Link>
          </div>
        </article>
      })}</div>}
      {!catalogState.loading && !catalogState.error && pageCount > 1 && <nav className="business-pagination" aria-label="Paginación de servicios"><span>{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, visibleServices.length)} de {visibleServices.length}</span><div><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</button><span>Página {currentPage} de {pageCount}</span><button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Siguiente</button></div></nav>}
    </section>

    <section className="business-home-people" id="profesionales"><div className="public-container"><div className="business-section-heading"><div><span className="business-section-kicker">EQUIPO</span><h2>Nuestros <em>profesionales</em></h2><p>Personas asociadas con servicios públicos de este negocio.</p></div></div>{publicProfessionals.length ? <div className="business-people-grid">{publicProfessionals.map(person => {
      const photo = safeImageUrl(person.photoUrl)
      return <article className="business-person-card" key={person.id}><div className="business-person-avatar">{photo ? <img src={photo} alt={person.displayName} loading="lazy" /> : <span>{initials(person.displayName)}</span>}</div><div className="business-person-copy"><h3>{person.displayName}</h3>{person.jobTitle && <p className="business-person-title">{person.jobTitle}</p>}{person.bio && <p className="business-person-bio">{person.bio}</p>}<Link className="business-text-link" to={reservationUrl}>Reservar <ArrowRight size={15} /></Link></div></article>
    })}</div> : <p className="business-state">{optionsError ? 'No pudimos consultar el equipo ahora.' : options ? 'No hay profesionales disponibles para los servicios públicos.' : 'Cargando profesionales…'}</p>}</div></section>

    <section className="public-container business-home-promotions" id="promociones"><div className="business-section-heading"><div><span className="business-section-kicker">OFERTAS VIGENTES</span><h2>Promociones <em>disponibles</em></h2><p>Precios calculados por el sistema para promociones activas.</p></div></div>{promotedServices.length ? <div className="business-promotion-grid">{promotedServices.map(service => {
      const original = Number(service.originalPrice), price = Number(service.price)
      const percent = original > 0 && price < original ? Math.round((original - price) / original * 100) : 0
      return <article className="business-promotion-card" key={service.id}><span className="business-promotion-icon"><Tag size={20} /></span>{percent > 0 && <strong className="business-discount">-{percent}%</strong>}<div><h3>{service.promotionTitle}</h3><p>{service.name}</p><div className="business-promotion-prices">{original > price && <del>{formatPrice(original, service.currencyCode || 'BOB')}</del>}<strong>{formatPrice(price, service.currencyCode || 'BOB')}</strong></div></div><Link className="public-button secondary" to={`${reservationUrl}?servicio=${encodeURIComponent(service.id)}`}>Reservar oferta <ArrowRight size={15} /></Link></article>
    })}</div> : <p className="business-state">{optionsError ? 'No pudimos consultar las promociones ahora.' : options ? 'No hay promociones vigentes en este momento.' : 'Cargando promociones…'}</p>}</section>

    {optionsError && <p className="public-container business-state business-error" role="status">{optionsError}</p>}
    <section className="business-home-reviews" id="opiniones"><div className="public-container"><div className="business-section-heading"><div><span className="business-section-kicker">OPINIONES PUBLICADAS</span><h2>Experiencias <em>compartidas</em></h2><p>Opiniones visibles autorizadas por sus autores.</p></div></div>{reviews.length ? <><div className="business-review-grid">{(showAllReviews ? reviews : reviews.slice(0, 3)).map(review => <article className="business-review-card" key={review.id}><div className="business-review-top"><div><strong>{String(review.authorName || 'Cliente').trim().split(/\s+/)[0]}</strong>{review.serviceName && <small>{review.serviceName}</small>}</div><time>{publicDate(review.reviewedAt)}</time></div><div className="business-review-rating" aria-label={`${review.rating} de 5 estrellas`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={15} fill={index < review.rating ? 'currentColor' : 'none'} />)}</div><p>{review.comment}</p></article>)}</div>{reviews.length > 3 && <button className="business-review-more" type="button" onClick={() => setShowAllReviews(value => !value)}>{showAllReviews ? 'Mostrar menos' : `Ver todas las opiniones (${reviews.length})`}</button>}</> : <p className="business-state">{optionsError ? 'No pudimos consultar las opiniones ahora.' : options ? 'Este negocio todavía no tiene opiniones públicas.' : 'Cargando opiniones…'}</p>}</div></section>

    {(description || about.story || about.mission || about.vision || about.values) && <section className="public-container business-home-about" id="nosotros"><div><span className="business-section-kicker">SOBRE EL NEGOCIO</span><h2>Conoce <em>{business?.name}</em></h2>{description && <p>{description}</p>}{about.story && <p>{about.story}</p>}</div><div className="business-about-cards">{about.mission && <article><TargetIcon /><h3>Nuestra misión</h3><p>{about.mission}</p></article>}{about.vision && <article><EyeIcon /><h3>Nuestra visión</h3><p>{about.vision}</p></article>}{about.values && <article><Heart size={20} /><h3>Nuestros valores</h3><ul>{String(about.values).split('\n').map(value => value.trim()).filter(Boolean).map((value, index) => <li key={index}>{value}</li>)}</ul></article>}<Link className="public-button secondary" to={`${base}/nosotros`}>Más sobre el negocio <ArrowRight size={15} /></Link></div></section>}

    {(city || address || hours.length || phone || whatsapp || email || mapHref) && <section className="business-home-contact" id="contacto"><div className="public-container business-contact-inner"><div><span className="business-section-kicker">VISÍTANOS O CONTÁCTANOS</span><h2>Información <em>del negocio</em></h2><p>Consulta los datos que el negocio ha publicado.</p><div className="business-contact-grid">{(address || city) && <div><MapPin size={18} /><span><strong>Ubicación</strong><small>{address || city}</small>{mapHref && <a href={mapHref} target="_blank" rel="noreferrer">Cómo llegar <ArrowRight size={13} /></a>}</span></div>}{phone && <div><Phone size={18} /><span><strong>Teléfono</strong><a href={`tel:${phoneHref}`}>{phone}</a></span></div>}{email && <div><span><strong>Correo electrónico</strong><a href={`mailto:${email}`}>{email}</a></span></div>}{whatsapp && <div><span><strong>WhatsApp</strong><a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">Enviar mensaje</a></span></div>}{hours.length > 0 && <div className="business-contact-hours"><Clock3 size={18} /><span><strong>Horarios</strong>{hours.map(item => <small key={item.day}>{item.day}: {item.ranges.join(', ')}</small>)}</span></div>}</div></div><div className="business-contact-actions"><Link className="public-button" to={`${base}/contacto`}>Contactar <ArrowRight size={16} /></Link><Link className="public-button secondary" to={reservationUrl}><CalendarDays size={16} /> Reservar cita</Link></div></div></section>}

    <section className="public-container business-home-faq"><div className="business-section-heading"><div><span className="business-section-kicker">RESERVAS</span><h2>Preguntas <em>frecuentes</em></h2></div></div><div className="business-faq-list"><details><summary>¿Cómo puedo reservar una cita?</summary><p>Elige un servicio, selecciona una fecha y horario disponibles e inicia sesión para confirmar la reserva.</p></details><details><summary>¿Necesito una cuenta para explorar los servicios?</summary><p>No. Puedes consultar esta página y ver los servicios sin iniciar sesión. Para confirmar una reserva, el sistema te pedirá iniciar sesión o crear una cuenta.</p></details><details><summary>¿Puedo cancelar o reprogramar una cita?</summary><p>Las opciones disponibles dependen del estado de la reserva y de las condiciones configuradas por el negocio. Puedes revisar tu reserva desde tu cuenta.</p></details></div></section>
  </main>
}

function TargetIcon() { return <Target size={20} aria-hidden="true" /> }
function EyeIcon() { return <Eye size={20} aria-hidden="true" /> }
