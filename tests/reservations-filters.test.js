import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays, zonedDateBoundary } from '../src/lib/calendarDates.js'
import { reservationDisplayStatus } from '../src/lib/clientPresentation.js'

test('date range uses business-midnight boundaries and includes the complete final day', () => {
  const start = zonedDateBoundary('2026-11-03', 'America/La_Paz')
  const exclusiveEnd = zonedDateBoundary(addDays('2026-11-08', 1), 'America/La_Paz')
  assert.equal(new Date(start).toISOString(), '2026-11-03T04:00:00.000Z')
  assert.equal(new Date(exclusiveEnd - 1).toISOString(), '2026-11-09T03:59:59.999Z')
  assert.ok(exclusiveEnd > zonedDateBoundary('2026-11-08', 'America/La_Paz'))
})

test('same-day, leap-day and daylight-saving date boundaries remain calendar-correct', () => {
  const day = zonedDateBoundary('2028-02-29', 'UTC')
  assert.equal(zonedDateBoundary(addDays('2028-02-29', 1), 'UTC') - day, 86400000)
  const beforeDstShift = zonedDateBoundary('2026-11-01', 'America/New_York')
  const afterDstShift = zonedDateBoundary('2026-11-02', 'America/New_York')
  assert.equal(afterDstShift - beforeDstShift, 25 * 60 * 60 * 1000)
  for (const invalid of ['', '2026-02-29', '2026-11-1', '2026-13-01']) assert.ok(Number.isNaN(zonedDateBoundary(invalid, 'UTC')))
})

test('a confirmed appointment gets an En curso label only during its scheduled interval', () => {
  const item = { status: 'confirmed', startAt: Date.parse('2026-11-03T10:00:00Z'), endAt: Date.parse('2026-11-03T11:00:00Z') }
  assert.equal(reservationDisplayStatus(item, Date.parse('2026-11-03T09:59:59Z')), 'confirmed')
  assert.equal(reservationDisplayStatus(item, Date.parse('2026-11-03T10:00:00Z')), 'in_progress')
  assert.equal(reservationDisplayStatus(item, Date.parse('2026-11-03T11:00:00Z')), 'awaiting_closure')
  assert.equal(reservationDisplayStatus({ ...item, status: 'completed' }, Date.parse('2026-11-03T10:30:00Z')), 'completed')
})
