import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Clock3, UserRound } from 'lucide-react'
import { bookingEnabled, bookingRequest } from '../../lib/bookingApi'
import { useAuth } from '../../context/auth-context'
import { addDays, dayKey } from '../../lib/calendarDates'
import { formatPrice } from '../../lib/clientPresentation'
import BookingStepper from './BookingStepper'
import BookingSummary from './BookingSummary'
import './booking.css'

export default function BookingFlow({ business, initialServiceId = '', reservation, manual = false, onSuccess }) {
  const { userDoc } = useAuth()
  const [options, setOptions] = useState(null)
  const [optionsError, setOptionsError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [step, setStep] = useState(reservation ? 2 : initialServiceId ? 1 : 0)
  const [serviceId, setServiceId] = useState(reservation?.serviceId || initialServiceId)
  const [professionalId, setProfessionalId] = useState(reservation?.professionalId || '')
  const zone = business.settings?.timezone || 'America/La_Paz'
  const [date, setDate] = useState(() => dayKey(Date.now(), zone))
  const [chosen, setChosen] = useState(null)
  const [availability, setAvailability] = useState({ slots: [], key: '' })
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [clientId, setClientId] = useState('')
  const [manualClient, setManualClient] = useState({ name: '', phone: '', email: '' })
  const [notes, setNotes] = useState('')
  const pending = useRef(null)
  const availabilityLoading = useRef(false)
  const service = options?.services.find(item => item.id === serviceId)
  const professional = options?.professionals.find(item => item.id === professionalId)
  const selectionKey = `${serviceId}:${professionalId}:${date}`
  const queryKey = `${selectionKey}:${refresh}`
  const [today, setToday] = useState(() => dayKey(Date.now(), zone))
  const blocked = saving || uncertain
  useEffect(() => { const timer = setInterval(() => setToday(dayKey(Date.now(), zone)), 30000); return () => clearInterval(timer) }, [zone])

  useEffect(() => {
    if (!bookingEnabled) return
    let active = true
    bookingRequest({ action: 'options', businessId: business.id }).then(result => {
      if (active) { setOptions(result); setOptionsError('') }
    }).catch(failure => { if (active) setOptionsError(failure.message) })
    return () => { active = false }
  }, [business.id, attempt])

  const refreshAvailability = useCallback(() => {
    // Una consulta lenta debe poder terminar antes de iniciar la siguiente.
    if (!availabilityLoading.current) setRefresh(value => value + 1)
  }, [])
  useEffect(() => {
    if (step !== 2) return
    const timer = setInterval(refreshAvailability, 15000)
    window.addEventListener('focus', refreshAvailability)
    return () => { clearInterval(timer); window.removeEventListener('focus', refreshAvailability) }
  }, [step, refreshAvailability])

  useEffect(() => {
    if (!bookingEnabled || !serviceId || !professionalId || !date || step !== 2) return
    let active = true
    availabilityLoading.current = true
    bookingRequest({ action: 'availability', businessId: business.id, serviceId, professionalId, date,
      ...(reservation ? { reservationId: reservation.id } : {}) }).then(result => {
      if (active) setAvailability({ ...result, key: queryKey, error: '' })
    }).catch(failure => { if (active) setAvailability({ key: queryKey, slots: [], error: failure.message }) })
      .finally(() => { if (active) availabilityLoading.current = false })
    return () => { active = false; availabilityLoading.current = false }
  }, [business.id, serviceId, professionalId, date, step, refresh, reservation, queryKey])

  function clearSelection() { setChosen(null); setError(''); pending.current = null }
  async function confirm(event) {
    event.preventDefault()
    if (!chosen || saving) return
    setSaving(true); setError('')
    if (!pending.current) pending.current = {
      action: reservation ? 'reschedule' : 'create', businessId: business.id, requestId: crypto.randomUUID(),
      date, startAt: chosen.start, expectedPrice: chosen.quote.price, expectedDuration: chosen.quote.durationMinutes,
      ...(reservation ? { reservationId: reservation.id, revision: reservation.revision || 0 }
        : { serviceId, professionalId, notes, ...(manual ? (clientId ? { clientId } : { manualClient }) : {}) }),
    }
    try {
      const result = await bookingRequest(pending.current)
      setUncertain(false)
      onSuccess(result)
    } catch (failure) {
      setError(failure.message)
      const ambiguous = ['functions/internal', 'functions/unavailable', 'functions/deadline-exceeded'].includes(failure.code)
      setUncertain(ambiguous)
      if (!ambiguous) {
        pending.current = null
        if (['functions/already-exists', 'functions/failed-precondition'].includes(failure.code)) {
          setChosen(null); setStep(2); refreshAvailability()
        }
      }
    } finally { setSaving(false) }
  }

  if (!bookingEnabled) return <div className="booking-panel"><h2>Reservas en línea no disponibles</h2><p>Por ahora, contacta al negocio para coordinar tu cita.</p></div>
  if (optionsError) return <div className="booking-error" role="alert"><p>{optionsError}</p><button className="booking-button secondary" onClick={() => { setOptionsError(''); setAttempt(value => value + 1) }}>Reintentar</button></div>
  if (!options) return <p role="status">Cargando servicios y profesionales…</p>
  const available = availability.key === queryKey && !availability.error
  const selectedValid = chosen && available && availability.slots.some(slot => slot.start === chosen.start)
  return <div className="booking-flow">
    <BookingStepper step={step} />
    {error && <p className="booking-error" role="alert">{error}</p>}
    {reservation && <p className="booking-notice">La cita actual se conserva hasta que confirmes un nuevo horario disponible.</p>}
    {step === 0 && <section><h2>Selecciona un servicio</h2><p>Elige el servicio para tu próxima visita.</p><div className="booking-choices">
      {options.services.map(item => <button key={item.id} className={`booking-choice ${serviceId === item.id ? 'selected' : ''}`} onClick={() => { setServiceId(item.id); setProfessionalId(''); clearSelection(); setStep(1) }}>
        <h3>{item.name}</h3><span><Clock3 size={16} />{item.durationMinutes} minutos</span><strong>{formatPrice(item.price, item.currencyCode)}</strong><span className="booking-choice-action">Seleccionar</span>
      </button>)}
    </div>{!options.services.length && <p>No hay servicios disponibles en este momento.</p>}</section>}
    {step === 1 && <section><h2>Selecciona un profesional</h2><p>{service?.name || 'El servicio ya no está disponible. Vuelve a elegir un servicio.'}</p><div className="booking-choices">
      {service && options.professionals.filter(item => item.serviceIds.includes(serviceId)).map(item => <button key={item.id} className={`booking-choice ${professionalId === item.id ? 'selected' : ''}`} onClick={() => { setProfessionalId(item.id); clearSelection(); setStep(2) }}>
        <span className="booking-avatar"><UserRound size={26} /></span><h3>{item.displayName}</h3><span>{item.jobTitle || 'Profesional'}</span><p>{item.bio}</p><span className="booking-choice-action">Seleccionar</span>
      </button>)}
    </div>{!options.professionals.some(item => item.serviceIds.includes(serviceId)) && <p>No hay profesionales disponibles para este servicio.</p>}</section>}
    {step === 2 && <section><h2>Selecciona fecha y hora</h2><p>{service?.name} · {professional?.displayName} · Zona horaria: {zone}</p>
      <div className="booking-date-grid"><label className="booking-panel booking-field">Fecha de la cita<input type="date" value={date} min={today} max={addDays(today, business.settings?.maxAdvanceDays ?? 90)}
        onChange={event => { setDate(event.target.value); clearSelection() }} /></label>
        <div className="booking-panel"><div className="booking-heading"><h3>Horarios disponibles</h3><button type="button" className="booking-link" onClick={refreshAvailability}>Actualizar</button></div>
          {availability.key !== queryKey ? <p role="status">Consultando horarios…</p> : availability.error ? <p role="alert" className="booking-error">{availability.error}</p>
            : availability.slots.length ? <div className="booking-slots" role="group" aria-label="Horarios disponibles">{availability.slots.map(slot => <button key={slot.start} aria-pressed={chosen?.start === slot.start} onClick={() => { setChosen({ ...slot, quote: availability.quote }); setError('') }}>{slot.label}</button>)}</div>
              : <p>No hay horarios disponibles. Prueba otra fecha.</p>}
        </div></div>
      <div className="booking-controls"><button className="booking-button" disabled={!selectedValid} onClick={() => setStep(3)}>Continuar <Check size={16} /></button></div>
    </section>}
    {step === 3 && chosen && <form onSubmit={confirm}>
      <h2>{reservation ? 'Confirmar reprogramación' : 'Confirma tu reserva'}</h2>
      <div className="booking-confirm-grid"><BookingSummary service={service} professional={professional} slot={chosen} quote={chosen.quote} timeZone={zone} />
        <fieldset className="booking-panel booking-fields" disabled={blocked}><legend>Datos del cliente</legend>
          {manual && !reservation ? <>
            <label className="booking-field">Cliente<select value={clientId} onChange={event => { setClientId(event.target.value); pending.current = null }}><option value="">Cliente sin cuenta</option>{options.clients.map(item => <option key={item.id} value={item.id}>{item.name} · {item.phone}</option>)}</select></label>
            {!clientId && [['name', 'Nombre completo', 'text'], ['phone', 'Teléfono', 'tel'], ['email', 'Correo electrónico (opcional)', 'email']].map(([key, label, type]) => <label key={key} className="booking-field">{label}<input type={type} required={key !== 'email'} maxLength={key === 'name' ? 120 : key === 'phone' ? 30 : 254} value={manualClient[key]} onChange={event => setManualClient(previous => ({ ...previous, [key]: event.target.value }))} /></label>)}
          </> : <dl className="booking-client-data"><dt>Nombre</dt><dd>{reservation?.clientName || `${userDoc.firstName} ${userDoc.lastName}`}</dd><dt>Correo</dt><dd>{reservation?.clientEmail || userDoc.email}</dd><dt>Teléfono</dt><dd>{reservation?.clientPhone || userDoc.phone || 'Sin teléfono'}</dd></dl>}
          {!reservation && <label className="booking-field">Notas adicionales (opcional)<textarea maxLength={1000} value={notes} onChange={event => setNotes(event.target.value)} rows={3} /></label>}
          <p className="booking-notice">{business.settings?.autoConfirmBookings ? 'La cita se confirmará al guardarla.' : 'La cita quedará pendiente de confirmación por el negocio.'}</p>
          <p className="booking-notice">Cancelación o reprogramación: al menos {business.settings?.cancellationLimitHours ?? 24} horas antes.</p>
        </fieldset></div>
      <div className="booking-controls"><button className="booking-button" disabled={saving}>{saving ? 'Guardando…' : uncertain ? 'Reintentar confirmación' : reservation ? 'Guardar nuevo horario' : 'Confirmar reserva'}</button></div>
    </form>}
    {step > 0 && !reservation && <button className="booking-button secondary" disabled={blocked} onClick={() => { setStep(value => value - 1); setError('') }}><ArrowLeft size={16} />Volver</button>}
    {reservation && step === 3 && <button className="booking-button secondary" disabled={blocked} onClick={() => setStep(2)}>Elegir otro horario</button>}
  </div>
}
