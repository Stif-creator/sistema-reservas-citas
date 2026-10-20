import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { executeBooking } from '../functions/booking.js'
import { businessDate } from '../functions/shared/hours.js'
import { discountedService } from '../functions/engagement.js'
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

test('discounts select the largest active offer, reject invalid legacy percentages and honor expiry', () => {
  const service = { id:'s', price:100 }
  const offer = { serviceId:'s', isActive:true, percent:10, startAt:100, endAt:300 }
  assert.equal(discountedService(service, [offer, { ...offer, percent:20 }], 200).price,80)
  assert.equal(discountedService(service, [offer],300).price,100)
  assert.equal(discountedService(service, [{ ...offer, percent:200 }],200).price,100)
  assert.equal(discountedService(service, [{ ...offer, serviceId:'other' }],200).price,100)
})

test('Sprint 3 public selections expose only public data and still require identity at confirmation', async () => {
  const f = await fixture()
  await rejects(f.call(null, { action: 'publicOptions' }), 'permission-denied')
  await db.doc(`businesses/${f.businessId}`).update({ 'settings.publicPageEnabled': true })
  const options = await f.call(null, { action: 'publicOptions' })
  assert.equal(options.professionals.length, 1)
  assert.deepEqual(options.clients, [])
  assert.equal(options.professionals[0].userId, undefined)
  assert.equal(options.professionals[0].phone, undefined)
  const query = { action:'publicAvailability', serviceId:f.serviceId, professionalId:f.professionalId, date:f.date }
  assert((await f.call(null, query)).slots.length > 0)
  await rejects(f.call(null, { ...query, reservationId:'private' }), 'permission-denied')
  await rejects(f.call(null, f.create({ source:'public' })), 'unauthenticated')
  const booked = await f.call(f.users.client, f.create({ source:'public' }))
  assert.equal((await db.doc(`reservations/${booked.id}`).get()).data().source, 'public')
  await rejects(f.call(f.users.other, f.create({ source:'public' })), 'already-exists')
})

test('Sprint 3 favorites and waiting lists are owned, deduplicated and removable', async () => {
  const f = await fixture()
  await db.doc(`professionals/second-${f.businessId}`).set({ businessId: f.businessId, userId: f.users.pro2, displayName: 'Segundo profesional', serviceIds: [f.serviceId], isActive: true })
  const favorite = { action:'favorite', kind:'service', targetId:f.serviceId, enabled:true }
  await f.call(f.users.client, favorite); await f.call(f.users.client, favorite)
  assert.equal((await f.call(f.users.client, { action:'hub' })).favorites.length, 1)
  assert.equal((await f.call(f.users.other, { action:'hub' })).favorites.length, 0)
  await rejects(f.call(f.users.pro, favorite), 'permission-denied')
  await rejects(f.call(f.users.client, { ...favorite, targetId:'outside' }), 'not-found')
  await f.call(f.users.client, { ...favorite, enabled:false })
  const waiting = { action:'wait', serviceId:f.serviceId, professionalId:f.professionalId, date:f.date }
  await f.call(f.users.client, waiting); await f.call(f.users.client, waiting)
  const secondWaiting = { ...waiting, professionalId: `second-${f.businessId}` }
  await f.call(f.users.other, secondWaiting)
  assert.equal((await f.call(f.users.client, { action:'hub' })).waiting.length, 1)
  const adminInbox = await f.call(f.users.admin, { action:'waitlist' })
  assert.equal(adminInbox.length, 2)
  assert(adminInbox.some(entry => entry.clientName === 'client Test' && entry.clientPhone === '70000000'))
  assert(adminInbox.every(entry => entry.businessTimeZone === 'America/La_Paz'))
  assert.equal((await f.call(f.users.pro, { action:'waitlist' })).length, 1)
  assert.equal((await f.call(f.users.pro2, { action:'waitlist' })).length, 1)
  await rejects(f.call(f.users.client, { action:'waitlist' }), 'permission-denied')
  await f.call(f.users.other, { ...secondWaiting, action:'unwait' })
  assert.equal((await f.call(f.users.client, { action:'hub' })).waiting.length, 1)
  await f.call(f.users.client, { ...waiting, action:'unwait' })
  assert.equal((await f.call(f.users.client, { action:'hub' })).waiting.length, 0)
})

