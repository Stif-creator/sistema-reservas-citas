import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarPlus, RotateCcw, MessageCircle } from 'lucide-react'
import { calendarFile } from '../../lib/clientBooking'
import { dateMillis } from '../../lib/clientPresentation'
import { bookingEnabled } from '../../lib/bookingApi'

export default function AppointmentTools({ reservation, business }) {
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [])
  const canExport = reservation.status === 'confirmed' && dateMillis(reservation.startAt) > now
  function download() {
    try {
      const url = URL.createObjectURL(new Blob([calendarFile(reservation, business)], { type: 'text/calendar;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url; link.download = 'mi-cita.ics'; document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000); setError('')
    } catch (failure) { setError(failure.message) }
  }
  return <section className="client-appointment-tools" aria-label="Opciones de tu cita">
    <div className="client-actions">
      {canExport && <button className="public-button secondary" onClick={download}><CalendarPlus size={18} />Agregar al calendario</button>}
      {bookingEnabled && reservation.serviceId && <Link className="public-button secondary" to={`/cliente/reservar?${new URLSearchParams({ servicio: reservation.serviceId, profesional: reservation.professionalId || '' })}`}><RotateCcw size={18} />Reservar nuevamente</Link>}
      <Link className="public-button secondary" to="/cliente/contacto"><MessageCircle size={18} />Contactar al negocio</Link>
    </div>
    {canExport && <p className="booking-notice">Descarga un archivo para tu calendario. Si cambias o cancelas la cita, actualiza también tu calendario; el archivo no se sincroniza.</p>}
    {error && <p role="alert" className="public-alert">{error}</p>}
  </section>
}
