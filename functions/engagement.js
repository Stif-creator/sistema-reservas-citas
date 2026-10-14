import { Timestamp } from 'firebase-admin/firestore'
import { createHash } from 'node:crypto'
import { BookingError } from './bookingError.js'

const fail = (code, message) => { throw new BookingError(code, message) }
const id = value => typeof value === 'string' && /^[^/\s]{1,200}$/.test(value)
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const record = snap => snap.exists ? { ...snap.data(), id: snap.id } : null
const rows = snap => {
  if (snap.size > 2000) fail('resource-exhausted', 'Demasiados resultados. Reduce el rango o contacta al administrador.')
  return snap.docs.map(record)
}
const ms = value => value?.toMillis?.() ?? value
const serial = value => value instanceof Timestamp ? value.toMillis() : Array.isArray(value) ? value.map(serial) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serial(v)])) : value
const scoped = (db, collection, businessId) => db.collection(collection).where('businessId', '==', businessId).limit(2001)
export const engagementActions = ['hub', 'favorite', 'wait', 'unwait', 'review', 'clients', 'clientUpdate', 'promotionSave', 'reminderSave', 'notificationRead']

export function discountedService(service, promotions, now = Date.now()) {
  const valid = promotions.filter(p => p.isActive && Number.isInteger(p.percent) && p.percent >= 1 && p.percent <= 90 && p.serviceId === service.id && ms(p.startAt) <= now && ms(p.endAt) > now)
  const best = valid.sort((a, b) => b.percent - a.percent)[0]
  return best ? { ...service, originalPrice: service.price, price: Math.max(0.01, Math.round(service.price * (100 - best.percent)) / 100), promotionTitle: best.title } : service
}