test('Sprint 3 notifications are atomic and reminders follow settings, rescheduling and cancellation', async () => {
  const f = await fixture(), request = f.create()
  const result = await f.call(f.users.client, request)
  await f.call(f.users.client, request)
  const hub = await f.call(f.users.client, { action:'hub' })
  assert.equal(hub.notifications.length, 1)
  assert.equal(typeof hub.notifications[0].visibleAt, 'number')
  await rejects(f.call(f.users.other, { action:'notificationRead', id:hub.notifications[0].id }), 'permission-denied')
  await f.call(f.users.client, { action:'notificationRead', id:hub.notifications[0].id })
  assert.equal((await f.call(f.users.client, { action:'hub' })).notifications[0].read, true)
  await f.call(f.users.admin, { action:'reminderSave', hours:48 })
  let reminder = (await db.doc(`notifications/reminder_${result.id}`).get()).data()
  assert.equal(reminder.visibleAt.toMillis(), f.time('10:00') - 48*3600000)
  await f.call(f.users.client, { action:'reschedule', reservationId:result.id, revision:1, date:f.date, startAt:f.time('11:00'), expectedPrice:100, expectedDuration:30, requestId:randomUUID() })
  reminder = (await db.doc(`notifications/reminder_${result.id}`).get()).data()
  assert.equal(reminder.visibleAt.toMillis(), f.time('11:00') - 48*3600000)
  for (const hours of [24, 1]) {
    const scheduled = (await db.doc(`notifications/reminder_${result.id}_${hours}h`).get()).data()
    assert.equal(scheduled.visibleAt.toMillis(), f.time('11:00') - hours * 3600000)
    assert.equal(scheduled.expiresAt.toMillis(), f.time('11:00'))
  }
  await f.call(f.users.client, { action:'status', reservationId:result.id, revision:2, status:'cancelled', requestId:randomUUID() })
  assert.equal((await db.doc(`notifications/reminder_${result.id}`).get()).exists, false)
  for (const hours of [24, 1]) assert.equal((await db.doc(`notifications/reminder_${result.id}_${hours}h`).get()).exists, false)
})

test('Sprint 3 reviews require own completed reservation; promotions alter server price only while valid', async () => {
  const f = await fixture()
  const promo = { action:'promotionSave', id:`promo-${f.businessId}`, serviceId:f.serviceId, title:'Oferta', percent:20, startAt:Date.now()-3600000, endAt:Date.now()+86400000, isActive:true }
  await rejects(f.call(f.users.client, promo), 'permission-denied')
  await f.call(f.users.admin, promo)
  assert.equal((await f.call(f.users.client, { action:'options' })).services[0].price, 80)
  await rejects(f.call(f.users.client, f.create()), 'failed-precondition')
  const r = await f.call(f.users.client, f.create({ expectedPrice:80 }))
  const review = { action:'review', reservationId:r.id, rating:5, comment:'Buena atención' }
  await rejects(f.call(f.users.client, review), 'permission-denied')
  await db.doc(`reservations/${r.id}`).update({ status:'completed' })
  await rejects(f.call(f.users.other, review), 'permission-denied')
  await rejects(f.call(f.users.client, { ...review, rating:6 }), 'invalid-argument')
  await rejects(f.call(f.users.client, { ...review, professionalRating:0 }), 'invalid-argument')
  await f.call(f.users.client, review)
  await f.call(f.users.client, { ...review, rating:4, professionalRating:3, professionalId:'forged-professional' })
  assert.equal((await f.call(f.users.client, { action:'hub' })).reviews.length, 1)
  const published = (await f.call(f.users.client, { action:'options' })).reviews[0]
  const original = (await db.doc(`reservations/${r.id}`).get()).data()
  assert.equal(published.serviceId, f.serviceId)
  assert.equal(published.professionalId, original.professionalId)
  assert.equal(published.professionalRating, 3)
  assert.equal(published.rating, 4)
  assert.equal(typeof published.reviewedAt, 'number')
  assert.equal(published.clientUserId, undefined)
  await f.call(f.users.admin, { ...promo, isActive:false })
  assert.equal((await f.call(f.users.client, { action:'options' })).services[0].price, 100)
})

test('Sprint 3 client management is tenant scoped and does not edit auth identities', async () => {
  const f = await fixture(), foreign = await fixture()
  await rejects(f.call(f.users.client, { action:'clients' }), 'permission-denied')
  const update = { action:'clientUpdate', id:f.users.client, firstName:'Nuevo', lastName:'Contacto', phone:'70000001', email:'contact@example.test' }
  await rejects(foreign.call(foreign.users.admin, update), 'permission-denied')
  await f.call(f.users.admin, update)
  assert.equal((await f.call(f.users.admin, { action:'clients' })).clients.find(c => c.id === f.users.client).firstName, 'Nuevo')
  assert.equal((await db.doc(`users/${f.users.client}`).get()).data().firstName, 'client')
})

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


