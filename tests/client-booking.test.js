import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dateError, bookingBounds, closedDay, collectSlots, calendarFile } from '../src/lib/clientBooking.js'

test('client dates reject impossible, incomplete, past and out-of-range dates in business timezone', () => {
  const bounds = bookingBounds({ timezone: 'America/La_Paz', maxAdvanceDays: 2 }, Date.parse('2026-10-20T02:00:00Z'))
  assert.deepEqual(bounds, { today: '2026-10-19', maxDate: '2026-10-21' })
  for (const date of ['', '2026-02-30', '2026-10-18', '2026-10-22', '2026-1-20']) assert.ok(dateError(date, bounds.today, bounds.maxDate))
  for (const date of ['2026-10-19', '2026-10-21']) assert.equal(dateError(date, bounds.today, bounds.maxDate), '')
  assert.equal(dateError('2028-02-29', '2028-02-01', '2028-03-01'), '')
  assert.equal(closedDay({ weeklyHours: { 7: [] } }, '2026-10-25'), true)
  assert.equal(closedDay({}, '2026-10-25'), false)
})

test('no-preference availability preserves professional identity and price; failures do not mean no slots', async () => {
  const request = async ({ professionalId }) => ({ slots: [{ start: professionalId === 'b' ? 100 : 200, label: '10:00' }], quote: { price: 75 } })
  const result = await collectSlots(request, { date: '2026-10-22' }, ['a', 'b'])
  assert.deepEqual(result.slots.map(s => s.professionalId), ['b', 'a'])
  assert.equal(result.slots[0].quote.price, 75)
  await assert.rejects(collectSlots(async () => { throw new Error('Sin conexión') }, {}, ['a']), /Sin conexión/)
  let calls = 0
  assert.equal(await collectSlots(async () => { calls++; return { slots: [] } }, {}, ['a'], () => true), null)
  assert.equal(calls, 0)
})

test('calendar exports UTC, escapes user content and folds Unicode; disallows unconfirmed and elapsed appointments', () => {
  const now = Date.parse('2026-10-19T12:00:00Z')
  const item = { id: 'appointment', status: 'confirmed', startAt: now + 86400000, endAt: now + 88200000, serviceName: 'Consulta, revisión;\nBEGIN:VEVENT', professionalName: 'María '.repeat(30) }
  const output = calendarFile(item, { name: 'Negocio', location: { addressLine: 'Calle 1', city: 'La Paz' } }, now)
  assert.match(output, /DTSTART:20261020T120000Z/)
  assert.match(output, /DTEND:20261020T123000Z/)
  assert.ok(output.includes('Consulta\\, revisión\\;\\nBEGIN:VEVENT'))
  assert.equal(output.split('\r\n').filter(line => line === 'BEGIN:VEVENT').length, 1)
  assert.ok(output.split('\r\n').every(line => Buffer.byteLength(line) <= 75))
  for (const status of ['pending', 'cancelled', 'completed']) assert.throws(() => calendarFile({ ...item, status }, {}, now))
  assert.throws(() => calendarFile(item, {}, now + 90000000))
})
