import { CalendarDays, Clock3, UserRound, Wallet } from 'lucide-react'
import { formatAppointmentDate, formatPrice } from '../../lib/clientPresentation'

export default function BookingSummary({ service, professional, slot, quote, timeZone }) {
  return <section className="booking-panel booking-summary">
    <h2>Resumen de la cita</h2><h3>{service?.name}</h3>
    <dl>
      <div><dt><UserRound size={16} />Profesional</dt><dd>{professional?.displayName}</dd></div>
      <div><dt><CalendarDays size={16} />Fecha</dt><dd>{formatAppointmentDate(slot?.start, timeZone)}</dd></div>
      <div><dt><Clock3 size={16} />Hora</dt><dd>{formatAppointmentDate(slot?.start, timeZone, true)}</dd></div>
      <div><dt>Duración</dt><dd>{quote?.durationMinutes} minutos</dd></div>
      <div><dt><Wallet size={16} />Precio</dt><dd>{formatPrice(quote?.price, quote?.currencyCode)}</dd></div>
    </dl>
  </section>
}