test('superadmin server access is verified from protected profile, without a tenant membership', async () => {
  const f = await fixture(), uid = `platform-${randomUUID()}`
  await db.doc(`users/${uid}`).set({ status: 'active', globalRole: 'superadmin' })
  const result = await f.call(uid, { action: 'options' })
  assert.equal(result.services.length, 1)
  await db.doc(`users/${uid}`).update({ globalRole: 'user' })
  await rejects(f.call(uid, { action: 'options' }), 'permission-denied')
})


test('platform creates linked businesses, protects lifecycle and preserves historical reservations', async () => {
  const f = await fixture(), platform = `platform-${randomUUID()}`, bid = `tenant-${randomUUID()}`
  await db.doc(`users/${platform}`).set({ status: 'active', globalRole: 'superadmin' })
  const create = { action: 'platformCreate', businessId: bid, name: 'Test tenant', email: 'admin@example.test', primaryColor: '#123456', secondaryColor: '#abcdef' }
  // Fixture emails are intentionally shared between fixtures; use a unique administrator.
  const email = `${f.users.admin}@example.test`
  await db.doc(`users/${f.users.admin}`).update({ email, businessIds: [f.businessId] })
  create.email = email
  await rejects(executeBooking(db, f.users.admin, create), 'permission-denied')
  await executeBooking(db, platform, create)
  await executeBooking(db, platform, create)
  assert.equal((await db.doc(`memberships/${bid}_${f.users.admin}`).get()).data().role, 'admin')
  assert.deepEqual((await db.doc(`users/${f.users.admin}`).get()).data().businessIds, [f.businessId, bid])
  assert.equal((await db.doc(`businesses/${bid}`).get()).data().settings.publicPageEnabled, false)
  const status = value => ({ action: 'platformStatus', businessId: bid, status: value, confirmName: 'Test tenant' })
  await rejects(executeBooking(db, platform, status('deleted')), 'failed-precondition')
  await executeBooking(db, platform, status('inactive'))
  await rejects(executeBooking(db, f.users.admin, { action: 'options', businessId: bid }), 'permission-denied')
  await db.doc(`reservations/${bid}-history`).set({ businessId: bid, status: 'confirmed' })
  await rejects(executeBooking(db, platform, status('deleted')), 'failed-precondition')
  await db.doc(`reservations/${bid}-history`).update({ status: 'completed' })
  await rejects(executeBooking(db, platform, { ...status('deleted'), confirmName: 'wrong' }), 'invalid-argument')
  await executeBooking(db, platform, status('deleted'))
  assert.equal((await db.doc(`businesses/${bid}`).get()).data().status, 'deleted')
  assert((await db.doc(`reservations/${bid}-history`).get()).exists)
  await executeBooking(db, platform, status('active'))
  assert.equal((await db.doc(`businesses/${bid}`).get()).data().status, 'active')
  await rejects(executeBooking(db, f.users.admin, status('inactive')), 'permission-denied')
})


const blockInput = f => ({ action: 'blockCreate', requestId: randomUUID(), title: 'Descanso', reason: 'personal', professionalId: f.professionalId, allProfessionals: false, startDate: f.date, endDate: new Date(Date.parse(f.date) + 86400000).toISOString().slice(0, 10) })
test('blocks require approval, notify both sides, and pending requests do not remove availability', async () => {
  const f = await fixture(), input = blockInput(f)
  const created = await f.call(f.users.pro, input)
  assert.equal(created.status, 'pending')
  assert.deepEqual(await f.call(f.users.pro, input), created)
  const options = { action:'availability', professionalId:f.professionalId, serviceId:f.serviceId, date:f.date }
  assert((await f.call(f.users.client, options)).slots.length > 0)
  await rejects(f.call(f.users.pro, { action:'blockApprove', blockId:created.id, requestId:randomUUID() }), 'permission-denied')
  const approved = await f.call(f.users.admin, { action:'blockApprove', blockId:created.id, requestId:randomUUID() })
  assert.equal(approved.status, 'approved')
  assert.equal((await f.call(f.users.client, options)).slots.length, 0)
  await rejects(f.call(f.users.client, f.create()), 'already-exists')
  await rejects(f.call(f.users.pro, { action:'blockDelete', blockId:created.id, requestId:randomUUID() }), 'permission-denied')
  const notices = (await db.collection('notifications').where('businessId','==',f.businessId).get()).docs.map(d=>d.data())
  assert(notices.some(n=>n.recipientUserId===f.users.admin && n.blockId===created.id))
  assert(notices.some(n=>n.recipientUserId===f.users.pro && n.title==='Bloqueo aprobado'))
  await f.call(f.users.admin, { action:'blockDelete', blockId:created.id, requestId:randomUUID() })
  assert((await f.call(f.users.client, options)).slots.length > 0)
})
test('blocks reject existing appointments, recheck on approval, and validate dates and scope', async () => {
  const f = await fixture(), input = blockInput(f)
  await rejects(f.call(f.users.client,input),'permission-denied')
  await rejects(f.call(f.users.pro2,input),'permission-denied')
  for (const changes of [{endDate:f.date},{startDate:'2027-02-30'},{startDate:'2027-02-01T10:00'}]) await rejects(f.call(f.users.admin,{...input,...changes}),'invalid-argument')
  const pending = await f.call(f.users.pro,input)
  await f.call(f.users.client,f.create())
  await rejects(f.call(f.users.admin,{...input,requestId:randomUUID()}),'failed-precondition')
  await rejects(f.call(f.users.admin,{action:'blockApprove',blockId:pending.id,requestId:randomUUID()}),'failed-precondition')
  assert.equal((await db.doc(`scheduleBlocks/${pending.id}`).get()).data().status,'pending')
  await f.call(f.users.admin,{action:'blockReject',blockId:pending.id,requestId:randomUUID()})
  assert.equal((await db.doc(`scheduleBlocks/${pending.id}`).get()).data().status,'rejected')
})
test('a concurrent reservation and approved block cannot both succeed', async () => {
  const f = await fixture()
  const results = await Promise.allSettled([f.call(f.users.admin,blockInput(f)), f.call(f.users.client,f.create())])
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
})


