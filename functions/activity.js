import { FieldPath, Timestamp } from 'firebase-admin/firestore'
import { BookingError } from './bookingError.js'

const fail = (code, message) => { throw new BookingError(code, message) }
const validId = value => typeof value === 'string' && /^[^/\s]{1,200}$/.test(value)
const actions = new Set(['platformCreate', 'platformStatus', 'businessUpdate', 'membershipUpdate', 'superadmin_granted', 'superadmin_revoked'])
const roleNames = { admin: 'administrador', professional: 'profesional', client: 'cliente' }
const statusNames = { active: 'activo', inactive: 'inactivo', pending: 'pendiente', deleted: 'archivado' }
const normalizeName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')

async function count(query) {
  const snapshot = await query.count().get()
  return snapshot.data().count
}

function eventDescription(event) {
  if (event.action === 'platformCreate') return 'Negocio registrado en la plataforma.'
  if (event.action === 'platformStatus') return `Estado del negocio actualizado: ${statusNames[event.status] || 'actualizado'}.`
  if (event.action === 'businessUpdate') return event.beforeName && event.afterName && event.beforeName !== event.afterName
    ? 'Configuración del negocio modificada; se actualizó el nombre.'
    : 'Configuración del negocio modificada.'
  if (event.action === 'membershipUpdate') {
    const before = `${roleNames[event.beforeRole] || 'membresía'} ${statusNames[event.beforeStatus] || ''}`.trim()
    const after = `${roleNames[event.afterRole] || 'membresía'} ${statusNames[event.afterStatus] || ''}`.trim()
    return `Permisos administrativos actualizados: ${before} → ${after}.`
  }
  if (event.action === 'superadmin_granted') return 'Se otorgó acceso de superadministrador.'
  if (event.action === 'superadmin_revoked') return 'Se retiró acceso de superadministrador.'
  return 'Cambio administrativo registrado.'
}

