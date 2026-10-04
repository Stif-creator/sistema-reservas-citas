import { CalendarDays, Phone } from 'lucide-react'
import { useClientBusiness } from '../../context/client-context'
import { Link } from 'react-router-dom'
import { bookingEnabled } from '../../lib/bookingApi'

export default function BookingContactCard({ serviceId }) {
  const { business } = useClientBusiness()
  const phone = business.contact?.phone?.replace(/[^+\d]/g, '')
  return <aside className="client-panel client-booking-card">
    <span className="client-icon"><CalendarDays size={24} /></span>
    <h2>Tu próxima visita</h2>
    {bookingEnabled ? <><p>Selecciona un profesional y consulta sus horarios disponibles.</p><Link className="public-button" to={`/cliente/reservar?servicio=${encodeURIComponent(serviceId)}`}>Reservar cita</Link></> : <p>Las reservas en línea estarán disponibles próximamente.</p>}
    {phone ? <><p>Mientras tanto, contacta al negocio para coordinar tu cita.</p><a className="public-button" href={`tel:${phone}`}><Phone size={17} />Contactar al negocio</a></>
      : <p>Consulta los datos de contacto del negocio al final del inicio.</p>}
  </aside>
}