test('block midnight boundary is exclusive, buffers count and unrelated professionals do not conflict', async () => {
  const f = await fixture(), input = blockInput(f)
  const midnight = businessDate(`${input.endDate}T00:00`, 'America/La_Paz').getTime()
  const ref = db.doc(`reservations/boundary-${randomUUID()}`)
  const reservation = { businessId:f.businessId, professionalId:f.professionalId, status:'confirmed', startAt:Timestamp.fromMillis(midnight), endAt:Timestamp.fromMillis(midnight+1800000) }
  await ref.set({...reservation,bufferBeforeMinutes:1})
  await rejects(f.call(f.users.admin,input),'failed-precondition')
  await ref.set(reservation)
  const created = await f.call(f.users.admin,input)
  const stored = (await db.doc(`scheduleBlocks/${created.id}`).get()).data()
  assert.equal(stored.endAt.toMillis(),midnight)
  await f.call(f.users.admin,{action:'blockDelete',blockId:created.id,requestId:randomUUID()})
  await ref.set({...reservation,professionalId:'another-professional',startAt:Timestamp.fromMillis(f.time('10:00')),endAt:Timestamp.fromMillis(f.time('11:00'))})
  await rejects(f.call(f.users.admin,{...input,allProfessionals:true,professionalId:null,requestId:randomUUID()}),'failed-precondition')
  assert.equal((await f.call(f.users.admin,{...input,requestId:randomUUID()})).status,'approved')
})


test('professionals reschedule only assigned appointments and retain history and client notices', async () => {
  const f = await fixture(), booked = await f.call(f.users.client, f.create())
  const change = { action:'reschedule', reservationId:booked.id, revision:1, date:f.date, startAt:f.time('11:00'), expectedPrice:100, expectedDuration:30, requestId:randomUUID() }
  await rejects(f.call(f.users.pro2,change),'permission-denied')
  await db.doc(`reservations/${booked.id}`).update({startAt:Timestamp.fromMillis(Date.now()-7200000),endAt:Timestamp.fromMillis(Date.now()-3600000)})
  await rejects(f.call(f.users.client,change),'failed-precondition')
  const moved = await f.call(f.users.pro,change)
  assert.deepEqual(await f.call(f.users.pro,change),moved)
  const stored = (await db.doc(`reservations/${booked.id}`).get()).data()
  assert.equal(stored.startAt.toMillis(),f.time('11:00'))
  assert.equal(stored.rescheduleHistory.length,1)
  assert.equal(stored.rescheduleHistory[0].byUserId,f.users.pro)
  assert.equal((await db.doc(`notifications/${booked.id}_2_${f.users.client}`).get()).data().title,'Cita reprogramada')
})
test('expired pending appointments require an explicit staff closure', async () => {
  const f = await fixture(), booked = await f.call(f.users.client,f.create())
  const close = { action:'status',reservationId:booked.id,revision:1,status:'completed',requestId:randomUUID() }
  await rejects(f.call(f.users.pro,close),'failed-precondition')
  await db.doc(`reservations/${booked.id}`).update({startAt:Timestamp.fromMillis(Date.now()-7200000),endAt:Timestamp.fromMillis(Date.now()-3600000)})
  await rejects(f.call(f.users.client,close),'permission-denied')
  await rejects(f.call(f.users.pro,{...close,status:'confirmed'}),'failed-precondition')
  await f.call(f.users.pro,close)
  assert.equal((await db.doc(`reservations/${booked.id}`).get()).data().status,'completed')
})
