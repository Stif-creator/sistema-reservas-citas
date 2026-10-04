import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { executeBooking } from '../functions/booking.js'
import { businessDate } from '../functions/shared/hours.js'
const require = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('These tests only run with the Firestore emulator.')
const app = initializeApp({ projectId: 'demo-citaspro' }, 'booking-tests')
const db = getFirestore(app)
after(async () => { await db.terminate(); await deleteApp(app) })

async function fixture() {
  const id = randomUUID()
  const businessId = `booking-${id}`
  const users = { admin: `admin-${id}`, client: `client-${id}`, other: `other-${id}`, pro: `pro-${id}`, pro2: `pro2-${id}` }
  const serviceId = `service-${id}`, professionalId = `legacy-professional-${id}`
  const date = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const hours = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [String(i + 1), [{ start: '09:00', end: '18:00' }]]))
  const batch = db.batch()
  batch.set(db.doc(`businesses/${businessId}`), { status: 'active', ownerUserId: users.admin, weeklyHours: hours,
    settings: { timezone: 'America/La_Paz', minAdvanceMinutes: 0, maxAdvanceDays: 90, bookingIntervalMinutes: 15, cancellationLimitHours: 24, autoConfirmBookings: false } })
  for (const [role, uid] of Object.entries(users)) {
    batch.set(db.doc(`users/${uid}`), { firstName: role, lastName: 'Test', email: `${role}@example.test`, phone: '70000000', status: 'active' })
    batch.set(db.doc(`memberships/${businessId}_${uid}`), { businessId, userId: uid, role: role === 'admin' ? 'admin' : role.startsWith('pro') ? 'professional' : 'client', status: 'active' })
    if (['client', 'other'].includes(role)) batch.set(db.doc(`clients/${uid}`), { businessId, userId: uid, firstName: role, lastName: 'Test' })
  }
  batch.set(db.doc(`services/${serviceId}`), { businessId, name: 'Consulta', isActive: true, isPublic: true, price: 100, durationMinutes: 30, currencyCode: 'BOB' })
  batch.set(db.doc(`professionals/${professionalId}`), { businessId, userId: users.pro, displayName: 'Profesional prueba', isActive: true, serviceIds: [serviceId], weeklyHours: hours })
  await batch.commit()
  const time = label => businessDate(`${date}T${label}`, 'America/La_Paz').getTime()
  const create = (changes = {}) => ({ action: 'create', businessId, serviceId, professionalId, date, startAt: time('10:00'), expectedPrice: 100, expectedDuration: 30, requestId: randomUUID(), ...changes })
  const call = (uid, input) => executeBooking(db, uid, { businessId, ...input })
  return { businessId, users, serviceId, professionalId, date, time, create, call }
}
const rejects = (promise, code) => assert.rejects(promise, error => error.code === code)

test('simultaneous overlapping reservations serialize; retries are idempotent', async () => {
  const f = await fixture()
  const first = f.create(), second = f.create({ startAt: f.time('10:15') })
  const results = await Promise.allSettled([f.call(f.users.client, first), f.call(f.users.other, second)])
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1)
  assert.equal(results.find(item => item.status === 'rejected').reason.code, 'already-exists')
  const index = results.findIndex(item => item.status === 'fulfilled')
  const uid = index === 0 ? f.users.client : f.users.other
  const request = index === 0 ? first : second
  assert.deepEqual(await f.call(uid, request), results[index].value)
  await rejects(f.call(uid, { ...request, notes: 'Changed request' }), 'already-exists')
  assert.equal((await db.collection('reservations').where('businessId', '==', f.businessId).get()).size, 1)
})

test('availability respects blocks, buffers, assignments and private projections', async () => {
  const f = await fixture()
  await db.doc(`services/${f.serviceId}`).update({ bufferBeforeMinutes: 15, bufferAfterMinutes: 15 })
  const result = await f.call(f.users.client, f.create())
  await db.doc(`scheduleBlocks/block-${f.businessId}`).set({ businessId: f.businessId, allProfessionals: true, professionalId: null, startAt: Timestamp.fromMillis(f.time('12:00')), endAt: Timestamp.fromMillis(f.time('13:00')) })
  const query = { action: 'availability', serviceId: f.serviceId, professionalId: f.professionalId, date: f.date }
  const response = await f.call(f.users.client, query)
  assert(!response.slots.some(slot => ['09:30', '10:00', '10:30', '11:30', '12:00', '12:45'].includes(slot.label)))
  assert(response.slots.some(slot => slot.label === '11:00'))
  await rejects(f.call(f.users.other, { ...query, reservationId: result.id }), 'permission-denied')
  await rejects(f.call(f.users.pro2, query), 'permission-denied')
  const options = await f.call(f.users.client, { action: 'options' })
  assert.equal(options.clients.length, 0)
  assert(!('email' in options.professionals[0]))
  await db.doc(`professionals/${f.professionalId}`).update({ isActive: false })
  await rejects(f.call(f.users.client, f.create({ startAt: f.time('15:00') })), 'failed-precondition')
})

