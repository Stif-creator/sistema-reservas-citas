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
  pending: 'Pendiente', confirmed: 'Confirmada', completed: 'Finalizada', cancelled: 'Cancelada', no_show: 'No asistida',
}
