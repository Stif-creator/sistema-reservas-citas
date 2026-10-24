export function dayKey(value = Date.now(), timeZone = 'America/La_Paz') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(value)).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
export function addDays(date, count) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + count)
  return value.toISOString().slice(0, 10)
}

export function zonedDateBoundary(date, timeZone = 'America/La_Paz') {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN
  const [year, month, day] = date.split('-').map(Number)
  const target = Date.UTC(year, month - 1, day)
  if (new Date(target).toISOString().slice(0, 10) !== date) return NaN

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
  let instant = target
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, Number(part.value)]))
    const wallTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    const adjustment = target - wallTime
    instant += adjustment
    if (adjustment === 0) break
  }
  return instant
}
export function agendaDays(date, view) {
  if (view === 'day') return [date]
  const first = view === 'month' ? `${date.slice(0, 7)}-01` : date
  const weekday = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7
  return Array.from({ length: view === 'month' ? 42 : 7 }, (_, index) => addDays(first, index - weekday))
}
