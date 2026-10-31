import { Timestamp } from 'firebase-admin/firestore'
import { createHash } from 'node:crypto'
import { BookingError } from './bookingError.js'

const fail = (code, message) => { throw new BookingError(code, message) }
const id = value => typeof value === 'string' && /^[^/\s]{1,200}$/.test(value)
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const fullName = user => [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
const record = snap => snap.exists ? { ...snap.data(), id: snap.id } : null
const rows = snap => {
  if (snap.size > 2000) fail('resource-exhausted', 'Demasiados resultados. Reduce el rango o contacta al administrador.')
  return snap.docs.map(record)
}
const ms = value => value?.toMillis?.() ?? value
const serial = value => value instanceof Timestamp ? value.toMillis() : Array.isArray(value) ? value.map(serial) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serial(v)])) : value
const scoped = (db, collection, businessId) => db.collection(collection).where('businessId', '==', businessId).limit(2001)
const clientContact = client => ({
  id: client.id,
  firstName: text(client.firstName, 100),
  lastName: text(client.lastName, 100),
  phone: text(client.phone, 30),
  email: text(client.email, 254),
  ...(typeof client.status === 'string' ? { status: client.status } : {}),
  ...(typeof client.isActive === 'boolean' ? { isActive: client.isActive } : {}),
  ...(client.createdAt ? { createdAt: client.createdAt } : {}),
})
export const engagementActions = ['hub', 'waitlist', 'favorite', 'wait', 'unwait', 'review', 'clients', 'clientHistory', 'clientUpdate', 'promotionSave', 'promotionServiceStatus', 'reminderSave', 'notificationRead', 'notificationReadAll']

