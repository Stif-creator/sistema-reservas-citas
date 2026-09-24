export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(
  (label, index) => ({ key: String(index + 1), label })
)

export function isSlotInvalid(slot) {
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/
  return !time.test(slot.start) || !time.test(slot.end) || slot.end <= slot.start
}

export function hasInvalidWeeklyHoursSlot(hours) {
  return DAYS.some(({ key }) => {
    const slots = hours[key] ?? []
    if (slots.some(isSlotInvalid)) return true
    const sorted = [...slots].sort((a, b) => a.start.localeCompare(b.start))
    return sorted.some((slot, i) => i > 0 && slot.start < sorted[i - 1].end)
  })
}

// Resolve a wall-clock time in the business timezone, independently of the browser.
export function businessDate(value, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Fecha inválida.')
  const target = Date.parse(`${value}:00Z`)
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  let result = target
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(result)).map(({ type, value: part }) => [type, part])
    )
    const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
    if (local === value) return new Date(result)
    result += target - Date.parse(`${local}:00Z`)
  }
  throw new Error('Esa hora no existe en la zona horaria del negocio.')
}
