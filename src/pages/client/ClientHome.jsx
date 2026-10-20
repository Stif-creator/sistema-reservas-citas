import NextAppointment from '../../components/client/NextAppointment'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, Heart, Bell, MessageCircle, Sparkles } from 'lucide-react'
import { useClientBusiness } from '../../context/client-context'
import { useAuth } from '../../context/auth-context'
import ServiceCard from '../../components/client/ServiceCard'
import CatalogState from '../../components/client/CatalogState'
import { safeImageUrl } from '../../lib/brand'

export default function ClientHome() {
  const { business, services, categories } = useClientBusiness()
  const { userDoc } = useAuth()
  const cover = safeImageUrl(business.cover?.url)
  return <>
    <section className="public-container client-home-hero">
      <div className="client-home-copy">
        <span className="client-overline">TU ESPACIO DE BIENESTAR</span>
        <h1>Qué gusto verte,<br /><span>{userDoc.firstName}.</span></h1>
        <p>{business.description || 'Un momento para ti empieza con una buena cita.'}</p>
        <Link className="client-home-book-button" to="/cliente/reservar"><CalendarDays size={18} />Reservar una cita <ArrowRight size={17} /></Link>
      </div>
      <div className={`client-home-art${cover ? ' has-cover' : ''}`} aria-hidden="true">
        {cover ? <img src={cover} alt="" /> : <div className="client-home-art-card">
          <span>{business.name}</span>
          <Sparkles size={34} strokeWidth={1.3} />
          <strong>Tu próximo<br />momento empieza aquí.</strong>
          <div className="client-home-art-dots"><i /><i /><i /><i /><i /><i /></div>
        </div>}
        <div className="client-home-art-note"><CalendarDays size={17} /><span>Un espacio reservado<strong>solo para ti</strong></span></div>
      </div>
    </section>
    <NextAppointment />
    <nav className="public-container client-shortcuts" aria-label="Accesos del cliente">
      <Link to="/cliente/reservas"><CalendarDays size={19} /><span><strong>Mis citas</strong><small>Consulta tus reservas</small></span><ArrowRight size={16} /></Link>
      <Link to="/cliente/favoritos"><Heart size={19} /><span><strong>Favoritos y espera</strong><small>Guarda tus servicios</small></span><ArrowRight size={16} /></Link>
      <Link to="/cliente/avisos"><Bell size={19} /><span><strong>Mis avisos</strong><small>Novedades de tus citas</small></span><ArrowRight size={16} /></Link>
      <Link to="/cliente/contacto"><MessageCircle size={19} /><span><strong>Contactar</strong><small>Habla con el negocio</small></span><ArrowRight size={16} /></Link>
    </nav>
    <section className="public-container client-section client-home-services">
      <div className="client-page-heading"><div><span className="client-overline">ELIGE CÓMO QUIERES CUIDARTE</span><h2>Servicios pensados para ti</h2><p>Explora lo que ofrece {business.name} y reserva tu próximo momento.</p></div><Link className="text-link" to="/cliente/servicios">Ver todos los servicios <ArrowRight size={16} /></Link></div>
      <CatalogState empty={!services.length}><div className="client-service-grid">{services.slice(0, 6).map(service => <ServiceCard key={service.id} service={service} category={categories.find(category => category.id === service.categoryId)?.name} currency={business.settings?.currencyCode} />)}</div></CatalogState>
    </section>
  </>
}
