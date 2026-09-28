import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, Clock3, MapPin, Phone, ShieldCheck, Sparkles } from 'lucide-react'
import { useClientBusiness } from '../../context/client-context'
import { useAuth } from '../../context/auth-context'
import { safeImageUrl } from '../../lib/brand'
import ServiceCard from '../../components/client/ServiceCard'
import CatalogState from '../../components/client/CatalogState'

export default function ClientHome() {
  const { business, services, categories } = useClientBusiness()
  const { userDoc } = useAuth()
  const cover = safeImageUrl(business.cover?.url)
  const phone = business.contact?.phone?.replace(/[^+\d]/g, '')
  return <>
    <section className="client-home-hero">
      <div className="public-container client-hero-grid">
        <div className="client-hero-copy">
          <span className="client-overline">TU ESPACIO EN {business.name}</span>
          <h1>Hola, {userDoc.firstName}.<br /><span>Un momento para ti.</span></h1>
          <p>{business.description || 'Encuentra el servicio que necesitas y organiza tu próxima visita con nosotros.'}</p>
          <div className="client-actions"><Link className="public-button" to="/cliente/servicios">Explorar servicios <ArrowRight size={17} /></Link><Link className="public-button secondary" to="/cliente/reservas">Mis reservas</Link></div>
        </div>
        <div className={`client-hero-art ${cover ? 'with-cover' : ''}`}>
          {cover ? <img src={cover} alt={business.name} /> : <div className="client-hero-calendar" aria-hidden="true"><span>HAZ ESPACIO PARA TI</span><CalendarDays size={76} strokeWidth={1} /><strong>Tu próxima visita<br />empieza aquí.</strong><div className="client-art-dots">{Array.from({ length: 7 }, (_, i) => <i key={i} />)}</div></div>}
          <div className="client-hero-note"><Sparkles size={22} /><span>Servicios para tu día a día<br /><strong>En un solo lugar</strong></span></div>
        </div>
      </div>
    </section>
    <div className="public-container client-benefits">
      {[[Clock3, 'A tu ritmo', 'Explora y elige tu servicio'], [CalendarDays, 'Tu espacio personal', 'Consulta tus citas'], [ShieldCheck, 'Acceso privado', 'Tu cuenta, siempre contigo']].map(([Icon, title, detail]) => <div key={title}><Icon size={23} /><span><strong>{title}</strong><small>{detail}</small></span></div>)}
    </div>
    <section className="public-container client-section">
      <div className="client-page-heading"><div><span className="client-overline">DESCUBRE LO QUE TENEMOS PARA TI</span><h2>Nuestros servicios</h2><p>Encuentra lo que necesitas para tu próxima visita.</p></div><Link className="text-link" to="/cliente/servicios">Ver todos <ArrowRight size={16} /></Link></div>
      <CatalogState empty={!services.length}><div className="client-service-grid">{services.slice(0, 6).map(service => <ServiceCard key={service.id} service={service} category={categories.find(category => category.id === service.categoryId)?.name} currency={business.settings?.currencyCode} />)}</div></CatalogState>
    </section>
    <section id="nosotros" className="client-about"><div className="public-container"><span className="client-overline">CONOCE TU NEGOCIO</span><h2>{business.name}</h2><p>{business.description || 'Estamos aquí para ayudarte a encontrar el servicio que necesitas.'}</p></div></section>
    <section id="contacto" className="public-container client-section client-contact"><div><span className="client-overline">ESTAMOS CERCA</span><h2>Hablemos de tu próxima visita</h2><p>Contacta con nosotros para conocer más.</p></div><div>
      {phone && <a href={`tel:${phone}`}><Phone size={18} />{business.contact.phone}</a>}
      {business.contact?.email && <a href={`mailto:${business.contact.email}`}>{business.contact.email}</a>}
      {business.location?.addressLine && <p><MapPin size={18} />{business.location.addressLine} {business.location.city}</p>}
      {!phone && !business.contact?.email && !business.location?.addressLine && <p>El negocio aún no ha publicado sus datos de contacto.</p>}
    </div></section>
  </>
}
