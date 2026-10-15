export function countdown(start, now = Date.now()) {
  const minutes = Math.ceil((start - now) / 60000)
  if (!Number.isFinite(minutes) || minutes <= 0) return 'La hora de tu cita ha llegado'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60
  return `Faltan ${days ? `${days} d · ` : ''}${hours ? `${hours} h · ` : ''}${rest} min para tu cita`
}
