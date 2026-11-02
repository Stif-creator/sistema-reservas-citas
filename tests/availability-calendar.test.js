import { test } from 'node:test'
import assert from 'node:assert/strict'
import { availabilityQueryRange, availabilityState, availabilityViewDays, quickAvailabilityRange } from '../src/lib/availabilityCalendar.js'
import { addDays, agendaDays, dayKey, zonedDateBoundary } from '../src/lib/calendarDates.js'

test('availability states distinguish loading, outside range, low, empty and available', () => {
  assert.equal(availabilityState({ inRange: false, loading: true }), 'not-consulted')
  assert.equal(availabilityState({ inRange: true, loading: true }), 'loading')
  assert.equal(availabilityState({ inRange: true, known: true, slotCount: 0 }), 'empty')
  assert.equal(availabilityState({ inRange: true, known: true, slotCount: 3 }), 'low')
  assert.equal(availabilityState({ inRange: true, known: true, slotCount: 4 }), 'available')
})

test('quick ranges include today and the exact number of calendar days', () => {
  assert.deepEqual(quickAvailabilityRange('today', '2026-10-31'), { startDate: '2026-10-31', endDate: '2026-10-31' })
  assert.equal(quickAvailabilityRange('7', '2026-10-31').endDate, '2026-11-06')
  assert.equal(quickAvailabilityRange('30', '2026-10-31').endDate, '2026-11-29')
  assert.equal(quickAvailabilityRange('custom', '2026-10-31'), null)
})

test('week and month views produce Monday-first day grids', () => {
  assert.deepEqual(availabilityViewDays('week', '2026-10-31', '2026-10'), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
  const month = availabilityViewDays('month', '2026-10-31', '2026-10')
  assert.equal(month.length, 42)
  assert.equal(month[0], '2026-09-28')
  assert.equal(month[5], '2026-10-03')
})

test('query bounds clip to chosen dates and use business timezone boundaries', () => {
  const days = ['2026-10-30', '2026-10-31', '2026-11-01']
  const range = availabilityQueryRange(days, '2026-10-31', '2026-11-05', 'America/La_Paz')
  assert.equal(range.startDate, '2026-10-31')
  assert.equal(range.endDate, '2026-11-01')
  assert.equal(range.startMs, Date.parse('2026-10-31T04:00:00Z'))
  assert.equal(range.endMs, Date.parse('2026-11-02T04:00:00Z'))
  assert.equal(availabilityQueryRange(days, '2026-11-02', '2026-11-05', 'America/La_Paz'), null)
})

test('agenda weeks start Monday, end Sunday, and switch cleanly at a Sunday boundary', () => {
  const sundayWeek = agendaDays('2026-11-01', 'week')
  assert.deepEqual(sundayWeek, ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
  const nextMondayWeek = agendaDays(addDays('2026-11-01', 1), 'week')
  assert.deepEqual(nextMondayWeek, ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
  assert.equal(sundayWeek.at(-1), addDays(nextMondayWeek[0], -1))
})

test('agenda month grids cross month and year boundaries on Monday-first dates', () => {
  const october = agendaDays('2026-10-31', 'month')
  assert.equal(october.length, 42)
  assert.equal(october[0], '2026-09-28')
  assert.equal(october.at(-1), '2026-11-08')
  const january = agendaDays('2027-01-15', 'month')
  assert.equal(january.length, 42)
  assert.equal(january[0], '2026-12-28')
  assert.equal(january.at(-1), '2027-02-07')
})

test('agenda local-midnight boundaries preserve Bolivia dates across browser and business zones', () => {
  const boliviaMidnight = zonedDateBoundary('2026-11-02', 'America/La_Paz')
  assert.equal(boliviaMidnight, Date.parse('2026-11-02T04:00:00Z'))
  assert.equal(dayKey(boliviaMidnight - 1, 'America/La_Paz'), '2026-11-01')
  assert.equal(dayKey(boliviaMidnight, 'America/La_Paz'), '2026-11-02')
  assert.equal(dayKey(boliviaMidnight - 1, 'Asia/Tokyo'), '2026-11-02')
  assert.equal(dayKey(zonedDateBoundary('2026-11-02', 'Asia/Tokyo') - 1, 'America/La_Paz'), '2026-11-01')
})
