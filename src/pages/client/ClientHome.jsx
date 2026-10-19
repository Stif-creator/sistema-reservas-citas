import NextAppointment from '../../components/client/NextAppointment'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, Heart, Bell, MessageCircle } from 'lucide-react'
import { useClientBusiness } from '../../context/client-context'
import { useAuth } from '../../context/auth-context'
import ServiceCard from '../../components/client/ServiceCard'
import CatalogState from '../../components/client/CatalogState'

export default function ClientHome() {
  const { business, services, categories } = useClientBusiness()
  const { userDoc } = useAuth()
  return <>
    <section className="public-container client-welcome">
      <div><span className="client-overline">{business.name}</span><h1>Hola, {userDoc.firstName}.</h1><p>Organiza tu próxima visita en pocos pasos.</p></div>
      <Link className="public-button" to="/cliente/reservar"><CalendarDays size={20} />Reservar una cita <ArrowRight size={18} /></Link>
    </section>
    <NextAppointment />
    <nav className="public-container client-shortcuts" aria-label="Accesos del cliente">
      <Link to="/cliente/reservas"><CalendarDays size={20} />Mis citas</Link><Link to="/cliente/favoritos"><Heart size={20} />Favoritos y espera</Link><Link to="/cliente/avisos"><Bell size={20} />Mis avisos</Link><Link to="/cliente/contacto"><MessageCircle size={20} />Contactar al negocio</Link>
    </nav>
    <section className="public-container client-section">
      <div className="client-page-heading"><div><span className="client-overline">DESCUBRE LO QUE TENEMOS PARA TI</span><h2>Nuestros servicios</h2><p>Encuentra lo que necesitas para tu próxima visita.</p></div><Link className="text-link" to="/cliente/servicios">Ver todos <ArrowRight size={16} /></Link></div>
      <CatalogState empty={!services.length}><div className="client-service-grid">{services.slice(0, 6).map(service => <ServiceCard key={service.id} service={service} category={categories.find(category => category.id === service.categoryId)?.name} currency={business.settings?.currencyCode} />)}</div></CatalogState>
    </section>
  </>
}
