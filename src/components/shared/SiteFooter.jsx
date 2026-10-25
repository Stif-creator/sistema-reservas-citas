import { Link } from 'react-router-dom'
import { Mail, MapPin, Phone } from 'lucide-react'
import BusinessBrand from './BusinessBrand'

export default function SiteFooter({ business, homeTo = '/', contactTo = '/contacto', clientMode = false, platformMode = false }) {
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
  if (platformMode) return <footer className="public-container site-footer platform-site-footer">
    <div className="platform-footer-main">
      <div className="platform-footer-brand"><BusinessBrand business={null} to="/" /><p>Una plataforma para descubrir servicios y organizar citas con más claridad.</p></div>
      <nav aria-label="Explorar CitasPro"><strong>Explorar</strong><Link to="/">Inicio</Link><Link to="/negocios">Negocios</Link><Link to="/nosotros">Nosotros</Link><Link to="/contacto">Contacto</Link></nav>
      <nav aria-label="Información"><strong>Información</strong><Link to="/#como-funciona">Cómo funciona</Link><Link to="/nosotros">Nuestra plataforma</Link></nav>
      <div className="platform-footer-contact"><strong>Contacto</strong><p>Las consultas sobre reservas se atienden directamente con cada negocio.</p><Link to="/contacto">Opciones de contacto <span aria-hidden="true">→</span></Link></div>
    </div>
    <div className="platform-footer-bottom"><span>© {new Date().getFullYear()} CitasPro. Todos los derechos reservados.</span><span>Tu tiempo, nuestra prioridad.</span></div>
  </footer>
  if (business) {
    const phone = typeof business.contact?.phone === 'string' && /^[+\d][\d\s()-]{6,24}$/.test(business.contact.phone.trim()) ? business.contact.phone.trim() : ''
    const phoneHref = phone.replace(/[^\d+]/g, '')
    const email = typeof business.contact?.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(business.contact.email.trim()) ? business.contact.email.trim() : ''
    const place = [business.location?.city, business.location?.countryCode].filter(value => typeof value === 'string' && value.trim()).join(', ')
    return <footer className="public-container site-footer business-site-footer">
      <div className="business-footer-main">
        <div className="business-footer-brand"><BusinessBrand business={business} to={homeTo} />{business.description && <p>{business.description}</p>}</div>
        <nav aria-label="Secciones del negocio"><strong>Explora</strong><Link to={`${homeTo}#servicios`}>Servicios</Link><Link to={`${homeTo}#profesionales`}>Profesionales</Link><Link to={`${homeTo}#promociones`}>Promociones</Link><Link to={`${homeTo}#opiniones`}>Opiniones</Link><Link to={`${homeTo}/nosotros`}>Nosotros</Link><Link to={contactTo}>Contacto</Link></nav>
        <div className="business-footer-contact"><strong>Información de contacto</strong>{phone && <a href={`tel:${phoneHref}`}><Phone size={14} />{phone}</a>}{email && <a href={`mailto:${email}`}><Mail size={14} />{email}</a>}{place && <span><MapPin size={14} />{place}</span>}{!phone && !email && !place && <p>Consulta los datos disponibles en la página del negocio.</p>}</div>
        <Link className="business-footer-platform" to="/negocios">Conoce CitasPro <span aria-hidden="true">→</span></Link>
      </div>
      <div className="business-footer-bottom"><span>© {new Date().getFullYear()} {business.name}</span><Link to={contactTo}>Contactar al negocio</Link></div>
    </footer>
  }
  return <footer className="public-container public-footer site-footer">
    <BusinessBrand business={business} to={homeTo} />
    <span>Tu tiempo, bien acompañado.</span>
    {business ? <Link to={contactTo}>Contáctanos</Link>
      : !business && <Link to="/crear-negocio">¿Tienes un negocio?</Link>}
  </footer>
}
