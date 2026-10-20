import { CalendarDays, Mail, MessageCircle, Phone } from 'lucide-react'
import { useClientBusiness } from '../../context/client-context'
import { Link } from 'react-router-dom'
import { bookingEnabled } from '../../lib/bookingApi'

export default function BookingContactCard({ serviceId }) {
  const { business } = useClientBusiness()
  const phone = business.contact?.phone?.replace(/[^+\d]/g, '')
  const whatsapp = business.contact?.whatsapp?.replace(/\D/g, '')
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(business.contact?.email || '') ? business.contact.email : ''
  const hasContact = phone || whatsapp || email
  return <aside className="client-panel client-booking-card">
    <span className="client-icon"><CalendarDays size={24} /></span>
    <span className="client-booking-kicker">TU BIENESTAR, A UN PASO</span>
    <h2>Tu próxima visita</h2>
    {bookingEnabled ? <><p>Selecciona un profesional y consulta sus horarios disponibles.</p><Link className="public-button" to={`/cliente/reservar?servicio=${encodeURIComponent(serviceId)}`}>Reservar cita</Link></> : <p>Las reservas en línea estarán disponibles próximamente.</p>}
    {hasContact ? <div className="client-booking-contact"><p>¿Prefieres coordinar directamente?</p>
      {phone && <a href={`tel:${phone}`}><Phone size={16} />{business.contact.phone}</a>}
      {whatsapp && <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer"><MessageCircle size={16} />WhatsApp</a>}
      {email && <a href={`mailto:${email}`}><Mail size={16} />Correo electrónico</a>}
    </div>
      : <p>Consulta los datos de contacto del negocio al final del inicio.</p>}
    {!hasContact && <Link className="client-booking-contact-link" to="/cliente/contacto">Ver contacto del negocio</Link>}
  </aside>
}
