import test from 'node:test'
import assert from 'node:assert/strict'
import { executePlatformAnalytics } from '../functions/analytics.js'
import { executeBooking } from '../functions/booking.js'
import { BookingError } from '../functions/bookingError.js'

function fixture({ actor = { status: 'active', globalRole: 'superadmin' }, exists = true } = {}) {
  const queries = []
  const business = { name: 'Consultorio', status: 'active' }
  const db = {
    doc(path) { return { async get() { return path.startsWith('users/') ? { data: () => actor } : { exists, data: () => business } } } },
    collection(name) { return new FakeQuery(name, [], queries) },
  }
  return { db, queries }
}
class FakeQuery {
  constructor(name, filters, queries) { this.name = name; this.filters = filters; this.queries = queries }
  where(field, op, value) { return new FakeQuery(this.name, [...this.filters, [field, op, value]], this.queries) }
  count() { return { get: async () => { this.queries.push({ name: this.name, filters: this.filters }); return { data: () => ({ count: countFor(this.name, this.filters) }) } } } }
}
function countFor(name, filters) {
  const value = field => filters.find(item => item[0] === field)?.[2]
  if (name === 'clients') return 17
  if (name === 'professionals') return value('isActive') ? 8 : 10
  if (name === 'services') return value('isActive') ? 24 : 25
  if (name === 'memberships') return value('role') === 'admin' && value('status') ? 3 : 3
  if (name === 'promotions') return 2
  if (name === 'reservations') return value('status') === 'cancelled' ? 5 : value('status') ? 10 : 100
  return 0
}

test('platform analytics returns only scoped aggregate counts and monthly/status data', async () => {
  const { db, queries } = fixture()
  const result = await executePlatformAnalytics(db, 'superadmin', { action: 'platformAnalytics', businessId: 'tenant-1', range: 180 })
  assert.equal(result.clients, 17)
  assert.equal(result.activeProfessionals, 8)
  assert.equal(result.activeServices, 24)
  assert.equal(result.activeAdmins, 3)
  assert.equal(result.reservations, 100)
  assert.equal(result.statuses.find(item => item.status === 'cancelled').value, 5)
  assert(result.months.length >= 1)
  assert.equal(result.recentActivity, 100)
  assert.deepEqual(Object.keys(result).sort(), ['activeAdmins','activeProfessionals','activePromotions','activeServices','admins','business','clients','months','professionals','range','recentActivity','reservations','services','statuses'].sort())
  assert(queries.length > 10 && queries.every(query => query.filters.some(([field, , value]) => field === 'businessId' && value === 'tenant-1')))
})

test('platform analytics refuses unauthenticated, non-superadmin and missing business requests', async () => {
  const { db } = fixture()
  await assert.rejects(executePlatformAnalytics(db, null, { businessId: 'tenant-1' }), error => error instanceof BookingError && error.code === 'unauthenticated')
  const regular = fixture({ actor: { status: 'active', globalRole: 'user' } })
  await assert.rejects(executePlatformAnalytics(regular.db, 'user', { businessId: 'tenant-1' }), error => error instanceof BookingError && error.code === 'permission-denied')
  const missing = fixture({ exists: false })
  await assert.rejects(executePlatformAnalytics(missing.db, 'superadmin', { businessId: 'tenant-1' }), error => error instanceof BookingError && error.code === 'not-found')
})

test('platformAnalytics is dispatched through the existing booking endpoint', async () => {
  const { db } = fixture()
  const result = await executeBooking(db, 'superadmin', { action: 'platformAnalytics', businessId: 'tenant-1', range: 30 })
  assert.equal(result.business.id, 'tenant-1')
  assert.equal(result.range, 30)
})
