import { addDays, agendaDays, zonedDateBoundary } from './calendarDates.js'

export const AVAILABILITY_LOW_THRESHOLD = 3

export function availabilityState({ known, inRange, loading = false, slotCount = 0 }) {
  if (!inRange) return 'not-consulted'
  if (loading) return 'loading'
  if (!known) return 'not-consulted'
  if (slotCount <= 0) return 'empty'
  return slotCount <= AVAILABILITY_LOW_THRESHOLD ? 'low' : 'available'
}

export function quickAvailabilityRange(preset, startDate) {
  const days = preset === 'today' ? 1 : preset === '7' ? 7 : preset === '30' ? 30 : 0
  return days > 0 ? { startDate, endDate: addDays(startDate, days - 1) } : null
}

export function availabilityViewDays(view, selectedDate, monthAnchor) {
  if (view === 'week') {
    const weekday = (new Date(`${selectedDate}T12:00:00Z`).getUTCDay() + 6) % 7
    const start = addDays(selectedDate, -weekday)
    return Array.from({ length: 7 }, (_, index) => addDays(start, index))
  }
  return agendaDays(`${monthAnchor}-01`, 'month')
}

export function availabilityQueryRange(days, fromDate, throughDate, timeZone) {
  if (!days.length || !fromDate || !throughDate || throughDate < fromDate) return null
  const startDate = days[0] > fromDate ? days[0] : fromDate
  const lastDay = days.at(-1)
  const endDate = lastDay < throughDate ? lastDay : throughDate
  if (endDate < startDate) return null
  const startMs = zonedDateBoundary(startDate, timeZone)
  const endMs = zonedDateBoundary(addDays(endDate, 1), timeZone)
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
    ? { startDate, endDate, startMs, endMs }
    : null
}
