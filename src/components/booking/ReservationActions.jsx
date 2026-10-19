import { markFormSaved } from '../../lib/unsavedForms'
import { useEffect, useRef, useState } from 'react'
import { bookingEnabled, bookingRequest } from '../../lib/bookingApi'
import { useAuth } from '../../context/auth-context'
import { dateMillis, formatAppointmentDate } from '../../lib/clientPresentation'
import './booking.css'

const labels = { confirmed: 'Confirmar', completed: 'Finalizar', cancelled: 'Cancelar cita', no_show: 'Marcar no asistida' }
export default function ReservationActions({ reservation, business, onReschedule }) {
  const { membership } = useAuth()
  const [now, setNow] = useState(Date.now)
  const [desired, setDesired] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const request = useRef(null)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [])
  const isClient = membership.role === 'client'
  const active = ['pending', 'confirmed'].includes(reservation.status)
  const deadline = dateMillis(reservation.startAt) > now && dateMillis(reservation.startAt) - now >= (business.settings?.cancellationLimitHours ?? 24) * 3600000
  const allowed = !active ? [] : isClient ? (deadline ? ['cancelled'] : []) : [
    ...(reservation.status === 'pending' && dateMillis(reservation.endAt) > now ? ['confirmed'] : []),
    ...(active && dateMillis(reservation.endAt) <= now ? ['completed'] : []),
    ...((reservation.status === 'confirmed' && dateMillis(reservation.startAt) <= now || reservation.status === 'pending' && dateMillis(reservation.endAt) <= now) ? ['no_show'] : []), 'cancelled',
  ]
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('')
    if (!request.current) request.current = { action: 'status', businessId: business.id, reservationId: reservation.id,
      revision: reservation.revision || 0, status: desired, reason, requestId: crypto.randomUUID() }
    try { await bookingRequest(request.current); markFormSaved(event.target, true); request.current = null; setDesired(''); setUncertain(false); setSuccess('Estado actualizado.') }
    catch (failure) {
      setError(failure.message)
      const ambiguous = ['functions/internal', 'functions/unavailable', 'functions/deadline-exceeded'].includes(failure.code)
      setUncertain(ambiguous)
      if (!ambiguous) request.current = null
    } finally { setBusy(false) }
  }
  if (!bookingEnabled) return null
  return <div className="booking-scope">
    {active && dateMillis(reservation.endAt) <= now && <p role="status" className="booking-notice">{isClient ? 'El horario de esta cita ya terminó. El negocio debe registrar si se realizó la atención. Contacta al profesional si necesitas otra fecha.' : 'Esta cita requiere cierre. Finaliza solo si se realizó el servicio; de lo contrario, marca inasistencia o reprograma de acuerdo con el cliente.'}</p>}
    {reservation.rescheduledAt && <p className="booking-notice">Cita reprogramada. El estado mostrado corresponde al nuevo horario.</p>}
    {!!reservation.rescheduleHistory?.length && <details className="booking-panel"><summary>Historial de reprogramaciones ({reservation.rescheduleHistory.length})</summary><ul className="space-y-2 mt-3">{reservation.rescheduleHistory.map((entry, index) => <li key={index}>Horario anterior: {formatAppointmentDate(entry.startAt, business.settings?.timezone)} · {formatAppointmentDate(entry.startAt, business.settings?.timezone, true)}. Cambio registrado: {formatAppointmentDate(entry.at, business.settings?.timezone)}.</li>)}</ul></details>}
    {isClient && active && deadline && <p className="booking-notice">Puedes cambiar o cancelar hasta el {formatAppointmentDate(dateMillis(reservation.startAt) - (business.settings?.cancellationLimitHours ?? 24) * 3600000, business.settings?.timezone)} a las {formatAppointmentDate(dateMillis(reservation.startAt) - (business.settings?.cancellationLimitHours ?? 24) * 3600000, business.settings?.timezone, true)} ({business.settings?.timezone || 'America/La_Paz'}).</p>}
    {error && <p className="booking-error" role="alert">{error}</p>}
    {success && <p role="status" className="booking-notice">{success}</p>}
    {!desired && <div className="booking-actions">
      {onReschedule && active && (!isClient || deadline) && <button className="booking-button secondary" onClick={onReschedule}>Reprogramar</button>}
      {allowed.map(status => <button key={status} className={`booking-button ${status === 'cancelled' ? 'danger' : 'secondary'}`} onClick={() => { setDesired(status); setError(''); setSuccess('') }}>{labels[status]}</button>)}
    </div>}
    {isClient && active && !deadline && <p className="booking-notice">El plazo de cambios terminó. Contacta al negocio para cancelar o reprogramar.</p>}
    {desired && <form onSubmit={submit} className="booking-panel mt-5">
      <h3>{labels[desired]}</h3><p className="booking-notice">Revisa tu selección antes de aplicar el cambio.</p>
      {desired === 'cancelled' && <label className="booking-field">Motivo (opcional)<textarea rows={2} maxLength={500} value={reason} disabled={busy || uncertain} onChange={event => setReason(event.target.value)} /></label>}
      <div className="booking-actions"><button className="booking-button" disabled={busy}>{busy ? 'Guardando…' : uncertain ? 'Reintentar cambio' : 'Aplicar cambio'}</button><button type="button" className="booking-button secondary" disabled={busy || uncertain} onClick={() => { setDesired(''); request.current = null }}>Volver</button></div>
    </form>}
  </div>
}