export async function executePlatformActivity(db, uid, input) {
  if (!uid) fail('unauthenticated', 'Inicia sesión para continuar.')
  const actor = (await db.doc(`users/${uid}`).get()).data()
  if (actor?.status !== 'active' || actor.globalRole !== 'superadmin') fail('permission-denied', 'Solo el superadministrador puede consultar la actividad de plataforma.')

  const days = [7, 30, 90].includes(input.days) ? input.days : 30
  const search = typeof input.search === 'string' ? input.search.trim().slice(0, 120) : ''
  const businessId = input.businessId || ''
  const action = input.eventType || ''
  if (businessId && !validId(businessId)) fail('invalid-argument', 'Selecciona un negocio válido.')
  if (action && !actions.has(action)) fail('invalid-argument', 'Selecciona un tipo de evento válido.')
  const cursor = input.cursor
  if (cursor && (typeof cursor.name !== 'string' || !validId(cursor.id))) fail('invalid-argument', 'El cursor de negocios no es válido.')
  const eventCursor = input.eventCursor
  if (eventCursor && (!validId(eventCursor.id) || !Number.isFinite(eventCursor.createdAt))) fail('invalid-argument', 'El cursor de eventos no es válido.')

  const now = new Date(), sinceDate = new Date(now.getTime() - days * 86400000), previousStartDate = new Date(now.getTime() - 2 * days * 86400000)
  const since = Timestamp.fromDate(sinceDate), previousStart = Timestamp.fromDate(previousStartDate), nowStamp = Timestamp.fromDate(now)
  const reservations = db.collection('reservations')
  const businessesCollection = db.collection('businesses')
  let businessDocs = [], hasMoreBusinesses = false, nextCursor = null
  if (businessId) {
    const snapshot = await db.doc(`businesses/${businessId}`).get()
    if (snapshot.exists && snapshot.data().status !== 'deleted') businessDocs = [snapshot]
  } else if (search) {
    const matches = []
    let scanCursor = cursor, scanned = 0, scanHasMore = false
    while (matches.length < 11 && scanned < 500) {
      let businessesQuery = businessesCollection.orderBy('name').orderBy(FieldPath.documentId())
      if (scanCursor) businessesQuery = businessesQuery.startAfter(scanCursor.name, scanCursor.id)
      const snapshot = await businessesQuery.limit(100).get()
      if (!snapshot.docs.length) break
      for (const item of snapshot.docs) {
        scanned++
        const data = item.data()
        scanCursor = { name: data.name || '', id: item.id }
        if (data.status !== 'deleted' && normalizeName(data.name || item.id).includes(normalizeName(search))) matches.push(item)
        if (matches.length === 11 || scanned >= 500) break
      }
      if (matches.length === 11) { scanHasMore = true; break }
      if (snapshot.docs.length < 100 || scanned >= 500) {
        scanHasMore = snapshot.docs.length === 100 || scanned >= 500
        break
      }
    }
    hasMoreBusinesses = scanHasMore || matches.length > 10
    businessDocs = matches.slice(0, 10)
    nextCursor = hasMoreBusinesses ? (matches.length > 10
      ? { name: matches[9].data().name || '', id: matches[9].id }
      : scanCursor) : null
  } else {
    let businessesQuery = businessesCollection.orderBy('name').orderBy(FieldPath.documentId())
    if (cursor) businessesQuery = businessesQuery.startAfter(cursor.name, cursor.id)
    const snapshot = await businessesQuery.limit(11).get()
    const raw = snapshot.docs
    hasMoreBusinesses = raw.length > 10
    const visible = raw.slice(0, 10)
    businessDocs = visible.filter(item => item.data().status !== 'deleted')
    const last = visible.at(-1)
    nextCursor = hasMoreBusinesses && last ? { name: last.data().name || '', id: last.id } : null
  }

  const pageBusinesses = businessDocs.map(item => ({ id: item.id, name: item.data().name || item.id, status: item.data().status || 'unknown' }))
  const businessRows = await Promise.all(businessDocs.map(async snapshot => {
    const bid = snapshot.id
    const scoped = reservations.where('businessId', '==', bid)
    const [current, previous, last] = await Promise.all([
      count(scoped.where('createdAt', '>=', since).where('createdAt', '<=', nowStamp)),
      count(scoped.where('createdAt', '>=', previousStart).where('createdAt', '<', since)),
      scoped.where('createdAt', '<=', nowStamp).orderBy('createdAt', 'desc').select('createdAt').limit(1).get(),
    ])
    const lastDate = last.empty ? null : last.docs[0].get('createdAt')?.toMillis?.() ?? null
    return { ...pageBusinesses.find(item => item.id === bid), reservations: current, previousReservations: previous,
      lastReservationAt: lastDate, changePercent: previous ? Math.round((current - previous) / previous * 100) : null,
      isNewActivity: current > 0 && previous === 0 }
  }))

  let eventsQuery = db.collection('auditLogs').where('createdAt', '>=', since).where('createdAt', '<=', nowStamp)
  let eventCountQuery = db.collection('auditLogs').where('createdAt', '>=', since).where('createdAt', '<=', nowStamp)
  if (businessId) {
    eventsQuery = eventsQuery.where('businessId', '==', businessId)
    eventCountQuery = eventCountQuery.where('businessId', '==', businessId)
  }
  if (action) {
    eventsQuery = eventsQuery.where('action', '==', action)
    eventCountQuery = eventCountQuery.where('action', '==', action)
  }
  const totalEventsPromise = count(eventCountQuery)
  eventsQuery = eventsQuery.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(21)
  if (eventCursor) eventsQuery = eventsQuery.startAfter(Timestamp.fromMillis(eventCursor.createdAt), eventCursor.id)
  const [totalReservations, totalEvents, eventSnapshot] = await Promise.all([
    count((businessId ? reservations.where('businessId', '==', businessId) : reservations).where('createdAt', '>=', since).where('createdAt', '<=', nowStamp)),
    totalEventsPromise,
    eventsQuery.select('businessId', 'action', 'createdAt', 'status', 'beforeRole', 'afterRole', 'beforeStatus', 'afterStatus', 'beforeName', 'afterName').get(),
  ])
  const rawEvents = eventSnapshot.docs.slice(0, 20)
  const eventHasMore = eventSnapshot.docs.length > 20
  const businessIds = [...new Set(rawEvents.map(doc => doc.get('businessId')).filter(Boolean))]
  const nameSnapshots = businessIds.length ? await db.getAll(...businessIds.map(id => db.doc(`businesses/${id}`))) : []
  const businessNames = new Map(nameSnapshots.filter(item => item.exists).map(item => [item.id, item.data().name || item.id]))
  const events = rawEvents.map(doc => {
    const event = doc.data()
    const createdAt = event.createdAt?.toMillis?.() ?? null
    return { id: doc.id, businessId: event.businessId || '', businessName: businessNames.get(event.businessId) || 'Negocio no disponible',
      action: event.action || '', createdAt, description: eventDescription(event) }
  })
  const lastEvent = rawEvents.at(-1)
  const nextEventCursor = eventHasMore && lastEvent ? { createdAt: lastEvent.get('createdAt').toMillis(), id: lastEvent.id } : null
  return { days, since: sinceDate.getTime(), totalReservations, totalEvents, businesses: businessRows,
    hasMoreBusinesses, nextCursor, events, eventHasMore, nextEventCursor }
}