function syncPromotionNotices(db, tx, businessId, promotion, service, adminIds, noticeDocs, now, stamp) {
  const promotionId = promotion.id
  const startAt = ms(promotion.startAt), endAt = ms(promotion.endAt)
  const title = text(promotion.title, 100) || 'Promoción'
  const serviceName = text(service.name, 100) || 'el servicio'
  const existing = new Map(noticeDocs.filter(item => item.data().businessId === businessId)
    .map(item => [item.id, { ref: item.ref, ...item.data() }]))
  const desired = new Map()
  if (promotion.isActive === true && service.isActive === true && endAt > now && endAt > startAt) {
    for (const recipientUserId of adminIds) {
      const events = [
        { name: 'promotionStarted', eventAt: startAt, visibleAt: Math.max(startAt, now), title: 'Promoción iniciada',
          message: `La promoción «${title}» ya está vigente para el servicio «${serviceName}».` },
        { name: 'promotionEnded', eventAt: endAt - 1, visibleAt: endAt, title: 'Promoción finalizada',
          message: `La promoción «${title}» para el servicio «${serviceName}» terminó. Su descuento ya no se aplica a nuevas reservas.` },
      ]
      for (const event of events) {
        const noticeId = createHash('sha256').update(`${businessId}:${promotionId}:${event.name}:${event.eventAt}:${recipientUserId}`).digest('hex')
        desired.set(noticeId, { ...event, recipientUserId })
      }
    }
  }
  const invalidations = [...existing].filter(([noticeId, item]) => !desired.has(noticeId) && item.invalidated !== true && ms(item.visibleAt) > now)
  if (desired.size + invalidations.length > 499) fail('resource-exhausted', 'Demasiados administradores o avisos pendientes para actualizar esta promoción en una sola operación.')
  let writes = 0
  for (const [noticeId, event] of desired) {
    const item = existing.get(noticeId)
    if (item && item.visibleAt && ms(item.visibleAt) <= now && item.invalidated !== true) continue
    tx.set(db.doc(`notifications/${noticeId}`), {
      ...(item?.createdAt ? {} : { createdAt: stamp }),
      businessId, recipientUserId: event.recipientUserId, type: 'promotion', event: event.name,
      promotionId, promotionTitle: title, serviceName, title: event.title, message: event.message,
      promotionEventAt: Timestamp.fromMillis(event.eventAt), visibleAt: Timestamp.fromMillis(event.visibleAt),
      read: item?.read === true, invalidated: false,
    }, { merge: true })
    writes++
  }
  for (const [, item] of invalidations) { tx.set(item.ref, { invalidated: true, invalidatedAt: stamp }, { merge: true }); writes++ }
  return writes
}

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
  if (action === 'waitlist') {
    if (!['admin', 'professional'].includes(actor.member.role)) fail('permission-denied', 'Esta lista es solo para el equipo del negocio.')
    const [entries, professionals, business] = await Promise.all([
      scoped(db, 'waitingList', businessId).get().then(rows),
      actor.member.role === 'professional'
        ? scoped(db, 'professionals', businessId).where('userId', '==', uid).get().then(rows)
        : Promise.resolve([]),
      db.doc(`businesses/${businessId}`).get().then(record),
    ])
    const visibleEntries = actor.member.role === 'admin'
      ? entries
      : entries.filter(entry => professionals.some(profile => profile.id === entry.professionalId))
    let businessTimeZone = business?.settings?.timezone || 'America/La_Paz'
    try { new Intl.DateTimeFormat('es-BO', { timeZone: businessTimeZone }) }
    catch { businessTimeZone = 'America/La_Paz' }
    const clientIds = [...new Set(visibleEntries.map(entry => entry.userId))]
    const [clients, users] = await Promise.all([
      Promise.all(clientIds.map(userId => scoped(db, 'clients', businessId).where('userId', '==', userId).limit(1).get().then(snapshot => snapshot.docs[0] ? record(snapshot.docs[0]) : null))),
      Promise.all(clientIds.map(userId => db.doc(`users/${userId}`).get().then(record))),
    ])
    const clientById = new Map(clientIds.map((userId, index) => [userId, { client: clients[index], user: users[index] }]))
    return serial(visibleEntries
      .map(entry => {
        const { client, user } = clientById.get(entry.userId) || {}
        return {
          ...entry,
          businessTimeZone,
          clientName: fullName(client || {}) || fullName(user || {}) || user?.email || 'Cliente',
          clientPhone: client?.phone || user?.phone || '',
          clientEmail: client?.email || user?.email || '',
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date) || ms(b.createdAt) - ms(a.createdAt)))
  }
  if (action === 'hub') {
    const [favorites, waiting, notifications, promotions, reviews, reminder] = await Promise.all([
      own('favorites').get().then(rows), own('waitingList').get().then(rows),
      scoped(db, 'notifications', businessId).where('recipientUserId', '==', uid).get().then(rows),
      scoped(db, 'promotions', businessId).get().then(rows),
      scoped(db, 'reviews', businessId).get().then(rows), db.doc(`reminderSettings/${businessId}`).get(),
    ])
    return serial({ favorites, waiting, notifications: notifications.filter(n => n.invalidated !== true && ms(n.visibleAt) <= Date.now() && (!n.expiresAt || ms(n.expiresAt) > Date.now())).sort((a, b) => ms(b.visibleAt) - ms(a.visibleAt)),
      promotions: actor.member.role === 'admin' ? promotions : promotions.filter(p => p.isActive && ms(p.startAt) <= Date.now() && ms(p.endAt) > Date.now()),
      reviews: reviews.filter(r => r.status === 'published').map(r => ({ id: r.id, serviceId: r.serviceId || null, professionalId: r.professionalId || null, professionalName: r.professionalName || null, professionalRating: r.professionalRating || null, rating: r.rating, comment: r.comment, authorName: r.authorName, serviceName: r.serviceName, reviewedAt: Number.isFinite(ms(r.updatedAt || r.createdAt)) ? ms(r.updatedAt || r.createdAt) : null })), reminderHours: reminder.data()?.hours ?? 24 })
  }
  if (action === 'notificationRead') {
    if (!id(input.id)) fail('invalid-argument', 'Aviso inválido.')
    const ref = db.doc(`notifications/${input.id}`)
    await db.runTransaction(async tx => {
      const value = record(await tx.get(ref))
      if (!value || value.recipientUserId !== uid || (actor.isSuperadmin
        ? value.type !== 'platform'
        : value.businessId !== businessId)) fail('permission-denied', 'Aviso no disponible.')
      tx.update(ref, { read: true, readAt: stamp })
    })
    return { ok: true }
  }
  if (action === 'notificationReadAll') {
    const source = actor.isSuperadmin
      ? db.collection('notifications').where('recipientUserId', '==', uid).where('type', '==', 'platform')
      : scoped(db, 'notifications', businessId).where('recipientUserId', '==', uid)
    const snapshot = await source.limit(2001).get()
    if (snapshot.size > 2000) fail('resource-exhausted', 'Hay demasiados avisos para marcar en una sola operación.')
    const unread = snapshot.docs.filter(item => item.data().read !== true && item.data().invalidated !== true)
    for (let offset = 0; offset < unread.length; offset += 450) {
      const batch = db.batch()
      for (const item of unread.slice(offset, offset + 450)) batch.update(item.ref, { read: true, readAt: stamp })
      await batch.commit()
    }
    return { ok: true, updated: unread.length }
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
    const professionalId = input.professionalId === 'none' || input.professionalId === '' || input.professionalId == null ? null : input.professionalId
    if (!id(input.serviceId) || (professionalId && !id(professionalId)) || !/^\d{4}-\d{2}-\d{2}$/.test(input.date || '')) fail('invalid-argument', 'Selecciona servicio y fecha válidos.')
    const normalizedDate = new Date(`${input.date}T12:00:00Z`)
    if (Number.isNaN(normalizedDate.getTime()) || normalizedDate.toISOString().slice(0, 10) !== input.date) fail('invalid-argument', 'Selecciona una fecha válida.')
    const key = createHash('sha256').update(`${businessId}:${uid}:${input.serviceId}:${professionalId || 'none'}:${input.date}`).digest('hex')
    const ref = db.doc(`waitingList/${key}`)
    if (action === 'unwait') { await ref.delete(); return { ok: true } }
    const zone = actor.business.settings?.timezone || 'America/La_Paz'
    let today
    try {
      today = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now())
    } catch {
      fail('failed-precondition', 'La zona horaria del negocio no es válida. Contacta al administrador.')
    }
    const requestedDay = Date.parse(`${input.date}T00:00:00Z`)
    const todayDay = Date.parse(`${today}T00:00:00Z`)
    if (input.date <= today || requestedDay > todayDay + 366 * 86400000) fail('invalid-argument', 'Selecciona una fecha futura dentro del próximo año.')
    const serviceRef = db.doc(`services/${input.serviceId}`)
    const professionalRef = professionalId ? db.doc(`professionals/${professionalId}`) : null
    const membersQuery = scoped(db, 'memberships', businessId)
    await db.runTransaction(async tx => {
      const existing = record(await tx.get(ref))
      if (existing) {
        if (existing.userId !== uid || existing.businessId !== businessId) fail('permission-denied', 'Solicitud no disponible.')
        return
      }
      const [service, professional, members] = await Promise.all([
        tx.get(serviceRef).then(record),
        professionalRef ? tx.get(professionalRef).then(record) : Promise.resolve(null),
        tx.get(membersQuery),
      ])
      if (members.size > 2000) fail('resource-exhausted', 'Demasiados miembros para notificar esta solicitud. Contacta al administrador.')
      if (service?.businessId !== businessId || !service.isActive || !service.isPublic) fail('failed-precondition', 'El servicio no está disponible.')
      if (professionalId && (professional?.businessId !== businessId || !professional.isActive || !professional.serviceIds?.includes(input.serviceId) || !id(professional.userId))) fail('failed-precondition', 'El profesional no está disponible para este servicio.')
      const adminIds = members.docs
        .map(doc => record(doc))
        .filter(member => member.role === 'admin' && member.status === 'active' && id(member.userId))
        .map(member => member.userId)
      const adminUsers = await Promise.all([...new Set(adminIds)].map(userId => tx.get(db.doc(`users/${userId}`)).then(record)))
      const recipientIds = new Set(adminUsers.filter(user => user?.status === 'active').map(user => user.id))
      if (professionalId) {
        const [professionalMember, professionalUser] = await Promise.all([
          tx.get(db.doc(`memberships/${businessId}_${professional.userId}`)).then(record),
          tx.get(db.doc(`users/${professional.userId}`)).then(record),
        ])
        if (professionalMember?.role !== 'professional' || professionalMember.status !== 'active' || professionalUser?.status !== 'active') fail('failed-precondition', 'El profesional no tiene una cuenta activa.')
        recipientIds.add(professional.userId)
      }
      recipientIds.delete(uid)
      const clientName = fullName(actor.user) || 'Un cliente'
      const professionalName = professional?.displayName || (professionalId ? 'Profesional' : 'Sin preferencia')
      const dateLabel = new Intl.DateTimeFormat('es-BO', { dateStyle: 'long', timeZone: 'UTC' }).format(normalizedDate)
      tx.create(ref, {
        businessId, userId: uid, serviceId: input.serviceId, professionalId, date: input.date,
        serviceName: service.name, professionalName, createdAt: stamp,
      })
      for (const recipientUserId of recipientIds) {
        const notificationId = createHash('sha256').update(`${businessId}:${key}:${recipientUserId}`).digest('hex')
        tx.create(db.doc(`notifications/${notificationId}`), {
          businessId, recipientUserId, waitlistId: key, serviceId: input.serviceId,
          serviceName: service.name, professionalId, professionalName,
          clientName, date: input.date, type: 'waitlist',
          title: 'Nueva solicitud de lista de espera',
          message: `${clientName} registró interés en «${service.name}» para el ${dateLabel}${professionalId ? ` con ${professionalName}` : ''}.`,
          visibleAt: stamp, createdAt: stamp, read: false,
        })
      }
    })
    return { ok: true }
  }
  if (action === 'review') {
    client()
    if (!id(input.reservationId) || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5 || !text(input.comment, 1000)) fail('invalid-argument', 'Indica una valoración de 1 a 5 y un comentario.')
    const professionalRating = input.professionalRating ?? input.rating
    if (!Number.isInteger(professionalRating) || professionalRating < 1 || professionalRating > 5) fail('invalid-argument', 'Califica al profesional de 1 a 5.')
    const ref = db.doc(`reviews/${input.reservationId}`)
    await db.runTransaction(async tx => {
      const r = record(await tx.get(db.doc(`reservations/${input.reservationId}`)))
      if (r?.businessId !== businessId || r.clientUserId !== uid || r.status !== 'completed') fail('permission-denied', 'Solo puedes valorar una cita propia finalizada.')
      tx.set(ref, { businessId, clientUserId: uid, reservationId: r.id, serviceId: r.serviceId, serviceName: r.serviceName, professionalId: r.professionalId || null, professionalName: r.professionalName || null, professionalRating, rating: input.rating, comment: text(input.comment, 1000), authorName: actor.user.firstName || 'Cliente', status: 'published', isPublic: true, updatedAt: stamp })
    })
    return { ok: true }
  }
  if (action === 'clients') {
    if (actor.isSuperadmin) {
      const [clients, businesses] = await Promise.all([
        db.collection('clients').count().get(),
        db.collection('businesses').count().get(),
      ])
      return { summaryOnly: true, totalClients: clients.data().count, totalBusinesses: businesses.data().count }
    }
    if (actor.member.role === 'admin') {
      const clients = await scoped(db, 'clients', businessId).get().then(rows)
      return serial({ clients: clients.map(clientContact), summaryOnly: false })
    }
    if (actor.member.role !== 'professional') fail('permission-denied', 'Esta consulta requiere una cuenta del equipo del negocio.')
    const appointments = await scoped(db, 'reservations', businessId).where('professionalUserId', '==', uid).get().then(rows)
    const clientIds = [...new Set(appointments.map(appointment => appointment.clientId).filter(id))]
    const clients = await Promise.all(clientIds.map(async clientId => {
      const client = record(await db.doc(`clients/${clientId}`).get())
      const appointment = appointments.find(item => item.clientId === clientId)
      return client?.businessId === businessId
        ? clientContact(client)
        : clientContact({ id: clientId, firstName: appointment?.clientName, email: appointment?.clientEmail, phone: appointment?.clientPhone })
    }))
    return serial({ clients, summaryOnly: false })
  }
  if (action === 'clientHistory') {
    if (!id(input.clientId)) fail('invalid-argument', 'Selecciona un cliente válido.')
    if (actor.isSuperadmin) fail('permission-denied', 'El resumen global no incluye historiales personales.')
    if (!['admin', 'professional'].includes(actor.member.role)) fail('permission-denied', 'Esta consulta requiere una cuenta del equipo del negocio.')
    const client = record(await db.doc(`clients/${input.clientId}`).get())
    if (!client || client.businessId !== businessId) fail('permission-denied', 'El cliente no pertenece a este negocio.')
    let query = scoped(db, 'reservations', businessId).where('clientId', '==', input.clientId)
    if (actor.member.role === 'professional') query = query.where('professionalUserId', '==', uid)
    const appointments = await query.get().then(rows)
    if (actor.member.role === 'professional' && appointments.length === 0) fail('permission-denied', 'Este cliente no tiene citas asignadas contigo.')
    const history = appointments
      .sort((a, b) => ms(b.startAt) - ms(a.startAt))
      .map(appointment => ({
        id: appointment.id,
        clientId: appointment.clientId,
        serviceName: text(appointment.serviceName, 200),
        professionalName: text(appointment.professionalName, 200),
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        timeZone: text(appointment.timeZone, 100),
        status: text(appointment.status, 40),
      }))
    return serial({ history })
  }
  if (action === 'clientUpdate') {
    if (actor.isSuperadmin) fail('permission-denied', 'El resumen global no permite editar datos personales de clientes.')
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
    if (actor.isSuperadmin) fail('permission-denied', 'El superadministrador no puede modificar recordatorios de un negocio.')
    admin()
    if (!Number.isInteger(input.hours) || input.hours < 1 || input.hours > 168) fail('invalid-argument', 'La anticipación debe ser de 1 a 168 horas.')
    // Recalculate existing scheduled reminders as well as new bookings.
    const reservations = rows(await scoped(db, 'reservations', businessId).get())
    await db.doc(`reminderSettings/${businessId}`).set({ businessId, hours: input.hours, updatedAt: stamp })
    for (const r of reservations) if (r.clientUserId && ['pending', 'confirmed'].includes(r.status) && ms(r.startAt) > Date.now()) await db.runTransaction(async tx => {
      const [fresh, settings] = await Promise.all([tx.get(db.doc(`reservations/${r.id}`)).then(record), tx.get(db.doc(`reminderSettings/${businessId}`)).then(record)])
      if (fresh && ['pending', 'confirmed'].includes(fresh.status) && ms(fresh.startAt) > Date.now()) scheduleReminders(db, tx, fresh, settings.hours, stamp)
    })
    return { ok: true }
  }
  if (action === 'promotionSave') {
    if (actor.isSuperadmin) fail('permission-denied', 'El superadministrador no puede administrar promociones de un negocio.')
    admin()
    if (!id(input.serviceId) || !id(input.id) || !text(input.title, 100) || !Number.isInteger(input.percent) || input.percent < 1 || input.percent > 90 || !Number.isSafeInteger(input.startAt) || !Number.isSafeInteger(input.endAt) || input.endAt <= input.startAt || typeof input.isActive !== 'boolean') fail('invalid-argument', 'Completa la promoción: descuento de 1 a 90 % y fechas válidas.')
    await db.runTransaction(async tx => {
      const ref = db.doc(`promotions/${input.id}`)
      const noticeQuery = db.collection('notifications').where('promotionId', '==', input.id).limit(501)
      const membersQuery = db.collection('memberships').where('businessId', '==', businessId).limit(2001)
      const [previous, service, members, previousNotices] = await Promise.all([
        tx.get(ref).then(record), tx.get(db.doc(`services/${input.serviceId}`)).then(record),
        tx.get(membersQuery), tx.get(noticeQuery),
      ])
      if ((previous && previous.businessId !== businessId) || service?.businessId !== businessId) fail('permission-denied', 'La promoción o servicio pertenece a otro negocio.')
      if (members.size > 2000 || previousNotices.size > 500) fail('resource-exhausted', 'No se pudieron programar los avisos de esta promoción. Contacta al administrador.')
      const adminIds = [...new Set(members.docs.map(item => record(item))
        .filter(member => member.role === 'admin' && member.status === 'active' && id(member.userId))
        .map(member => member.userId))]
      const activeAdmins = (await Promise.all(adminIds.map(userId => tx.get(db.doc(`users/${userId}`)).then(record))))
        .filter(user => user?.status === 'active').map(user => user.id)
      const now = Date.now()
      const promotion = { ...input, businessId, id: input.id, title: text(input.title, 100),
        serviceName: service.name, startAt: Timestamp.fromMillis(input.startAt), endAt: Timestamp.fromMillis(input.endAt) }
      syncPromotionNotices(db, tx, businessId, promotion, service, activeAdmins, previousNotices.docs, now, stamp)
      tx.set(ref, { businessId, serviceId: input.serviceId, serviceName: service.name, title: text(input.title, 100), percent: input.percent, startAt: Timestamp.fromMillis(input.startAt), endAt: Timestamp.fromMillis(input.endAt), isActive: input.isActive, updatedAt: stamp })
    })
    return { ok: true }
  }
  if (action === 'promotionServiceStatus') {
    if (actor.isSuperadmin) fail('permission-denied', 'El superadministrador no puede modificar servicios de un negocio.')
    admin()
    if (!id(input.serviceId) || typeof input.isActive !== 'boolean') fail('invalid-argument', 'Servicio inválido.')
    await db.runTransaction(async tx => {
      const serviceRef = db.doc(`services/${input.serviceId}`)
      const promotionQuery = db.collection('promotions').where('serviceId', '==', input.serviceId).limit(101)
      const membersQuery = db.collection('memberships').where('businessId', '==', businessId).limit(2001)
      const [service, promotions, members] = await Promise.all([
        tx.get(serviceRef).then(record), tx.get(promotionQuery), tx.get(membersQuery),
      ])
      if (service?.businessId !== businessId) fail('permission-denied', 'El servicio pertenece a otro negocio.')
      if (promotions.size > 100 || members.size > 2000) fail('resource-exhausted', 'No se pudieron actualizar los avisos de este servicio. Contacta al administrador.')
      const scopedPromotions = promotions.docs.map(record).filter(promotion => promotion.businessId === businessId)
      const noticeSnapshots = await Promise.all(scopedPromotions.map(promotion =>
        tx.get(db.collection('notifications').where('promotionId', '==', promotion.id).limit(501))))
      if (noticeSnapshots.some(snapshot => snapshot.size > 500)) fail('resource-exhausted', 'Hay demasiados avisos relacionados con este servicio. Contacta al administrador.')
      const adminIds = [...new Set(members.docs.map(record)
        .filter(member => member.role === 'admin' && member.status === 'active' && id(member.userId))
        .map(member => member.userId))]
      const activeAdmins = (await Promise.all(adminIds.map(userId => tx.get(db.doc(`users/${userId}`)).then(record))))
        .filter(user => user?.status === 'active').map(user => user.id)
      const now = Date.now()
      const updatedService = { ...service, isActive: input.isActive }
      let noticeWrites = 0
      for (let index = 0; index < scopedPromotions.length; index++)
        noticeWrites += syncPromotionNotices(db, tx, businessId, scopedPromotions[index], updatedService, activeAdmins, noticeSnapshots[index].docs, now, stamp)
      if (noticeWrites + 1 > 500) fail('resource-exhausted', 'Hay demasiados avisos pendientes para cambiar el estado de este servicio en una sola operación.')
      tx.set(serviceRef, { isActive: input.isActive, updatedAt: stamp }, { merge: true })
    })
    return { ok: true }
  }
  fail('invalid-argument', 'Operación inválida.')
}

