export function formatPrice(value, currency = 'BOB') {
  if (!Number.isFinite(value)) return 'Consultar precio'
  try { return new Intl.NumberFormat('es-BO', { style: 'currency', currency }).format(value) }
  catch { return `${value.toFixed(2)} ${currency}` }
}

export function dateMillis(value) {
  if (value == null) return NaN
  return value?.toMillis ? value.toMillis() : new Date(value).getTime()
}

export function formatAppointmentDate(value, zone = 'America/La_Paz', timeOnly = false) {
  const stamp = dateMillis(value)
  if (!Number.isFinite(stamp)) return 'Por confirmar'
  try { return new Intl.DateTimeFormat('es-BO', { timeZone: zone,
    ...(timeOnly ? { hour: '2-digit', minute: '2-digit', hour12: false } : { day: 'numeric', month: 'long', year: 'numeric' }),
  }).format(stamp) } catch { return 'Por confirmar' }
}

export const reservationStatuses = {
  expired: 'Vencida sin confirmar', awaiting_closure: 'Pendiente de cierre', in_progress: 'En curso',
  pending: 'Pendiente', confirmed: 'Confirmada', completed: 'Finalizada', cancelled: 'Cancelada', no_show: 'No asistida',
}

export function reservationDisplayStatus(item, now = Date.now()) {
  if (item.status === 'confirmed' && dateMillis(item.startAt) <= now && dateMillis(item.endAt) > now) return 'in_progress'
  if (dateMillis(item.endAt) <= now) {
    if (item.status === 'pending') return 'expired'
    if (item.status === 'confirmed') return 'awaiting_closure'
  }
  return item.status
}
