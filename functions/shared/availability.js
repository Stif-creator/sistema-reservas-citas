import { businessDate, hasInvalidWeeklyHoursSlot } from './hours.js'

const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
const time = (value) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
const millis = (value) => value?.toMillis ? value.toMillis() : new Date(value).getTime()

// Half-open intervals: a block ending at 10:00 permits a slot starting at 10:00.
export function availableSlots({ business, professional, service, date, blocks = [], reservations = [], now = Date.now() }) {
  if (!business || business.status !== 'active' || !professional?.isActive || !service?.isActive ||
    professional.businessId !== business.id || service.businessId !== business.id ||
    !professional.serviceIds?.includes(service.id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
  if ((professional.scheduleValidFrom && date < professional.scheduleValidFrom) ||
    (professional.scheduleValidUntil && date > professional.scheduleValidUntil)) return []
  const businessHours = business.weeklyHours || {}
  const professionalHours = professional.weeklyHours || {}
  if (hasInvalidWeeklyHoursSlot(businessHours) || hasInvalidWeeklyHoursSlot(professionalHours)) return []
  const zone = business.settings?.timezone || 'America/La_Paz'
  const duration = service.durationMinutes
  const before = service.bufferBeforeMinutes ?? 0
  const after = service.bufferAfterMinutes ?? 0
  const interval = business.settings?.bookingIntervalMinutes ?? 15
  if (![duration, interval].every((value) => Number.isInteger(value) && value > 0) ||
    ![before, after].every((value) => Number.isInteger(value) && value >= 0)) return []
  const day = String(new Date(`${date}T12:00:00Z`).getUTCDay() || 7)
  const occupied = reservations.filter(item => !['cancelled', 'completed', 'no_show'].includes(item.status)).map(item => ({
    ...item,
    startAt: millis(item.startAt) - (item.bufferBeforeMinutes || 0) * 60000,
    endAt: millis(item.endAt) + (item.bufferAfterMinutes || 0) * 60000,
  }))
  const relevantBlocks = [...blocks, ...occupied].filter((block) => block.businessId === business.id &&
    (block.allProfessionals || block.professionalId === professional.id))
  const result = new Map()
  const earliest = now + Math.max(0, business.settings?.minAdvanceMinutes ?? 0) * 60000
  const latest = now + Math.max(0, business.settings?.maxAdvanceDays ?? 90) * 86400000
  for (const businessSlot of businessHours[day] || []) {
    for (const professionalSlot of professionalHours[day] || []) {
      const from = Math.max(minutes(businessSlot.start), minutes(professionalSlot.start))
      const until = Math.min(minutes(businessSlot.end), minutes(professionalSlot.end))
      for (let candidate = Math.ceil((from + before) / interval) * interval; candidate + duration + after <= until; candidate += interval) {
        try {
          const start = businessDate(`${date}T${time(candidate)}`, zone).getTime()
          const occupiedStart = start - before * 60000
          const end = start + duration * 60000
          const occupiedEnd = end + after * 60000
          const windowStart = businessDate(`${date}T${time(from)}`, zone).getTime()
          const windowEnd = businessDate(`${date}T${time(until)}`, zone).getTime()
          if (start < earliest || start > latest || occupiedStart < windowStart || occupiedEnd > windowEnd) continue
          if (relevantBlocks.some((block) => {
            const blockStart = millis(block.startAt)
            const blockEnd = millis(block.endAt)
            // Invalid blocking data must never advertise availability.
            return !Number.isFinite(blockStart) || !Number.isFinite(blockEnd) || blockEnd <= blockStart ||
              (occupiedStart < blockEnd && occupiedEnd > blockStart)
          })) continue
          result.set(start, { start, end, label: time(candidate) })
        } catch {
          // Nonexistent local times (DST) cannot be offered.
        }
      }
    }
  }
  return [...result.values()].sort((a, b) => a.start - b.start)
}
