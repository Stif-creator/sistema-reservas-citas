import { executeBlocks } from './blocks.js'
import { executePlatform } from './platform.js'
import { createHash } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { BookingError } from './bookingError.js'
import { availableSlots } from './shared/availability.js'
import { executeEngagement, engagementActions, discountedService, bookingNotices } from './engagement.js'

const fail = (code, message) => { throw new BookingError(code, message) }
const record = snapshot => snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : null
const list = snapshot => {
  if (snapshot.size > 2000) fail('resource-exhausted', 'Hay demasiados registros para esta consulta. Contacta al administrador.')
  return snapshot.docs.map(record)
}
const millis = value => value?.toMillis?.() ?? Number(value)
const identifier = value => typeof value === 'string' && /^[^/\s]{1,200}$/.test(value)
const fullName = user => `${user.firstName || ''} ${user.lastName || ''}`.trim()
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const activeStates = ['pending', 'confirmed']
const scoped = (db, name, businessId) => db.collection(name).where('businessId', '==', businessId).limit(2001)

async function context(db, reader, uid, businessId) {
  if (!uid) fail('unauthenticated', 'Inicia sesión para continuar.')
  if (!identifier(businessId)) fail('invalid-argument', 'Selecciona un negocio válido.')
  const [user, member, business] = await Promise.all([
    reader.get(db.doc(`users/${uid}`)).then(record),
    reader.get(db.doc(`memberships/${businessId}_${uid}`)).then(record),
    reader.get(db.doc(`businesses/${businessId}`)).then(record),
  ])
  if (user?.status === 'active' && user.globalRole === 'superadmin' && business?.status === 'active') return { user, member: { businessId, userId: uid, role: 'admin', status: 'active' }, business, uid }
  if (!user || user.status !== 'active' || !member || member.status !== 'active' || business?.status !== 'active' ||
    !['admin', 'professional', 'client'].includes(member.role)) fail('permission-denied', 'Tu cuenta no tiene acceso activo a este negocio.')
  return { user, member, business, uid }
}

async function publicContext(db, reader, businessId) {
  if (!identifier(businessId)) fail('invalid-argument', 'Negocio inválido.')
  const business = record(await reader.get(db.doc(`businesses/${businessId}`)))
  if (business?.status !== 'active' || business.settings?.publicPageEnabled !== true) fail('permission-denied', 'La página pública no está disponible.')
  return { business, member: { role: 'client' }, uid: null }
}

function manage(actor, item, clientAllowed = true) {
  if (!item || item.businessId !== actor.business.id) fail('not-found', 'No se encontró la reserva.')
  if (actor.member.role === 'admin') return
  if (clientAllowed && actor.member.role === 'client' && item.clientUserId === actor.uid) return
  if (actor.member.role === 'professional' && item.professionalUserId === actor.uid) return
  fail('permission-denied', 'No puedes modificar esta reserva.')
}

function clientDeadline(actor, item, now) {
  if (actor.member.role !== 'client') return
  const hours = Math.max(0, actor.business.settings?.cancellationLimitHours ?? 24)
  if (millis(item.startAt) <= now || millis(item.startAt) - now < hours * 3600000)
    fail('failed-precondition', `Los cambios requieren al menos ${hours} horas de anticipación. Contacta al negocio.`)
}

async function selection(db, reader, actor, serviceId, professionalId) {
  if (!identifier(serviceId) || !identifier(professionalId)) fail('invalid-argument', 'Selecciona servicio y profesional.')
  const [service, professional] = await Promise.all([
    reader.get(db.doc(`services/${serviceId}`)).then(record), reader.get(db.doc(`professionals/${professionalId}`)).then(record),
  ])
  if (service?.businessId !== actor.business.id || !service.isActive || (actor.member.role === 'client' && !service.isPublic))
    fail('failed-precondition', 'Este servicio ya no está disponible.')
  if (!Number.isFinite(service.price) || service.price <= 0) fail('failed-precondition', 'El precio del servicio no es válido. Contacta al negocio.')
  if (professional?.businessId !== actor.business.id || !professional.isActive || !professional.serviceIds?.includes(service.id))
    fail('failed-precondition', 'El profesional no está disponible para este servicio.')
  if (!identifier(professional.userId)) fail('failed-precondition', 'El perfil del profesional está incompleto.')
  const [member, user] = await Promise.all([
    reader.get(db.doc(`memberships/${actor.business.id}_${professional.userId}`)).then(record),
    reader.get(db.doc(`users/${professional.userId}`)).then(record),
  ])
  if (member?.role !== 'professional' || member.status !== 'active' || user?.status !== 'active') fail('failed-precondition', 'El profesional no está activo.')
  if (actor.member.role === 'professional' && professional.userId !== actor.uid) fail('permission-denied', 'Solo puedes consultar tu disponibilidad.')
  const promotions = list(await reader.get(scoped(db, 'promotions', actor.business.id)))
  return { service: discountedService(service, promotions), professional }
}

