import { addDays, dayKey } from './calendarDates.js'
import { dateMillis } from './clientPresentation.js'

export function dateError(date, today, maxDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Selecciona una fecha completa y válida.'
  const parsed = new Date(`${date}T12:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return 'Esta fecha no existe. Elige otra fecha.'
  if (date < today) return 'No puedes reservar en una fecha pasada.'
  if (date > maxDate) return `Elige una fecha hasta el ${maxDate.split('-').reverse().join('/')}.`
  return ''
}

export function bookingBounds(settings = {}, now = Date.now()) {
  const today = dayKey(now, settings.timezone || 'America/La_Paz')
  return { today, maxDate: addDays(today, settings.maxAdvanceDays ?? 90) }
}

export function closedDay(business, date) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7
  return Array.isArray(business.weeklyHours?.[weekday]) && business.weeklyHours[weekday].length === 0
}

// Limit concurrent queries; never present a failed query as an empty calendar.
export async function collectSlots(request, input, professionalIds, cancelled = () => false) {
  const slots = []
  for (let i = 0; i < professionalIds.length; i += 3) {
    if (cancelled()) return null
    const batch = await Promise.all(professionalIds.slice(i, i + 3).map(async professionalId => {
      const result = await request({ ...input, professionalId })
      return result.slots.map(slot => ({ ...slot, professionalId, quote: result.quote }))
    }))
    slots.push(...batch.flat())
  }
  return { slots: slots.sort((a, b) => a.start - b.start || a.professionalId.localeCompare(b.professionalId)) }
}

export const statusHelp = {
  pending: 'El negocio aún debe aceptar tu solicitud. Te avisaremos en tu cuenta cuando responda.',
  confirmed: 'Tu cita está confirmada. Te esperamos en el horario indicado.',
  cancelled: 'Esta cita está cancelada y ya no ocupa un horario.',
  completed: 'Tu atención ha finalizado. Puedes compartir tu valoración.',
  no_show: 'El negocio registró que no asististe a esta cita.',
  expired: 'El horario pasó sin confirmación. Contacta al negocio para coordinar otra visita.',
  awaiting_closure: 'El horario terminó. El negocio aún debe registrar el resultado de la atención.',
}

export function calendarFile(reservation, business, now = Date.now()) {
  const start = dateMillis(reservation.startAt), end = dateMillis(reservation.endAt)
  if (reservation.status !== 'confirmed' || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || start <= now) throw new Error('Solo puedes agregar citas futuras confirmadas al calendario.')
  const stamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const escape = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
  // Fold by UTF-8 octets, including the leading space of continuation lines.
  const fold = line => {
    let out = '', length = 0
    for (const char of line) {
      const bytes = new TextEncoder().encode(char).length
      if (length + bytes > 75) { out += '\r\n '; length = 1 }
      out += char; length += bytes
    }
    return out
  }
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CitasPro//Reservas//ES', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${escape(reservation.id)}@citaspro`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(reservation.serviceName || 'Cita')} - ${escape(business.name)}`,
    `DESCRIPTION:${escape(`Profesional: ${reservation.professionalName || 'Consulta tu reserva'}. Consulta los cambios en tu cuenta; este archivo no se actualiza automáticamente.`)}`,
    `LOCATION:${escape([business.location?.addressLine, business.location?.city].filter(Boolean).join(', '))}`,
    'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n'
}