export function reminderFor(r, hours, stamp) {
  return { businessId: r.businessId, recipientUserId: r.clientUserId, reservationId: r.id, type: 'reminder', title: `Recordatorio: ${r.serviceName}`, message: hours === 1 ? 'Tu cita es en menos de una hora. Consulta el detalle.' : `Tu cita se aproxima: recordatorio de ${hours} horas. Consulta el detalle.`, serviceName: r.serviceName || '', professionalName: r.professionalName || '', appointmentStartAt: r.startAt, visibleAt: Timestamp.fromMillis(Math.max(stamp.toMillis(), ms(r.startAt) - hours * 3600000)), expiresAt: r.startAt, read: false, createdAt: stamp }
}

export function bookingNotices(db, tx, reservation, revision, action, hours, stamp, ownerId) {
  const labels = { pending: 'pendiente', confirmed: 'confirmada', cancelled: 'cancelada', completed: 'finalizada', no_show: 'no asistida' }
  for (const recipientUserId of new Set([reservation.clientUserId, reservation.professionalUserId, ownerId].filter(Boolean))) {
    tx.set(db.doc(`notifications/${reservation.id}_${revision}_${recipientUserId}`), { businessId: reservation.businessId, recipientUserId, reservationId: reservation.id, type: 'change', title: action === 'reschedule' ? 'Cita reprogramada' : `Cita ${labels[reservation.status]}`, message: `${reservation.serviceName} · ${reservation.professionalName}`, serviceName: reservation.serviceName || '', professionalName: reservation.professionalName || '', appointmentStartAt: reservation.startAt, status: reservation.status, read: false, visibleAt: stamp, createdAt: stamp })
  }
  scheduleReminders(db, tx, reservation, hours, stamp)
}

export function scheduleReminders(db, tx, reservation, hours, stamp) {
  const active = reservation.clientUserId && ['pending', 'confirmed'].includes(reservation.status) && ms(reservation.startAt) > stamp.toMillis()
  for (const [suffix, anticipation] of [['', hours], ['_24h', 24], ['_1h', 1]]) {
    const ref = db.doc(`notifications/reminder_${reservation.id}${suffix}`)
    if (active && (!suffix || anticipation !== hours)) tx.set(ref, reminderFor(reservation, anticipation, stamp))
    else tx.delete(ref)
  }
}