async function calendar(db, reader, businessId, professionalId) {
  const [blocks, reservations] = await Promise.all([
    reader.get(scoped(db, 'scheduleBlocks', businessId)).then(list),
    reader.get(scoped(db, 'reservations', businessId).where('professionalId', '==', professionalId)).then(list),
  ])
  return { blocks, reservations }
}

async function bookingClient(db, reader, actor, input, reservationId) {
  if (actor.member.role === 'client') {
    if (input.clientId || input.manualClient) fail('permission-denied', 'Solo puedes reservar para tu propia cuenta.')
    const matches = list(await reader.get(scoped(db, 'clients', actor.business.id).where('userId', '==', actor.uid)))
    if (matches.length !== 1) fail('failed-precondition', 'No se pudo identificar tu perfil de cliente. Contacta al negocio.')
    return { clientId: matches[0].id, clientUserId: actor.uid, clientName: fullName(actor.user), clientEmail: actor.user.email || '', clientPhone: actor.user.phone || '' }
  }
  if (actor.member.role !== 'admin') fail('permission-denied', 'Solo el administrador puede registrar reservas manuales.')
  if (input.clientId) {
    if (!identifier(input.clientId)) fail('invalid-argument', 'Selecciona un cliente válido.')
    const client = record(await reader.get(db.doc(`clients/${input.clientId}`)))
    if (client?.businessId !== actor.business.id) fail('permission-denied', 'El cliente no pertenece a este negocio.')
    if (client.userId) {
      const [member, user] = await Promise.all([
        reader.get(db.doc(`memberships/${actor.business.id}_${client.userId}`)).then(record), reader.get(db.doc(`users/${client.userId}`)).then(record),
      ])
      if (member?.role !== 'client' || member.status !== 'active' || user?.status !== 'active') fail('failed-precondition', 'El cliente no tiene una cuenta activa.')
      return { clientId: client.id, clientUserId: client.userId, clientName: fullName(user), clientEmail: user.email || '', clientPhone: user.phone || '' }
    }
    return { clientId: client.id, clientUserId: null, clientName: fullName(client), clientEmail: client.email || '', clientPhone: client.phone || '' }
  }
  const manual = input.manualClient || {}
  const name = text(manual.name, 120), phone = text(manual.phone, 30), email = text(manual.email, 254)
  if (name.length < 2 || !/^\+?\d{8,15}$/.test(phone) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
    fail('invalid-argument', 'Ingresa nombre, teléfono válido y, si corresponde, correo del cliente.')
  return { clientId: `manual_${reservationId}`, clientUserId: null, clientName: name, clientEmail: email, clientPhone: phone, createManual: true }
}

function quote(service, currencyCode = 'BOB') {
  return { price: service.price, durationMinutes: service.durationMinutes, currencyCode: service.currencyCode || currencyCode,
    bufferBeforeMinutes: service.bufferBeforeMinutes || 0, bufferAfterMinutes: service.bufferAfterMinutes || 0 }
}

export async function executeBooking(db, uid, input) {
  if (!input || typeof input !== 'object') fail('invalid-argument', 'Solicitud inválida.')
  const { businessId, action } = input
  if (['platformCreate', 'platformStatus'].includes(action)) return executePlatform(db, uid, input)
  if (['blockCreate', 'blockApprove', 'blockReject', 'blockDelete'].includes(action)) return executeBlocks(db, uid, input, context)
  const reader = { get: ref => ref.get() }
  if (engagementActions.includes(action)) {
    if (['notificationRead', 'notificationReadAll'].includes(action)) {
      if (!uid) fail('unauthenticated', 'Inicia sesión para continuar.')
      const user = record(await reader.get(db.doc(`users/${uid}`)))
      if (user?.status === 'active' && user.globalRole === 'superadmin')
        return executeEngagement(db, uid, input, { uid, user, member: { role: 'admin', businessId: null }, business: null, isSuperadmin: true })
    }
    return executeEngagement(db, uid, input, await context(db, reader, uid, businessId))
  }
  if (action === 'options' || action === 'publicOptions') {
    const actor = action === 'publicOptions' ? await publicContext(db, reader, businessId) : await context(db, reader, uid, businessId)
    const [services, professionals, members, clients, promotions, reviews] = await Promise.all([
      reader.get(scoped(db, 'services', businessId)).then(list), reader.get(scoped(db, 'professionals', businessId)).then(list),
      reader.get(scoped(db, 'memberships', businessId)).then(list),
      actor.member.role === 'admin' ? reader.get(scoped(db, 'clients', businessId)).then(list) : [],
      reader.get(scoped(db, 'promotions', businessId)).then(list),
      reader.get(scoped(db, 'reviews', businessId)).then(list),
    ])
    return {
      services: services.filter(s => s.isActive && (actor.member.role !== 'client' || s.isPublic) && (actor.member.role !== 'professional' || professionals.some(p => p.userId === uid && p.isActive && p.serviceIds?.includes(s.id)))).map(s => { const priced = discountedService(s, promotions); return { id: s.id, name: s.name, promotionTitle: priced.promotionTitle || '', originalPrice: s.price, ...quote(priced, actor.business.settings?.currencyCode) } }),
      reviews: reviews.filter(r => r.status === 'published' && r.isPublic).map(r => ({ id: r.id, serviceId: r.serviceId || null, serviceName: r.serviceName, professionalId: r.professionalId || null, professionalName: r.professionalName || null, professionalRating: r.professionalRating || null, rating: r.rating, comment: r.comment, authorName: r.authorName, reviewedAt: Number.isFinite(millis(r.updatedAt || r.createdAt)) ? millis(r.updatedAt || r.createdAt) : null })),
      professionals: professionals.filter(p => p.isActive && members.some(m => m.userId === p.userId && m.status === 'active' && m.role === 'professional') &&
        (actor.member.role !== 'professional' || p.userId === uid)).map(p => ({ id: p.id, displayName: p.displayName || 'Profesional', jobTitle: p.jobTitle || '', bio: p.bio || '', photoUrl: p.photo?.url || '', serviceIds: p.serviceIds || [] })),
      clients: clients.filter(c => !c.userId || members.some(m => m.userId === c.userId && m.status === 'active' && m.role === 'client'))
        .map(c => ({ id: c.id, name: fullName(c), phone: c.phone || '' })),
    }
  }
  if (action === 'availability' || action === 'publicAvailability') {
    const actor = action === 'publicAvailability' ? await publicContext(db, reader, businessId) : await context(db, reader, uid, businessId)
    if (action === 'publicAvailability' && input.reservationId) fail('permission-denied', 'La consulta pública no permite acceder a reservas.')
    if (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) fail('invalid-argument', 'Selecciona una fecha válida.')
    const selected = await selection(db, reader, actor, input.serviceId, input.professionalId)
    const agenda = await calendar(db, reader, businessId, selected.professional.id)
    if (input.reservationId) {
      if (!identifier(input.reservationId)) fail('invalid-argument', 'Reserva inválida.')
      const original = record(await reader.get(db.doc(`reservations/${input.reservationId}`)))
      manage(actor, original)
      if (!activeStates.includes(original.status)) fail('failed-precondition', 'Esta reserva ya no admite cambios.')
      agenda.reservations = agenda.reservations.filter(r => r.id !== original.id)
    }
    return { slots: availableSlots({ business: actor.business, ...selected, ...agenda, date: input.date }), quote: quote(selected.service, actor.business.settings?.currencyCode),
      timeZone: actor.business.settings?.timezone || 'America/La_Paz' }
  }
  if (!['create', 'reschedule', 'status'].includes(action)) fail('invalid-argument', 'Operación inválida.')
  if (typeof input.requestId !== 'string' || !/^[\w-]{16,80}$/.test(input.requestId)) fail('invalid-argument', 'La solicitud no tiene un identificador válido.')
  const operationId = `${uid}_${input.requestId}`
  const operationRef = db.doc(`bookingRequests/${operationId}`)
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex')
  return db.runTransaction(async transaction => {
    const actor = await context(db, transaction, uid, businessId)
    if (input.source === 'public' && actor.business.settings?.publicPageEnabled !== true) fail('permission-denied', 'La reserva pública está desactivada.')
    const previous = record(await transaction.get(operationRef))
    if (previous) {
      if (previous.fingerprint !== fingerprint) fail('already-exists', 'Esta solicitud ya se utilizó. Actualiza la página.')
      return previous.result
    }
    // All booking mutations in a business serialize on this document. Queries
    // alone cannot substitute an explicit conflict when an empty slot is booked.
    const lock = db.doc(`bookingLocks/${businessId}`)
    await transaction.get(lock)
    const now = Date.now()
    const stamp = Timestamp.fromMillis(now)
    const reminder = record(await transaction.get(db.doc(`reminderSettings/${businessId}`)))
    let ref, original
    if (action === 'create') ref = db.doc(`reservations/${operationId}`)
    else {
      if (!identifier(input.reservationId)) fail('invalid-argument', 'Reserva inválida.')
      ref = db.doc(`reservations/${input.reservationId}`)
      original = record(await transaction.get(ref))
      manage(actor, original)
      if ((original.revision || 0) !== input.revision) fail('aborted', 'La reserva cambió. Revisa los datos actualizados e inténtalo de nuevo.')
      if (!activeStates.includes(original.status)) fail('failed-precondition', 'Esta reserva ya no admite cambios.')
    }
    let update
    let client
    if (action === 'status') {
      const status = input.status
      if (actor.member.role === 'client') {
        if (status !== 'cancelled') fail('permission-denied', 'Solo puedes cancelar tus propias reservas.')
        clientDeadline(actor, original, now)
      }
      const allowed = original.status === 'pending' ? (now >= millis(original.endAt) ? ['completed', 'no_show', 'cancelled'] : ['confirmed', 'cancelled']) : ['completed', 'cancelled', 'no_show']
      if (!allowed.includes(status)) fail('failed-precondition', 'El cambio de estado no es válido.')
      if (status === 'completed' && now < millis(original.endAt)) fail('failed-precondition', 'La cita todavía no ha terminado.')
      if (status === 'no_show' && now < millis(original.startAt)) fail('failed-precondition', 'La cita todavía no ha comenzado.')
      if (status === 'confirmed' && now >= millis(original.endAt)) fail('failed-precondition', 'No se puede confirmar una cita que ya terminó.')
      update = { status, ...(status === 'cancelled' ? { cancellation: { byUserId: uid, at: stamp, reason: text(input.reason, 500) } } : {}) }
    } else {
      if (actor.member.role === 'professional' && !original) fail('permission-denied', 'Solo puedes reprogramar tus citas asignadas.')
      if (original) clientDeadline(actor, original, now)
      const serviceId = original?.serviceId || input.serviceId
      const professionalId = original?.professionalId || input.professionalId
      const selected = await selection(db, transaction, actor, serviceId, professionalId)
      const serviceQuote = quote(selected.service, actor.business.settings?.currencyCode)
      if (input.expectedPrice !== serviceQuote.price || input.expectedDuration !== serviceQuote.durationMinutes)
        fail('failed-precondition', 'El precio o la duración cambiaron. Consulta de nuevo la disponibilidad.')
      if (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isSafeInteger(input.startAt))
        fail('invalid-argument', 'Selecciona una fecha y una hora válidas.')
      const agenda = await calendar(db, transaction, businessId, professionalId)
      const slots = availableSlots({ business: actor.business, ...selected, ...agenda,
        reservations: agenda.reservations.filter(r => r.id !== original?.id), date: input.date, now })
      const slot = slots.find(s => s.start === input.startAt)
      if (!slot) fail('already-exists', 'Ese horario ya no está disponible. Selecciona otro.')
      if (!original) client = await bookingClient(db, transaction, actor, input, ref.id)
      update = {
        serviceId, professionalId, professionalUserId: selected.professional.userId,
        serviceName: selected.service.name, professionalName: selected.professional.displayName || 'Profesional', ...serviceQuote,
        startAt: Timestamp.fromMillis(slot.start), endAt: Timestamp.fromMillis(slot.end), timeZone: actor.business.settings?.timezone || 'America/La_Paz',
        status: actor.business.settings?.autoConfirmBookings === true ? 'confirmed' : 'pending',
        ...(original ? { rescheduledAt: stamp, rescheduleHistory: FieldValue.arrayUnion({ startAt: original.startAt, endAt: original.endAt, status: original.status, byUserId: uid, at: stamp }) } : { notes: text(input.notes, 1000) }),
      }
    }
    const revision = (original?.revision || 0) + 1
    const result = { id: ref.id, status: update.status, revision }
    if (client?.createManual) {
      transaction.create(db.doc(`clients/${client.clientId}`), { businessId, userId: null, firstName: client.clientName, lastName: '',
        email: client.clientEmail, phone: client.clientPhone, status: 'active', source: 'manual', createdAt: stamp, updatedAt: stamp })
      delete client.createManual
    }
    if (original) transaction.update(ref, { ...update, revision, updatedAt: stamp, updatedByUserId: uid })
    else transaction.create(ref, { ...update, ...client, id: ref.id, businessId, revision, code: ref.id,
      source: actor.member.role === 'admin' ? 'manual' : input.source === 'public' ? 'public' : 'client', createdByUserId: uid, createdAt: stamp, updatedAt: stamp })
    bookingNotices(db, transaction, { ...original, ...update, ...client, id: ref.id, businessId }, revision, action, reminder?.hours ?? 24, stamp, actor.business.ownerUserId)
    transaction.set(lock, { revision: FieldValue.increment(1), updatedAt: stamp }, { merge: true })
    transaction.create(operationRef, { businessId, userId: uid, fingerprint, result, createdAt: stamp })
    return result
  }, { maxAttempts: 8 })
}
