import test from 'node:test'
import assert from 'node:assert/strict'
import { executePlatformActivity } from '../functions/activity.js'
import { executeBooking } from '../functions/booking.js'
import { BookingError } from '../functions/bookingError.js'

test('platform activity requires an active superadmin', async () => {
  const db = { doc: path => ({ get: async () => ({ data: () => path === 'users/inactive' ? { status: 'inactive', globalRole: 'superadmin' } : { status: 'active', globalRole: 'user' } }) }) }
  await assert.rejects(executePlatformActivity(db, null, {}), error => error instanceof BookingError && error.code === 'unauthenticated')
  await assert.rejects(executePlatformActivity(db, 'regular', {}), error => error instanceof BookingError && error.code === 'permission-denied')
  await assert.rejects(executePlatformActivity(db, 'inactive', {}), error => error instanceof BookingError && error.code === 'permission-denied')
})

test('platform activity returns redacted audit events and scoped aggregates', async () => {
  const actor = { status: 'active', globalRole: 'superadmin' }
  const storedEvent = { businessId: 'tenant-1', action: 'businessUpdate', createdAt: { toMillis: () => Date.now() }, beforeName: 'Old', afterName: 'New', actorEmail: 'private@example.com', targetUserId: 'private-user' }
  const eventDoc = { id: 'event-1', get: field => storedEvent[field], data: () => storedEvent }
  const queries = []
  class Query {
    constructor(name) { this.name = name; this.filters = []; this.orders = []; this.projection = [] }
    where(...args) { this.filters.push(args); return this }
    orderBy(...args) { this.orders.push(args); return this }
    startAt() { return this }
    endAt() { return this }
    startAfter() { return this }
    limit() { return this }
    select(...fields) { this.projection = fields; return this }
    count() { return { get: async () => ({ data: () => ({ count: 2 }) }) } }
    async get() { queries.push(this); return this.name === 'auditLogs' ? { docs: [eventDoc] } : { docs: [], empty: true } }
  }
  const db = {
    doc(path) { return { get: async () => path === 'users/admin' ? { data: () => actor } : { exists: false, data: () => ({}) } } },
    collection(name) { return new Query(name) },
    async getAll() { return [] },
  }
  const result = await executePlatformActivity(db, 'admin', { days: 30, eventType: 'businessUpdate' })
  assert.equal(result.totalEvents, 2)
  assert.equal(result.totalReservations, 2)
  assert.equal(result.events[0].description, 'Configuración del negocio modificada; se actualizó el nombre.')
  assert.equal(result.events[0].businessName, 'Negocio no disponible')
  assert.equal('actorEmail' in result.events[0], false)
  assert.equal('targetUserId' in result.events[0], false)
  assert.deepEqual(queries.find(query => query.name === 'auditLogs').projection, ['businessId', 'action', 'createdAt', 'status', 'beforeRole', 'afterRole', 'beforeStatus', 'afterStatus', 'beforeName', 'afterName'])
})

test('business search matches any letter regardless of case', async () => {
  const businessDoc = { id: 'sonrisa', data: () => ({ name: 'Sonrisa Andina', status: 'active' }) }
  class Query {
    constructor(name) { this.name = name }
    where() { return this }
    orderBy() { return this }
    startAfter() { return this }
    limit() { return this }
    select() { return this }
    count() { return { get: async () => ({ data: () => ({ count: 1 }) }) } }
    async get() { return this.name === 'businesses' ? { docs: [businessDoc] } : { docs: [], empty: true } }
  }
  const db = {
    doc: path => ({ async get() { return path === 'users/admin' ? { data: () => ({ status: 'active', globalRole: 'superadmin' }) } : { exists: path === 'businesses/sonrisa', data: () => ({ name: 'Sonrisa Andina', status: 'active' }) } } }),
    collection: name => new Query(name),
    async getAll() { return [] },
  }
  const result = await executePlatformActivity(db, 'admin', { search: 'sonrisa' })
  assert.equal(result.businesses.length, 1)
  assert.equal(result.businesses[0].name, 'Sonrisa Andina')
})

test('platformActivity is dispatched through the booking endpoint', async () => {
  const db = { doc: path => ({ get: async () => ({ data: () => path === 'users/admin' ? { status: 'active', globalRole: 'superadmin' } : {}, exists: false }) }),
    collection: () => ({ where() { return this }, count() { return { get: async () => ({ data: () => ({ count: 0 }) }) } }, orderBy() { return this }, limit() { return this }, select() { return this }, get: async () => ({ docs: [], empty: true }) }) }
  const result = await executeBooking(db, 'admin', { action: 'platformActivity', days: 7 })
  assert.equal(result.days, 7)
  assert.equal(result.totalReservations, 0)
})
