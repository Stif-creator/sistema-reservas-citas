import { Link } from 'react-router-dom'
import { Mail, MapPin, Phone } from 'lucide-react'
import BusinessBrand from './BusinessBrand'

export default function SiteFooter({ business, homeTo = '/', contactTo = '/contacto', clientMode = false }) {
  if (clientMode) {
    const phone = typeof business?.contact?.phone === 'string' ? business.contact.phone.trim() : ''
    const phoneHref = /^[+\d][\d\s()-]{6,24}$/.test(phone) ? phone.replace(/[^\d+]/g, '') : ''
    const email = typeof business?.contact?.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(business.contact.email) ? business.contact.email : ''
    const location = [business?.location?.city, business?.location?.countryCode].filter(Boolean).join(', ')
    return <footer className="public-container public-footer site-footer client-site-footer">
      <div className="client-footer-main">
        <div className="client-footer-brand"><BusinessBrand business={business} to={homeTo} /><p>{business?.description || 'Reserva tu próxima visita de forma sencilla y segura.'}</p></div>
        <nav aria-label="Enlaces del pie de página" className="client-footer-links">
          <strong>Explora</strong><Link to="/cliente/servicios">Servicios</Link><Link to="/cliente/reservas">Mis citas</Link><Link to="/cliente/nosotros">Nosotros</Link>
        </nav>
        <div className="client-footer-contact">
          <strong>Estamos para ayudarte</strong>
          <Link to={contactTo}>Contactar al negocio</Link>
          {phoneHref && <a href={`tel:${phoneHref}`}><Phone size={15} />{phone}</a>}
          {email && <a href={`mailto:${email}`}><Mail size={15} />{email}</a>}
          {location && <span><MapPin size={15} />{location}</span>}
        </div>
      </div>
      <div className="client-footer-bottom"><span>© {new Date().getFullYear()} {business?.name || 'Tu negocio'}</span><span>Tu tiempo, bien acompañado.</span><Link to="/cliente/contacto">¿Necesitas ayuda?</Link></div>
    </footer>
  }
  return <footer className="public-container public-footer site-footer">
    <BusinessBrand business={business} to={homeTo} />
    <span>Tu tiempo, bien acompañado.</span>
    {business ? <Link to={contactTo}>Contáctanos</Link>
      : !business && <Link to="/crear-negocio">¿Tienes un negocio?</Link>}
  </footer>
}
