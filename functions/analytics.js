import { Timestamp } from 'firebase-admin/firestore'
import { BookingError } from './bookingError.js'

const fail = (code, message) => { throw new BookingError(code, message) }
const validId = value => typeof value === 'string' && /^[^/\s]{1,200}$/.test(value)
const statuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show']

async function count(query) {
  const result = await query.count().get()
  return result.data().count
}

export async function executePlatformAnalytics(db, uid, input) {
  if (!uid) fail('unauthenticated', 'Inicia sesión para continuar.')
  if (!validId(input.businessId)) fail('invalid-argument', 'Selecciona un negocio válido.')
  const actor = (await db.doc(`users/${uid}`).get()).data()
  if (actor?.status !== 'active' || actor.globalRole !== 'superadmin') fail('permission-denied', 'Solo el superadministrador puede consultar estas métricas.')
  const businessRef = db.doc(`businesses/${input.businessId}`)
  const businessSnapshot = await businessRef.get()
  if (!businessSnapshot.exists || businessSnapshot.data().status === 'deleted') fail('not-found', 'El negocio no está disponible.')
  const business = businessSnapshot.data()
  const range = [30, 90, 180, 365].includes(input.range) ? input.range : 90
  const now = new Date()
  const rangeStart = new Date(now.getTime() - range * 86400000)
  const start = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
  const buckets = Array.from({ length: (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth() + 1 }, (_, i) => {
    const from = new Date(start.getFullYear(), start.getMonth() + i, 1)
    const until = new Date(from.getFullYear(), from.getMonth() + 1, 1)
    return { from: from < rangeStart ? rangeStart : from, to: until > now ? now : until,
      label: new Intl.DateTimeFormat('es-BO', { month: 'short', year: '2-digit' }).format(from).replace('.', '') }
  })
  const scoped = name => db.collection(name).where('businessId', '==', input.businessId)
  const reservations = scoped('reservations').where('createdAt', '>=', Timestamp.fromDate(rangeStart))
  const members = scoped('memberships')
  const [clients, professionals, activeProfessionals, services, activeServices, admins, activeAdmins,
    activePromotions, reservationCount, statusCounts, months, recentActivity] = await Promise.all([
    count(scoped('clients')),
    count(scoped('professionals')),
    count(scoped('professionals').where('isActive', '==', true)),
    count(scoped('services')),
    count(scoped('services').where('isActive', '==', true)),
    count(members.where('role', '==', 'admin')),
    count(members.where('role', '==', 'admin').where('status', '==', 'active')),
    count(scoped('promotions').where('isActive', '==', true).where('startAt', '<=', Timestamp.fromDate(now)).where('endAt', '>', Timestamp.fromDate(now)).orderBy('startAt').orderBy('endAt')),
    count(reservations),
    Promise.all(statuses.map(status => count(reservations.where('status', '==', status)))),
    Promise.all(buckets.map(bucket => count(scoped('reservations').where('createdAt', '>=', Timestamp.fromDate(bucket.from)).where('createdAt', '<', Timestamp.fromDate(bucket.to))))),
    count(scoped('reservations').where('createdAt', '>=', Timestamp.fromDate(new Date(now.getTime() - 7 * 86400000)))),
  ])
  return { business: { id: input.businessId, name: business.name || input.businessId, status: business.status || 'unknown' },
    range, clients, professionals, activeProfessionals, services, activeServices, admins, activeAdmins, activePromotions,
    reservations: reservationCount, statuses: statuses.map((status, i) => ({ status, value: statusCounts[i] })),
    months: buckets.map((bucket, i) => ({ label: bucket.label, value: months[i] })), recentActivity }
}