export async function executeEngagement(db, uid, input, actor) {
  const { businessId, action } = input
  const admin = () => { if (actor.member.role !== 'admin') fail('permission-denied', 'Solo el administrador puede realizar esta acción.') }
  const client = () => { if (actor.member.role !== 'client') fail('permission-denied', 'Esta acción requiere una cuenta de cliente.') }
  const stamp = Timestamp.now()
  const own = collection => scoped(db, collection, businessId).where('userId', '==', uid)
  if (action === 'hub') {
    const [favorites, waiting, notifications, promotions, reviews, reminder] = await Promise.all([
      own('favorites').get().then(rows), own('waitingList').get().then(rows),
      scoped(db, 'notifications', businessId).where('recipientUserId', '==', uid).get().then(rows),
      scoped(db, 'promotions', businessId).get().then(rows),
      scoped(db, 'reviews', businessId).get().then(rows), db.doc(`reminderSettings/${businessId}`).get(),
    ])
    return serial({ favorites, waiting, notifications: notifications.filter(n => ms(n.visibleAt) <= Date.now() && (!n.expiresAt || ms(n.expiresAt) > Date.now())).sort((a, b) => ms(b.visibleAt) - ms(a.visibleAt)),
      promotions: actor.member.role === 'admin' ? promotions : promotions.filter(p => p.isActive && ms(p.startAt) <= Date.now() && ms(p.endAt) > Date.now()),
      reviews: reviews.filter(r => r.status === 'published').map(r => ({ id: r.id, rating: r.rating, comment: r.comment, authorName: r.authorName, serviceName: r.serviceName })), reminderHours: reminder.data()?.hours ?? 24 })
  }
  if (action === 'notificationRead') {
    if (!id(input.id)) fail('invalid-argument', 'Aviso inválido.')
    const ref = db.doc(`notifications/${input.id}`)
    await db.runTransaction(async tx => {
      const value = record(await tx.get(ref))
      if (value?.businessId !== businessId || value.recipientUserId !== uid) fail('permission-denied', 'Aviso no disponible.')
      tx.update(ref, { read: true, readAt: stamp })
    })
    return { ok: true }
  }
  if (action === 'favorite') {
    client()
    if (!['service', 'professional'].includes(input.kind) || !id(input.targetId) || typeof input.enabled !== 'boolean') fail('invalid-argument', 'Favorito inválido.')
    const key = createHash('sha256').update(`${businessId}:${uid}:${input.kind}:${input.targetId}`).digest('hex')
    const ref = db.doc(`favorites/${key}`)
    if (!input.enabled) { await ref.delete(); return { ok: true } }
    const target = record(await db.doc(`${input.kind === 'service' ? 'services' : 'professionals'}/${input.targetId}`).get())
    if (target?.businessId !== businessId || !target.isActive || (input.kind === 'service' && !target.isPublic)) fail('not-found', 'Este favorito ya no está disponible.')
    await ref.set({ businessId, userId: uid, kind: input.kind, targetId: input.targetId, name: target.name || target.displayName || 'Profesional', createdAt: stamp })
    return { ok: true }
  }
  if (action === 'wait' || action === 'unwait') {
    client()
    if (!id(input.serviceId) || !id(input.professionalId) || !/^\d{4}-\d{2}-\d{2}$/.test(input.date || '')) fail('invalid-argument', 'Selecciona servicio, profesional y fecha.')
    const key = createHash('sha256').update(`${businessId}:${uid}:${input.serviceId}:${input.professionalId}:${input.date}`).digest('hex')
    const ref = db.doc(`waitingList/${key}`)
    if (action === 'unwait') { await ref.delete(); return { ok: true } }
    const service = record(await db.doc(`services/${input.serviceId}`).get())
    const professional = record(await db.doc(`professionals/${input.professionalId}`).get())
    if (service?.businessId !== businessId || !service.isActive || !service.isPublic || professional?.businessId !== businessId || !professional.isActive || !professional.serviceIds?.includes(input.serviceId)) fail('failed-precondition', 'El servicio o profesional no está disponible.')
    const day = Date.parse(`${input.date}T23:59:59Z`)
    if (!Number.isFinite(day) || day < Date.now() || day > Date.now() + 366 * 86400000) fail('invalid-argument', 'Selecciona una fecha futura dentro del próximo año.')
    await ref.set({ businessId, userId: uid, serviceId: input.serviceId, professionalId: input.professionalId, date: input.date, serviceName: service.name, professionalName: professional.displayName || 'Profesional', createdAt: stamp })
    return { ok: true }
  }
  if (action === 'review') {
    client()
    if (!id(input.reservationId) || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5 || !text(input.comment, 1000)) fail('invalid-argument', 'Indica una valoración de 1 a 5 y un comentario.')
    const ref = db.doc(`reviews/${input.reservationId}`)
    await db.runTransaction(async tx => {
      const r = record(await tx.get(db.doc(`reservations/${input.reservationId}`)))
      if (r?.businessId !== businessId || r.clientUserId !== uid || r.status !== 'completed') fail('permission-denied', 'Solo puedes valorar una cita propia finalizada.')
      tx.set(ref, { businessId, clientUserId: uid, reservationId: r.id, serviceId: r.serviceId, serviceName: r.serviceName, rating: input.rating, comment: text(input.comment, 1000), authorName: actor.user.firstName || 'Cliente', status: 'published', isPublic: true, updatedAt: stamp })
    })
    return { ok: true }
  }
  if (action === 'clients') {
    admin()
    const [clients, reservations] = await Promise.all([scoped(db, 'clients', businessId).get().then(rows), scoped(db, 'reservations', businessId).get().then(rows)])
    return serial({ clients, reservations })
  }
  if (action === 'clientUpdate') {
    admin()
    if (!id(input.id) || !text(input.firstName, 100) || !/^\+?\d{8,15}$/.test(input.phone || '') || (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))) fail('invalid-argument', 'Revisa el nombre, teléfono y correo del cliente.')
    await db.runTransaction(async tx => {
      const ref = db.doc(`clients/${input.id}`), c = record(await tx.get(ref))
      if (c?.businessId !== businessId) fail('permission-denied', 'Cliente de otro negocio.')
      tx.update(ref, { firstName: text(input.firstName, 100), lastName: text(input.lastName, 100), phone: text(input.phone, 30), email: text(input.email, 254), updatedAt: stamp })
    })
    return { ok: true }
  }
  if (action === 'reminderSave') {
    admin()
    if (!Number.isInteger(input.hours) || input.hours < 1 || input.hours > 168) fail('invalid-argument', 'La anticipación debe ser de 1 a 168 horas.')
    // Recalculate existing scheduled reminders as well as new bookings.
    const reservations = rows(await scoped(db, 'reservations', businessId).get())
    await db.doc(`reminderSettings/${businessId}`).set({ businessId, hours: input.hours, updatedAt: stamp })
    for (const r of reservations) if (r.clientUserId && ['pending', 'confirmed'].includes(r.status) && ms(r.startAt) > Date.now()) await db.runTransaction(async tx => {
      const [fresh, settings] = await Promise.all([tx.get(db.doc(`reservations/${r.id}`)).then(record), tx.get(db.doc(`reminderSettings/${businessId}`)).then(record)])
      if (fresh && ['pending', 'confirmed'].includes(fresh.status) && ms(fresh.startAt) > Date.now()) tx.set(db.doc(`notifications/reminder_${r.id}`), reminderFor(fresh, settings.hours, stamp))
    })
    return { ok: true }
  }
  if (action === 'promotionSave') {
    admin()
    if (!id(input.serviceId) || !id(input.id) || !text(input.title, 100) || !Number.isInteger(input.percent) || input.percent < 1 || input.percent > 90 || !Number.isSafeInteger(input.startAt) || !Number.isSafeInteger(input.endAt) || input.endAt <= input.startAt || typeof input.isActive !== 'boolean') fail('invalid-argument', 'Completa la promoción: descuento de 1 a 90 % y fechas válidas.')
    await db.runTransaction(async tx => {
      const ref = db.doc(`promotions/${input.id}`)
      const [previous, service] = await Promise.all([tx.get(ref).then(record), tx.get(db.doc(`services/${input.serviceId}`)).then(record)])
      if ((previous && previous.businessId !== businessId) || service?.businessId !== businessId) fail('permission-denied', 'La promoción o servicio pertenece a otro negocio.')
      tx.set(ref, { businessId, serviceId: input.serviceId, serviceName: service.name, title: text(input.title, 100), percent: input.percent, startAt: Timestamp.fromMillis(input.startAt), endAt: Timestamp.fromMillis(input.endAt), isActive: input.isActive, updatedAt: stamp })
    })
    return { ok: true }
  }
  fail('invalid-argument', 'Operación inválida.')
}

