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
export function agendaDays(date, view) {
  if (view === 'day') return [date]
  const first = view === 'month' ? `${date.slice(0, 7)}-01` : date
  const weekday = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7
  return Array.from({ length: view === 'month' ? 42 : 7 }, (_, index) => addDays(first, index - weekday))
}
