import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readReservationCounts } from '../src/lib/reservationCounts.js'

const specs = ['total', 'confirmed', 'pending'].map(key => ({ key, clauses: [] }))

test('reservation counts preserve legitimate zero values for an empty business', async () => {
  const result = await readReservationCounts(specs, async () => 0)
  assert.deepEqual(result.values, { total: 0, confirmed: 0, pending: 0 })
  assert.deepEqual(result.errors, [])
})

test('one failed reservation metric does not discard other counts and exposes the failure', async () => {
  const diagnostics = []
  const result = await readReservationCounts(specs, async (_clauses, metric) => {
    if (metric === 'confirmed') throw Object.assign(new Error('index required'), { code: 'failed-precondition' })
    return metric === 'total' ? 3 : 0
  }, (metric, error) => diagnostics.push({ metric, code: error.code }))
  assert.deepEqual(result.values, { total: 3, confirmed: null, pending: 0 })
  assert.deepEqual(result.errors, ['confirmed'])
  assert.deepEqual(diagnostics, [{ metric: 'confirmed', code: 'failed-precondition' }])
})