test('rescheduling is atomic, preserves original on conflict and cancellation releases occupancy', async () => {
  const f = await fixture()
  const one = await f.call(f.users.client, f.create())
  await f.call(f.users.other, f.create({ startAt: f.time('11:00') }))
  const change = { action: 'reschedule', reservationId: one.id, revision: 1, date: f.date, startAt: f.time('11:00'), expectedPrice: 100, expectedDuration: 30, requestId: randomUUID() }
  await rejects(f.call(f.users.client, change), 'already-exists')
  assert.equal((await db.doc(`reservations/${one.id}`).get()).data().startAt.toMillis(), f.time('10:00'))
  const moved = await f.call(f.users.client, { ...change, startAt: f.time('12:00'), requestId: randomUUID() })
  assert.equal(moved.revision, 2)
  await f.call(f.users.other, f.create())
  await rejects(f.call(f.users.client, { ...change, startAt: f.time('13:00'), requestId: randomUUID() }), 'aborted')
  await f.call(f.users.client, { action: 'status', reservationId: one.id, revision: 2, status: 'cancelled', requestId: randomUUID() })
  await f.call(f.users.other, f.create({ startAt: f.time('12:00') }))
})

test('state transitions enforce actor, time, cancellation limits and immutable terminal states', async () => {
  const f = await fixture()
  const item = await f.call(f.users.client, f.create())
  const status = (value, revision = 1) => ({ action: 'status', reservationId: item.id, revision, status: value, requestId: randomUUID() })
  await rejects(f.call(f.users.client, status('confirmed')), 'permission-denied')
  await rejects(f.call(f.users.other, status('cancelled')), 'permission-denied')
  await rejects(f.call(f.users.pro2, status('confirmed')), 'permission-denied')
  await f.call(f.users.pro, status('confirmed'))
  await rejects(f.call(f.users.admin, status('completed', 2)), 'failed-precondition')
  await rejects(f.call(f.users.pro, status('no_show', 2)), 'failed-precondition')
  await db.doc(`reservations/${item.id}`).update({ startAt: Timestamp.fromMillis(Date.now() - 7200000), endAt: Timestamp.fromMillis(Date.now() - 3600000) })
  await rejects(f.call(f.users.client, status('cancelled', 2)), 'failed-precondition')
  await f.call(f.users.pro, status('completed', 2))
  await rejects(f.call(f.users.admin, status('cancelled', 3)), 'failed-precondition')
  const missed = await f.call(f.users.client, f.create({ startAt: f.time('14:00') }))
  await db.doc(`reservations/${missed.id}`).update({ status: 'confirmed', startAt: Timestamp.fromMillis(Date.now() - 3600000) })
  await f.call(f.users.admin, { ...status('no_show'), reservationId: missed.id })
})

test('manual booking supports existing and unregistered clients without creating auth accounts', async () => {
  const f = await fixture()
  const request = f.create({ manualClient: { name: 'Cliente por teléfono', phone: '+59170000001', email: '' } })
  await rejects(f.call(f.users.client, request), 'permission-denied')
  await rejects(f.call(f.users.pro, request), 'permission-denied')
  const created = await f.call(f.users.admin, request)
  const item = (await db.doc(`reservations/${created.id}`).get()).data()
  assert.equal(item.clientUserId, null)
  assert.equal(item.source, 'manual')
  assert.equal((await db.doc(`clients/${item.clientId}`).get()).data().firstName, 'Cliente por teléfono')
  await f.call(f.users.admin, f.create({ clientId: f.users.client, startAt: f.time('11:00') }))
  await rejects(f.call(f.users.client, f.create({ clientId: f.users.other, startAt: f.time('12:00') })), 'permission-denied')
})

test('server rejects stale quotes, other businesses, disabled accounts and forged slot instants', async () => {
  const f = await fixture()
  await rejects(f.call(undefined, f.create()), 'unauthenticated')
  await rejects(f.call(f.users.client, f.create({ businessId: 'another-business' })), 'permission-denied')
  await rejects(f.call(f.users.client, f.create({ expectedPrice: 1 })), 'failed-precondition')
  await rejects(f.call(f.users.client, f.create({ startAt: f.time('10:01') })), 'already-exists')
  await rejects(f.call(f.users.client, f.create({ date: '2026-02-31' })), 'already-exists')
  await db.doc(`memberships/${f.businessId}_${f.users.client}`).update({ status: 'inactive' })
  await rejects(f.call(f.users.client, f.create()), 'permission-denied')
})
