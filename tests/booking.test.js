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

test('discounts use inclusive starts, exclusive ends, the highest valid percentage and no stacking', () => {
  const service = { id:'s', price:100 }
  const offer = { serviceId:'s', isActive:true, percent:10, startAt:100, endAt:300 }
  assert.equal(discountedService(service, [offer], 99).price,100)
  assert.equal(discountedService(service, [offer], 100).price,90)
  assert.equal(discountedService(service, [offer], 299).price,90)
  assert.equal(discountedService(service, [offer], 300).price,100)
  assert.equal(discountedService(service, [offer, { ...offer, percent:20 }], 200).price,80)
  assert.equal(discountedService(service, [{ ...offer, percent:200 }],200).price,100)
  assert.equal(discountedService(service, [{ ...offer, serviceId:'other' }],200).price,100)
  assert.equal(discountedService(service, [{ ...offer, isActive:false }],200).price,100)
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

test('waitlist follow-up is scoped, audited, supports legacy entries and rejects duplicate or unauthorized changes', async () => {
  const f = await fixture()
  const wait = { action: 'wait', serviceId: f.serviceId, professionalId: f.professionalId, date: f.date }
  await f.call(f.users.client, wait)
  const entry = (await db.collection('waitingList').where('businessId', '==', f.businessId).get()).docs[0]
  assert.equal((await f.call(f.users.admin, { action: 'waitlist' }))[0].followUpStatus, undefined)

  await f.call(f.users.admin, { action: 'waitlistUpdate', id: entry.id, status: 'contacted' })
  const contacted = (await db.doc(`waitingList/${entry.id}`).get()).data()
  assert.equal(contacted.followUpStatus, 'contacted')
  assert.equal(contacted.followUpUpdatedBy, f.users.admin)
  assert.equal(contacted.followUpRevision, 1)
  await rejects(f.call(f.users.admin, { action: 'waitlistUpdate', id: entry.id, status: 'contacted' }), 'failed-precondition')
  await f.call(f.users.pro, { action: 'waitlistUpdate', id: entry.id, status: 'resolved' })
  assert.equal((await db.doc(`waitingList/${entry.id}`).get()).data().followUpStatus, 'resolved')
  assert.equal((await db.collection('waitlistFollowups').where('waitlistId', '==', entry.id).get()).size, 2)
  await rejects(f.call(f.users.pro2, { action: 'waitlistUpdate', id: entry.id, status: 'closed' }), 'permission-denied')
  await rejects(f.call(f.users.admin, { action: 'waitlistUpdate', id: 'missing', status: 'closed' }), 'not-found')
  await db.doc('waitingList/foreign-request').set({ businessId: 'another-business', userId: 'private-user', date: f.date })
  await rejects(f.call(f.users.admin, { action: 'waitlistUpdate', id: 'foreign-request', status: 'closed' }), 'not-found')

  const superadminId = `superadmin-${randomUUID()}`
  await db.doc(`users/${superadminId}`).set({ status: 'active', globalRole: 'superadmin' })
  await rejects(f.call(superadminId, { action: 'waitlist' }), 'permission-denied')
  await rejects(f.call(superadminId, { action: 'waitlistUpdate', id: entry.id, status: 'closed' }), 'permission-denied')
})

test('business user directory follows scoped memberships across tenants and membership changes cannot grant administrator role', async () => {
  const f = await fixture()
  const otherBusiness = `other-${f.businessId}`
  await db.doc(`businesses/${otherBusiness}`).set({ status: 'active', ownerUserId: f.users.other })
  await db.doc(`memberships/${otherBusiness}_${f.users.pro}`).set({ businessId: otherBusiness, userId: f.users.pro, role: 'professional', status: 'active' })
  await db.doc(`users/${f.users.pro}`).update({ businessIds: [otherBusiness, f.businessId] })
  const listing = await f.call(f.users.admin, { action: 'businessUsers' })
  assert.deepEqual(new Set(listing.map(item => item.role)), new Set(['admin', 'professional', 'client']))
  assert(listing.every(item => item.userId !== f.users.other || item.profileAvailable))
  assert(listing.some(item => item.userId === f.users.pro && item.profileAvailable))

  await db.doc(`users/${f.users.other}`).delete()
  const incomplete = await f.call(f.users.admin, { action: 'businessUsers' })
  assert(incomplete.some(item => item.userId === f.users.other && !item.profileAvailable && !item.name && !item.email))
  await rejects(f.call(f.users.client, { action: 'businessUsers' }), 'permission-denied')
  await rejects(f.call(f.users.pro, { action: 'businessUsers' }), 'permission-denied')
  const outsideAdmin = `outside-admin-${f.businessId}`
  await db.doc(`users/${outsideAdmin}`).set({ firstName: 'Outside', status: 'active', globalRole: 'user' })
  await db.doc(`memberships/${otherBusiness}_${outsideAdmin}`).set({ businessId: otherBusiness, userId: outsideAdmin, role: 'admin', status: 'active' })
  await rejects(executeBooking(db, outsideAdmin, { action: 'businessUsers', businessId: f.businessId }), 'permission-denied')
  const superadmin = `super-${f.businessId}`
  await db.doc(`users/${superadmin}`).set({ status: 'active', globalRole: 'superadmin' })
  await rejects(executeBooking(db, superadmin, { action: 'businessUsers', businessId: f.businessId }), 'permission-denied')
  await rejects(f.call(f.users.admin, { action: 'membershipUpdate', userId: f.users.client, role: 'admin', status: 'active' }), 'permission-denied')
  await rejects(f.call(f.users.admin, { action: 'membershipUpdate', userId: f.users.admin, role: 'client', status: 'inactive' }), 'permission-denied')
  await rejects(f.call(f.users.admin, { action: 'membershipUpdate', userId: f.users.other, role: 'client', status: 'inactive' }), 'failed-precondition')
  await db.doc(`users/no-membership-${f.businessId}`).set({ firstName: 'Unlinked', status: 'active', globalRole: 'user' })
  await rejects(f.call(f.users.admin, { action: 'membershipUpdate', userId: `no-membership-${f.businessId}`, role: 'client', status: 'inactive' }), 'not-found')

  await f.call(f.users.admin, { action: 'membershipUpdate', userId: f.users.client, role: 'client', status: 'inactive' })
  assert.equal((await db.doc(`memberships/${f.businessId}_${f.users.client}`).get()).data().status, 'inactive')
  await f.call(f.users.admin, { action: 'membershipUpdate', userId: f.users.client, role: 'professional', status: 'active' })
  const assignedProfile = await db.doc(`professionals/${f.businessId}_${f.users.client}`).get()
  assert.equal(assignedProfile.data().userId, f.users.client)
  assert.equal(assignedProfile.data().isActive, true)
  await f.call(f.users.admin, { action: 'membershipUpdate', userId: f.users.client, role: 'client', status: 'active' })
  assert.equal((await db.doc(`professionals/${f.businessId}_${f.users.client}`).get()).data().isActive, false)
  assert.equal((await db.doc(`users/${f.users.pro}`).get()).data().businessIds[0], otherBusiness)
  await db.doc(`users/${f.users.other}`).set({ firstName: 'Other', status: 'active', globalRole: 'user', businessIds: [otherBusiness] })
  await db.doc(`memberships/${otherBusiness}_${f.users.other}`).set({ businessId: otherBusiness, userId: f.users.other, role: 'admin', status: 'active' })
  const foreign = await executeBooking(db, f.users.other, { action: 'businessUsers', businessId: otherBusiness })
  assert.deepEqual(new Set(foreign.map(item => item.userId)), new Set([f.users.other, f.users.pro, outsideAdmin]))
})

test('waitlist requests notify scoped admins and only the selected professional', async () => {
  const f = await fixture()
  const superadminId = `superadmin-${randomUUID()}`
  await db.doc(`users/${superadminId}`).set({ status: 'active', globalRole: 'superadmin' })
  const selected = { action: 'wait', serviceId: f.serviceId, professionalId: f.professionalId, date: f.date }

  await Promise.all([f.call(f.users.client, selected), f.call(f.users.client, selected)])
  const selectedWait = (await db.collection('waitingList').where('businessId', '==', f.businessId).get()).docs
    .find(doc => doc.data().professionalId === f.professionalId)
  assert(selectedWait)
  let notices = await db.collection('notifications').where('waitlistId', '==', selectedWait.id).get()
  const dateLabel = new Intl.DateTimeFormat('es-BO', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${f.date}T12:00:00Z`))
  assert.deepEqual(new Set(notices.docs.map(doc => doc.data().recipientUserId)), new Set([f.users.admin, f.users.pro]))
  assert(notices.docs.every(doc => doc.data().businessId === f.businessId && doc.data().type === 'waitlist' && doc.data().read === false))
  assert(notices.docs.every(doc => doc.data().message.includes('Consulta') && doc.data().message.includes(dateLabel)))
  assert.equal((await db.collection('notifications').where('recipientUserId', '==', superadminId).get()).size, 0)
  assert.equal((await f.call(f.users.pro2, { action: 'hub' })).notifications.some(item => item.waitlistId === selectedWait.id), false)

  await f.call(f.users.client, selected)
  notices = await db.collection('notifications').where('waitlistId', '==', selectedWait.id).get()
  assert.equal(notices.size, 2, 'idempotent duplicate requests must not create duplicate notices')

  const noPreference = { ...selected, professionalId: null }
  await f.call(f.users.client, noPreference)
  const noPreferenceWait = (await db.collection('waitingList').where('businessId', '==', f.businessId).get()).docs
    .find(doc => doc.data().professionalId === null)
  assert(noPreferenceWait)
  assert.equal(noPreferenceWait.data().professionalName, 'Sin preferencia')
  notices = await db.collection('notifications').where('waitlistId', '==', noPreferenceWait.id).get()
  assert.deepEqual(new Set(notices.docs.map(doc => doc.data().recipientUserId)), new Set([f.users.admin]))

  await rejects(f.call(f.users.client, { ...selected, date: '2026-02-30' }), 'invalid-argument')
  await db.doc(`services/${f.serviceId}`).update({ isActive: false })
  const nextDate = new Date(Date.parse(`${f.date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
  await rejects(f.call(f.users.client, { ...selected, date: nextDate }), 'failed-precondition')
  await rejects(f.call(f.users.pro, selected), 'permission-denied')
  await rejects(f.call(f.users.client, { ...selected, businessId: `other-${f.businessId}` }), 'permission-denied')
  const unrelatedService = `unrelated-service-${f.businessId}`
  await db.doc(`services/${unrelatedService}`).set({ businessId: f.businessId, name: 'Otro servicio', isActive: true, isPublic: true })
  await rejects(f.call(f.users.client, { ...selected, serviceId: unrelatedService, date: nextDate }), 'failed-precondition')
  assert.equal((await db.collection('notifications').where('businessId', '==', f.businessId).get()).size, 3)
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
  await f.call(f.users.client, { action:'notificationReadAll' })
  const allNotices = (await db.collection('notifications').where('businessId', '==', f.businessId).get()).docs.map(item => ({ id:item.id, ...item.data() }))
  assert(allNotices.filter(item => item.recipientUserId === f.users.client).every(item => item.read === true))
  assert(allNotices.filter(item => item.recipientUserId !== f.users.client).some(item => item.read === false))
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

test('promotion lifecycle notices are scheduled per active admin, deduplicated, and invalidated safely', async () => {
  const f = await fixture()
  const secondAdmin = `admin-second-${f.businessId}`
  await db.doc(`users/${secondAdmin}`).set({ firstName: 'Segundo', lastName: 'Admin', status: 'active' })
  await db.doc(`memberships/${f.businessId}_${secondAdmin}`).set({ businessId: f.businessId, userId: secondAdmin, role: 'admin', status: 'active' })
  const now = Date.now()
  const promotionId = `scheduled-${f.businessId}`
  const save = changes => f.call(f.users.admin, { action: 'promotionSave', id: promotionId, serviceId: f.serviceId,
    title: 'Descuento de noviembre', percent: 15, startAt: now + 3600000, endAt: now + 86400000, isActive: true, ...changes })
  await rejects(f.call(f.users.pro, { action: 'promotionSave', id: promotionId, serviceId: f.serviceId,
    title: 'Oferta profesional', percent: 15, startAt: now + 3600000, endAt: now + 86400000, isActive: true }), 'permission-denied')
  await save()
  let snapshot = await db.collection('notifications').where('promotionId', '==', promotionId).get()
  assert.equal(snapshot.size, 4)
  assert.deepEqual(new Set(snapshot.docs.map(item => item.data().recipientUserId)), new Set([f.users.admin, secondAdmin]))
  assert(snapshot.docs.every(item => item.data().businessId === f.businessId && item.data().type === 'promotion'))
  assert(snapshot.docs.every(item => ![f.users.pro, f.users.client, f.users.other].includes(item.data().recipientUserId)))
  assert.equal(snapshot.docs.filter(item => item.data().event === 'promotionStarted').length, 2)
  assert.equal(snapshot.docs.filter(item => item.data().event === 'promotionEnded').length, 2)
  assert(snapshot.docs.filter(item => item.data().event === 'promotionStarted').every(item => item.data().visibleAt.toMillis() === now + 3600000))
  assert(snapshot.docs.filter(item => item.data().event === 'promotionEnded').every(item => item.data().visibleAt.toMillis() === now + 86400000))

  await save()
  assert.equal((await db.collection('notifications').where('promotionId', '==', promotionId).get()).size, 4)
  await save({ isActive: false })
  snapshot = await db.collection('notifications').where('promotionId', '==', promotionId).get()
  assert(snapshot.docs.every(item => item.data().invalidated === true))
  assert.equal((await f.call(f.users.admin, { action: 'hub' })).notifications.some(item => item.promotionId === promotionId), false)

  await save({ isActive: true })
  snapshot = await db.collection('notifications').where('promotionId', '==', promotionId).get()
  assert.equal(snapshot.size, 4)
  assert(snapshot.docs.every(item => item.data().invalidated === false))
  const movedStart = now + 2 * 86400000
  await save({ startAt: movedStart, endAt: movedStart + 86400000 })
  snapshot = await db.collection('notifications').where('promotionId', '==', promotionId).get()
  assert.equal(snapshot.size, 8)
  assert.equal(snapshot.docs.filter(item => item.data().invalidated === true).length, 4)
  assert.equal(snapshot.docs.filter(item => item.data().invalidated === false).length, 4)

  const liveId = `live-${f.businessId}`
  const liveStart = Date.now() - 3600000
  const liveEnd = Date.now() + 3600000
  await f.call(f.users.admin, { action: 'promotionSave', id: liveId, serviceId: f.serviceId, title: 'Descuento vigente', percent: 10,
    startAt: liveStart, endAt: liveEnd, isActive: true })
  const liveNotices = await db.collection('notifications').where('promotionId', '==', liveId).get()
  const liveStartNotice = liveNotices.docs.find(item => item.data().event === 'promotionStarted')
  const liveEndNotice = liveNotices.docs.find(item => item.data().event === 'promotionEnded')
  assert(liveStartNotice.data().visibleAt.toMillis() >= Date.now() - 1000)
  assert.equal(liveStartNotice.data().promotionEventAt.toMillis(), liveStart)
  assert(liveEndNotice.data().visibleAt.toMillis() > Date.now())
  assert.equal((await f.call(f.users.admin, { action: 'hub' })).notifications.some(item => item.id === liveEndNotice.id), false)
  await rejects(f.call(f.users.pro, { action: 'promotionServiceStatus', serviceId: f.serviceId, isActive: false }), 'permission-denied')
  await f.call(f.users.admin, { action: 'promotionServiceStatus', serviceId: f.serviceId, isActive: false })
  assert.equal((await db.doc(`services/${f.serviceId}`).get()).data().isActive, false)
  assert.equal((await db.doc(`notifications/${liveEndNotice.id}`).get()).data().invalidated, true)
  assert.equal((await db.doc(`notifications/${liveStartNotice.id}`).get()).data().invalidated, false)
  await f.call(f.users.admin, { action: 'promotionServiceStatus', serviceId: f.serviceId, isActive: true })
  assert.equal((await db.doc(`notifications/${liveEndNotice.id}`).get()).data().invalidated, false)
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

test('client records and appointment history are restricted by role and global admins receive aggregates only', async () => {
  const f = await fixture()
  const adminAppointment = `appt-admin-${f.businessId}`
  const professionalAppointment = `appt-pro-${f.businessId}`
  const otherProfessionalAppointment = `appt-other-pro-${f.businessId}`
  const startAt = Timestamp.fromMillis(Date.now() + 86400000)
  for (const [id, clientId, professionalUserId] of [
    [adminAppointment, f.users.client, f.users.pro],
    [professionalAppointment, f.users.client, f.users.pro],
    [otherProfessionalAppointment, f.users.other, f.users.pro2],
  ]) await db.doc(`reservations/${id}`).set({
    id, businessId: f.businessId, clientId, professionalUserId,
    serviceName: 'Consulta', professionalName: 'Profesional', startAt,
    endAt: Timestamp.fromMillis(startAt.toMillis() + 1800000), timeZone: 'America/La_Paz', status: 'confirmed',
    notes: 'Dato privado que no debe salir en historial',
  })

  const adminClients = await f.call(f.users.admin, { action: 'clients' })
  assert.equal(adminClients.reservations, undefined)
  assert.deepEqual(new Set(adminClients.clients.map(client => client.id)), new Set([f.users.client, f.users.other]))

  const professionalClients = await f.call(f.users.pro, { action: 'clients' })
  assert.deepEqual(professionalClients.clients.map(client => client.id), [f.users.client])
  assert.equal(professionalClients.clients[0].userId, undefined)
  const professionalHistory = await f.call(f.users.pro, { action: 'clientHistory', clientId: f.users.client })
  assert.deepEqual(professionalHistory.history.map(item => item.id).sort(), [professionalAppointment, adminAppointment].sort())
  assert.equal(professionalHistory.history[0].notes, undefined)
  assert.deepEqual((await f.call(f.users.admin, { action: 'clientHistory', clientId: f.users.client })).history.map(item => item.id).sort(), [adminAppointment, professionalAppointment].sort())
  await rejects(f.call(f.users.pro, { action: 'clientHistory', clientId: f.users.other }), 'permission-denied')
  await rejects(f.call(f.users.pro, { action: 'clientUpdate', id: f.users.client, firstName: 'Cambio', phone: '70000001' }), 'permission-denied')

  const superadminId = `super-${f.businessId}`
  await db.doc(`users/${superadminId}`).set({ globalRole: 'superadmin', status: 'active' })
  const summary = await executeBooking(db, superadminId, { action: 'clients' })
  assert.equal(summary.summaryOnly, true)
  assert.equal(typeof summary.totalClients, 'number')
  assert.equal(summary.clients, undefined)
  assert.equal(summary.history, undefined)
  const selectedBusinessSummary = await executeBooking(db, superadminId, { action: 'clients', businessId: f.businessId })
  assert.equal(selectedBusinessSummary.summaryOnly, true)
  assert.equal(selectedBusinessSummary.clients, undefined)
  await rejects(executeBooking(db, superadminId, { action: 'clientHistory', businessId: f.businessId, clientId: f.users.client }), 'permission-denied')
  await rejects(executeBooking(db, superadminId, { action: 'clientUpdate', businessId: f.businessId, id: f.users.client, firstName: 'Cambio', phone: '70000001' }), 'permission-denied')
  await rejects(executeBooking(db, superadminId, { action: 'reminderSave', businessId: f.businessId, hours: 48 }), 'permission-denied')
  await rejects(executeBooking(db, superadminId, { action: 'promotionSave', businessId: f.businessId,
    id: `promo-${f.businessId}`, serviceId: `service-${f.businessId}`, title: 'Oferta', percent: 15,
    startAt: Date.now(), endAt: Date.now() + 86400000, isActive: true }), 'permission-denied')
  await rejects(executeBooking(db, superadminId, { action: 'promotionServiceStatus', businessId: f.businessId,
    serviceId: `service-${f.businessId}`, isActive: false }), 'permission-denied')
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
  let platformNotices = await db.collection('notifications').where('recipientUserId', '==', platform).get()
  assert.equal(platformNotices.size, 1, 'a retried business creation creates one global alert')
  assert.equal(platformNotices.docs[0].data().type, 'platform')
  assert.equal(platformNotices.docs[0].data().event, 'platformCreate')
  assert.equal(platformNotices.docs[0].data().businessName, 'Test tenant')
  assert.equal('clientName' in platformNotices.docs[0].data(), false)
  await executeBooking(db, platform, { action: 'notificationRead', id: platformNotices.docs[0].id })
  assert.equal((await db.doc(`notifications/${platformNotices.docs[0].id}`).get()).data().read, true)
  const legacyPersonalRef = db.doc(`notifications/legacy-personal-${platform}`)
  await legacyPersonalRef.set({ businessId: bid, recipientUserId: platform, type: 'change', read: false })
  assert.equal((await db.doc(`memberships/${bid}_${f.users.admin}`).get()).data().role, 'admin')
  assert.deepEqual((await db.doc(`users/${f.users.admin}`).get()).data().businessIds, [f.businessId, bid])
  assert.equal((await db.doc(`businesses/${bid}`).get()).data().settings.publicPageEnabled, false)
  const status = value => ({ action: 'platformStatus', businessId: bid, status: value, confirmName: 'Test tenant' })
  await rejects(executeBooking(db, platform, status('deleted')), 'failed-precondition')
  await executeBooking(db, platform, status('inactive'))
  await executeBooking(db, platform, status('inactive'))
  platformNotices = await db.collection('notifications').where('recipientUserId', '==', platform).where('type', '==', 'platform').get()
  assert.equal(platformNotices.size, 2, 'repeating the same status does not create another alert')
  assert(platformNotices.docs.some(doc => doc.data().event === 'platformStatus' && doc.data().status === 'inactive'))
  await executeBooking(db, platform, { action: 'notificationReadAll' })
  platformNotices = await db.collection('notifications').where('recipientUserId', '==', platform).where('type', '==', 'platform').get()
  assert(platformNotices.docs.every(doc => doc.data().read === true))
  assert.equal((await legacyPersonalRef.get()).data().read, false, 'global read-all leaves legacy personal notices untouched')
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
