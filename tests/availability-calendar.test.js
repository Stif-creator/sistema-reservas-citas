import { test } from 'node:test'
import assert from 'node:assert/strict'
import { availabilityQueryRange, availabilityState, availabilityViewDays, quickAvailabilityRange } from '../src/lib/availabilityCalendar.js'

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
