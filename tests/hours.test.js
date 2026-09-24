import { test } from 'node:test'
import assert from 'node:assert/strict'
import { businessDate, hasInvalidWeeklyHoursSlot } from '../src/lib/hours.js'
import { brandVariables, safeImageUrl } from '../src/lib/brand.js'

test('rejects incomplete, reversed and overlapping weekly hours', () => {
  for (const slots of [
    [{ start: '', end: '' }],
    [{ start: '09:00', end: '' }],
    [{ start: '12:00', end: '09:00' }],
    [
      { start: '09:00', end: '12:00' },
      { start: '11:00', end: '13:00' },
    ],
  ]) {
    assert.equal(hasInvalidWeeklyHoursSlot({ 1: slots }), true)
  }
  assert.equal(
    hasInvalidWeeklyHoursSlot({
      1: [
        { start: '12:00', end: '13:00' },
        { start: '09:00', end: '12:00' },
      ],
    }),
    false
  )
  assert.equal(hasInvalidWeeklyHoursSlot({}), false)
})
test('uses business timezone rather than machine timezone', () => {
  assert.equal(
    businessDate('2026-09-23T09:00', 'America/La_Paz').toISOString(),
    '2026-09-23T13:00:00.000Z'
  )
  assert.equal(
    businessDate('2026-09-23T09:00', 'Europe/Madrid').toISOString(),
    '2026-09-23T07:00:00.000Z'
  )
  assert.throws(() => businessDate('2026-03-08T02:30', 'America/New_York'))
  assert.throws(() => businessDate('invalid', 'America/La_Paz'))
})
test('theme chooses contrasting button text and rejects invalid colors and URLs', () => {
  assert.equal(brandVariables({ primaryColor: '#ffffff' })['--on-brand'], '#101b30')
  assert.equal(brandVariables({ primaryColor: '#000000' })['--on-brand'], '#ffffff')
  assert.equal(brandVariables({ primaryColor: 'invalid' })['--brand'], '#1672ed')
  assert.equal(safeImageUrl('javascript:alert(1)'), undefined)
  assert.equal(safeImageUrl('https://example.com/logo.png'), 'https://example.com/logo.png')
})