export function reminderFor(r, hours, stamp) {
  return { businessId: r.businessId, recipientUserId: r.clientUserId, reservationId: r.id, type: 'reminder', title: `Recordatorio: ${r.serviceName}`, message: 'Tu cita se aproxima. Consulta la fecha y hora en el detalle.', visibleAt: Timestamp.fromMillis(Math.max(stamp.toMillis(), ms(r.startAt) - hours * 3600000)), expiresAt: r.startAt, read: false, createdAt: stamp }
}

export function bookingNotices(db, tx, reservation, revision, action, hours, stamp, ownerId) {
  const labels = { pending: 'pendiente', confirmed: 'confirmada', cancelled: 'cancelada', completed: 'finalizada', no_show: 'no asistida' }
  for (const recipientUserId of new Set([reservation.clientUserId, reservation.professionalUserId, ownerId].filter(Boolean))) {
    tx.set(db.doc(`notifications/${reservation.id}_${revision}_${recipientUserId}`), { businessId: reservation.businessId, recipientUserId, reservationId: reservation.id, type: 'change', title: action === 'reschedule' ? 'Cita reprogramada' : `Cita ${labels[reservation.status]}`, message: `${reservation.serviceName} · ${reservation.professionalName}`, read: false, visibleAt: stamp, createdAt: stamp })
  }
  const ref = db.doc(`notifications/reminder_${reservation.id}`)
  if (reservation.clientUserId && ['pending', 'confirmed'].includes(reservation.status)) tx.set(ref, reminderFor(reservation, hours, stamp))
  else tx.delete(ref)
}
