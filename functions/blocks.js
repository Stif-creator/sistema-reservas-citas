import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { createHash } from 'node:crypto'
import { BookingError } from './bookingError.js'
import { businessDate } from './shared/hours.js'

const fail = (code, message) => { throw new BookingError(code, message) }
const record = s => s.exists ? { ...s.data(), id: s.id } : null
const ms = v => v?.toMillis?.() ?? Number(v)
const isCalendarDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T12:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
const nextCalendarDate = value => {
  const date = new Date(`${value}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}
const rows = s => {
  if (s.size > 2000) fail('resource-exhausted', 'Demasiados registros para validar el bloqueo.')
  return s.docs.map(record)
}
export async function executeBlocks(db, uid, input, context) {
  const { action, businessId, requestId } = input
  if (typeof requestId !== 'string' || !/^[\w-]{16,80}$/.test(requestId)) fail('invalid-argument', 'Solicitud inválida.')
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex')
  return db.runTransaction(async tx => {
    const actor = await context(db, tx, uid, businessId)
    const admin = actor.member.role === 'admin'
    if (!admin && actor.member.role !== 'professional') fail('permission-denied', 'No puedes gestionar bloqueos.')
    const operation = db.doc(`bookingRequests/${uid}_${requestId}`)
    const previous = record(await tx.get(operation))
    if (previous) {
      if (previous.fingerprint !== fingerprint) fail('already-exists', 'Identificador de solicitud ya utilizado.')
      return previous.result
    }
    const lock = db.doc(`bookingLocks/${businessId}`)
    await tx.get(lock)
    const scoped = name => db.collection(name).where('businessId', '==', businessId).limit(2001)
    const stamp = Timestamp.now()
    let block, ref
    if (action === 'blockCreate') {
      if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120 || !['meeting', 'vacation', 'personal', 'other'].includes(input.reason)) fail('invalid-argument', 'Revisa el título y motivo.')
      const zone = actor.business.settings?.timezone || 'America/La_Paz'
      const mode = input.mode ?? 'legacy'
      let start, end
      try {
        if (mode === 'specificHours') {
          if (!isCalendarDate(input.date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.startTime) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.endTime) || input.endTime <= input.startTime) fail('invalid-argument', 'Selecciona una fecha y un intervalo de horas válido.')
          start = businessDate(`${input.date}T${input.startTime}`, zone)
          end = businessDate(`${input.date}T${input.endTime}`, zone)
          if (start.getTime() <= Date.now()) fail('invalid-argument', 'La hora de inicio debe estar en el futuro.')
        } else if (mode === 'fullDay') {
          if (!isCalendarDate(input.startDate) || !isCalendarDate(input.endDate) || input.endDate < input.startDate) fail('invalid-argument', 'Selecciona fechas de inicio y fin válidas.')
          const endExclusive = nextCalendarDate(input.endDate)
          start = businessDate(`${input.startDate}T00:00`, zone)
          end = businessDate(`${endExclusive}T00:00`, zone)
          if (Date.parse(`${endExclusive}T12:00:00.000Z`) - Date.parse(`${input.startDate}T12:00:00.000Z`) > 366 * 86400000) fail('invalid-argument', 'El período no puede superar un año.')
        } else if (mode === 'legacy' && isCalendarDate(input.startDate) && isCalendarDate(input.endDate)) {
          // Preserve the existing API's exclusive end date for old clients.
          start = businessDate(`${input.startDate}T00:00`, zone)
          end = businessDate(`${input.endDate}T00:00`, zone)
        } else fail('invalid-argument', 'Selecciona fechas válidas.')
      } catch (error) {
        if (error instanceof BookingError) throw error
        fail('invalid-argument', 'Selecciona fechas y horas válidas para la zona horaria del negocio.')
      }
      const tooLong = mode === 'legacy' && end - start > 366 * 86400000
      if (end <= start || end.getTime() <= Date.now() || tooLong) fail('invalid-argument', 'El fin debe ser posterior al inicio, estar en el futuro y no superar un año.')
      ref = db.doc(`scheduleBlocks/${uid}_${requestId}`)
      block = { id: ref.id, businessId, title: input.title.trim(), reason: input.reason, allProfessionals: admin && input.allProfessionals === true,
        professionalId: admin && input.allProfessionals === true ? null : input.professionalId,
        startAt: Timestamp.fromDate(start), endAt: Timestamp.fromDate(end), createdAt: stamp, createdByUserId: uid, status: admin ? 'approved' : 'pending',
        ...(mode !== 'legacy' ? { mode } : {}) }
    } else {
      if (typeof input.blockId !== 'string' || !/^[^/\s]{1,200}$/.test(input.blockId)) fail('invalid-argument', 'Bloqueo inválido.')
      ref = db.doc(`scheduleBlocks/${input.blockId}`)
      block = record(await tx.get(ref))
      if (!block || block.businessId !== businessId) fail('not-found', 'Bloqueo no disponible.')
      if (!admin && !(action === 'blockDelete' && block.status === 'pending' && block.createdByUserId === uid)) fail('permission-denied', 'Solo el administrador puede resolver esta solicitud.')
      if (['blockApprove', 'blockReject'].includes(action) && block.status !== 'pending') fail('failed-precondition', 'Esta solicitud ya fue resuelta.')
      if (action === 'blockApprove' && ms(block.endAt) <= Date.now()) fail('failed-precondition', 'La solicitud ya venció.')
    }
    let professional
    if (!block.allProfessionals) {
      if (typeof block.professionalId !== 'string' || !/^[^/\s]{1,200}$/.test(block.professionalId)) fail('invalid-argument', 'Selecciona un profesional.')
      professional = record(await tx.get(db.doc(`professionals/${block.professionalId}`)))
      if (professional?.businessId !== businessId || (!admin && professional.userId !== uid)) fail('permission-denied', 'Profesional no permitido.')
      if (['blockCreate', 'blockApprove'].includes(action) && !professional.isActive) fail('failed-precondition', 'El profesional está inactivo.')
      if (['blockCreate', 'blockApprove'].includes(action)) {
        const member = record(await tx.get(db.doc(`memberships/${businessId}_${professional.userId}`)))
        const user = record(await tx.get(db.doc(`users/${professional.userId}`)))
        if (member?.role !== 'professional' || member.status !== 'active' || user?.status !== 'active') fail('failed-precondition', 'La cuenta del profesional no está activa.')
      }
    }
    if (['blockCreate', 'blockApprove'].includes(action)) {
      const reservations = rows(await tx.get(scoped('reservations')))
      const overlaps = (start, end) => start < ms(block.endAt) && end > ms(block.startAt)
      if (reservations.some(r => ['pending', 'confirmed'].includes(r.status) && (block.allProfessionals || r.professionalId === block.professionalId) && overlaps(ms(r.startAt) - (r.bufferBeforeMinutes || 0) * 60000, ms(r.endAt) + (r.bufferAfterMinutes || 0) * 60000))) fail('failed-precondition', 'Hay citas pendientes o confirmadas en estas fechas. Reprograma o cancela esas citas antes de bloquear.')
      const blocks = rows(await tx.get(scoped('scheduleBlocks')))
      if (blocks.some(b => b.id !== block.id && (!b.status || b.status === 'approved') && (b.allProfessionals || block.allProfessionals || b.professionalId === block.professionalId) && overlaps(ms(b.startAt), ms(b.endAt)))) fail('already-exists', 'Ya existe un bloqueo aprobado que coincide con estas fechas.')
    }
    const members = rows(await tx.get(scoped('memberships')))
    const status = action === 'blockApprove' ? 'approved' : action === 'blockReject' ? 'rejected' : action === 'blockDelete' ? 'cancelled' : block.status
    const recipients = new Set(!admin ? members.filter(m => m.role === 'admin' && m.status === 'active').map(m => m.userId) : [professional?.userId, block.createdByUserId])
    if (admin && block.allProfessionals) for (const member of members) {
      if (member.role === 'professional' && member.status === 'active') recipients.add(member.userId)
    }
    recipients.delete(uid); recipients.delete(undefined)
    const labels = { pending: 'Solicitud de bloqueo', approved: 'Bloqueo aprobado', rejected: 'Solicitud rechazada', cancelled: 'Bloqueo eliminado' }
    const zone = actor.business.settings?.timezone || 'America/La_Paz'
    const format = new Intl.DateTimeFormat('es-BO', { timeZone: zone, dateStyle: 'medium' })
    const period = block.mode === 'specificHours'
      ? new Intl.DateTimeFormat('es-BO', { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' }).format(ms(block.startAt)) + ' hasta ' + new Intl.DateTimeFormat('es-BO', { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' }).format(ms(block.endAt))
      : block.mode === 'fullDay'
        ? `${format.format(ms(block.startAt))} hasta ${format.format(ms(block.endAt) - 1)}`
        : `${format.format(ms(block.startAt))} hasta ${format.format(ms(block.endAt))} (fin no incluido)`
    const message = `${professional?.displayName || 'Todo el negocio'}: ${block.title}. ${period}.`
    for (const recipientUserId of recipients) tx.set(db.collection('notifications').doc(), { businessId, recipientUserId, blockId: block.id, type: 'block', title: labels[status], message, visibleAt: stamp, createdAt: stamp, read: false })
    if (action === 'blockDelete') tx.delete(ref)
    else tx.set(ref, { ...block, status, updatedAt: stamp, ...(action !== 'blockCreate' ? { reviewedByUserId: uid, reviewedAt: stamp } : {}) })
    tx.set(lock, { revision: FieldValue.increment(1), updatedAt: stamp }, { merge: true })
    const result = { id: block.id, status }
    tx.set(operation, { fingerprint, result, createdAt: stamp })
    return result
  })
}
