import { dateError, closedDay, collectSlots } from '../../lib/clientBooking'
import { markFormSaved } from '../../lib/unsavedForms'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Clock3, UserRound } from 'lucide-react'
import { bookingEnabled, bookingRequest } from '../../lib/bookingApi'
import { useAuth } from '../../context/auth-context'
import { addDays, dayKey } from '../../lib/calendarDates'
import { formatAppointmentDate, formatPrice } from '../../lib/clientPresentation'
import BookingStepper from './BookingStepper'
import BookingSummary from './BookingSummary'
import './booking.css'
import { Link } from 'react-router-dom'

export default function BookingFlow({ business, initialServiceId = '', initialProfessionalId = '', reservation, manual = false, onSuccess, publicMode = false, draft = null }) {
  const { userDoc, currentUser, membership } = useAuth()
  const [options, setOptions] = useState(null)
  const [optionsError, setOptionsError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [step, setStep] = useState(draft ? 2 : reservation ? 2 : initialServiceId ? (initialProfessionalId ? 2 : 1) : 0)
  const [serviceId, setServiceId] = useState(draft?.serviceId || reservation?.serviceId || initialServiceId)
  const [professionalId, setProfessionalId] = useState(draft?.professionalId || reservation?.professionalId || initialProfessionalId || '')
  const zone = business.settings?.timezone || 'America/La_Paz'
  const [date, setDate] = useState(() => draft?.date || dayKey(Date.now(), zone))
  const [chosen, setChosen] = useState(draft?.chosen || null)
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
  const [now, setNow] = useState(Date.now)
  const today = dayKey(now, zone)
  const [searching, setSearching] = useState(false)
  const [searchMessage, setSearchMessage] = useState('')
  const searchRun = useRef({ id: 0 })
  const [searchThrough, setSearchThrough] = useState('')
  const maxDate = addDays(today, business.settings?.maxAdvanceDays ?? 90)
  const invalidDate = dateError(date, today, maxDate)
  const eligible = options?.professionals.filter(p => p.serviceIds.includes(serviceId)) || []
  const candidateIds = professionalId === 'any' ? eligible.map(p => p.id) : [professionalId].filter(Boolean)
  const candidateKey = candidateIds.join(',')
  const chosenProfessional = options?.professionals.find(p => p.id === chosen?.professionalId) || professional
  const blocked = saving || uncertain || searching
  useEffect(() => {
    const run = searchRun.current
    return () => { run.id++ }
  }, [])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [zone])

  useEffect(() => {
    if (!bookingEnabled) return
    let active = true
    bookingRequest({ action: publicMode ? 'publicOptions' : 'options', businessId: business.id }).then(result => {
      if (active) {
        setOptions(result); setOptionsError('')
        if (!reservation && initialServiceId && !result.services.some(s => s.id === initialServiceId)) {
          setStep(0); setServiceId(''); setProfessionalId(''); setChosen(null)
          setError('El servicio anterior ya no está disponible. Elige otro servicio.')
        } else if (!reservation && initialProfessionalId && !result.professionals.some(p => p.id === initialProfessionalId && p.serviceIds.includes(initialServiceId))) {
          setStep(1); setProfessionalId(''); setChosen(null)
          setError('El profesional anterior ya no ofrece este servicio. Elige otro profesional.')
        }
      }
    }).catch(failure => { if (active) setOptionsError(failure.message) })
    return () => { active = false }
  }, [business.id, attempt, publicMode, initialServiceId, initialProfessionalId, reservation])

  const refreshAvailability = useCallback(() => {
    // Una consulta lenta debe poder terminar antes de iniciar la siguiente.
    if (!availabilityLoading.current) setRefresh(value => value + 1)
  }, [])
  useEffect(() => {
    if (step !== 2 || searching) return
    const timer = setInterval(refreshAvailability, 15000)
    window.addEventListener('focus', refreshAvailability)
    return () => { clearInterval(timer); window.removeEventListener('focus', refreshAvailability) }
  }, [step, searching, refreshAvailability])

  useEffect(() => {
    if (!bookingEnabled || !serviceId || !professionalId || !date || invalidDate || searching || !candidateKey || step !== 2) return
    let active = true
    availabilityLoading.current = true
    collectSlots(bookingRequest, { action: publicMode ? 'publicAvailability' : 'availability', businessId: business.id, serviceId, date,
      ...(reservation ? { reservationId: reservation.id } : {}) }, candidateKey.split(','), () => !active).then(result => {
      if (active && result) setAvailability({ ...result, key: queryKey, error: '' })
    }).catch(failure => { if (active) setAvailability({ key: queryKey, slots: [], error: failure.message }) })
      .finally(() => { if (active) availabilityLoading.current = false })
    return () => { active = false; availabilityLoading.current = false }
  }, [business.id, serviceId, professionalId, date, step, refresh, reservation, queryKey, publicMode, invalidDate, candidateKey, searching])

  async function findNext() {
    const run = ++searchRun.current.id
    setSearching(true); setSearchMessage(''); setError(''); setChosen(null)
    const start = searchThrough || (invalidDate ? addDays(today, -1) : date)
    let checked = start
    try {
      for (let offset = 1; offset <= 7; offset++) {
        const next = addDays(start, offset)
        if (next > maxDate) break
        if (run !== searchRun.current.id) return
        setSearchMessage(`Buscando horarios: ${next.split('-').reverse().join('/')}…`)
        const result = await collectSlots(bookingRequest, { action: publicMode ? 'publicAvailability' : 'availability', businessId: business.id, serviceId, date: next,
          ...(reservation ? { reservationId: reservation.id } : {}) }, candidateIds, () => run !== searchRun.current.id)
        if (run !== searchRun.current.id) return
        checked = next
        if (result?.slots.length) { setDate(next); setSearchThrough(''); setSearchMessage('Encontramos horarios disponibles. Elige uno para continuar.'); setRefresh(v => v + 1); return }
      }
      setSearchThrough(checked)
      setSearchMessage(checked >= maxDate ? 'No hay horarios disponibles hasta el límite de reserva.' : `Sin horarios hasta el ${checked.split('-').reverse().join('/')}. Puedes buscar los siguientes 7 días.`)
    } catch (failure) { if (run === searchRun.current.id) setError(`No pudimos completar la búsqueda. ${failure.message}`) }
    finally { if (run === searchRun.current.id) setSearching(false) }
  }

  function preserveDraft() {
    try { sessionStorage.setItem(`booking-draft:${business.id}`, JSON.stringify({ serviceId, professionalId, date, chosen, savedAt: Date.now() })) } catch { /* Selection can be repeated when browser storage is unavailable. */ }
  }

  function clearSelection() { searchRun.current.id++; setSearching(false); setSearchMessage(''); setSearchThrough(''); setChosen(null); setError(''); pending.current = null }
  async function confirm(event) {
    event.preventDefault()
    if (!chosen || saving) return
    if (!pending.current && (invalidDate || chosen.start <= Date.now())) { setError(invalidDate || 'Este horario ya pasó. Elige otro horario.'); setChosen(null); setStep(2); return }
    if (publicMode && (!currentUser || membership?.businessId !== business.id || membership?.role !== 'client' || membership.status !== 'active')) { setError('Confirma con una cuenta de cliente activa de este negocio.'); return }
    setSaving(true); setError('')
    if (!pending.current) pending.current = {
      action: reservation ? 'reschedule' : 'create', businessId: business.id, requestId: crypto.randomUUID(),
      ...(publicMode ? { source: 'public' } : {}),
      date, startAt: chosen.start, expectedPrice: chosen.quote.price, expectedDuration: chosen.quote.durationMinutes,
      ...(reservation ? { reservationId: reservation.id, revision: reservation.revision || 0 }
        : { serviceId, professionalId: chosen.professionalId || professionalId, notes, ...(manual ? (clientId ? { clientId } : { manualClient }) : {}) }),
    }
    try {
      const result = await bookingRequest(pending.current)
      setUncertain(false)
      markFormSaved(event.target)
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
  const selectedValid = !invalidDate && !searching && chosen && available && chosen.start > now && availability.slots.some(slot => slot.start === chosen.start && slot.professionalId === chosen.professionalId)
  return <div className="booking-flow">
    <BookingStepper step={step} /><p className="booking-progress">Paso {step + 1} de 4 · {step === 3 ? "Revisa antes de enviar" : "Tu selección se conserva al volver"}</p>
    {error && <p className="booking-error" role="alert">{error}</p>}
    {reservation && <p className="booking-notice">La cita actual se conserva hasta que confirmes un nuevo horario disponible.</p>}
    {step === 0 && <section><h2>Selecciona un servicio</h2><p>Elige el servicio para tu próxima visita.</p><div className="booking-choices">
      {options.services.map(item => <button key={item.id} className={`booking-choice ${serviceId === item.id ? 'selected' : ''}`} onClick={() => { if (serviceId !== item.id) { setServiceId(item.id); setProfessionalId(''); clearSelection() } setStep(1) }}>
        <h3>{item.name}</h3><span><Clock3 size={16} />{item.durationMinutes} minutos</span><strong>{formatPrice(item.price, item.currencyCode)}</strong><span className="booking-choice-action">Seleccionar</span>
      {item.promotionTitle && <span>{item.promotionTitle} · Antes {formatPrice(item.originalPrice, item.currencyCode)}</span>}
      </button>)}
    </div>{!options.services.length && <p>No hay servicios disponibles en este momento.</p>}</section>}
    {step === 1 && <section><h2>Selecciona un profesional</h2><p>{service?.name || 'El servicio ya no está disponible. Vuelve a elegir un servicio.'}</p><div className="booking-choices">
      {!reservation && eligible.length > 1 && <button className="booking-choice" onClick={() => { if (professionalId !== 'any') { setProfessionalId('any'); clearSelection() } setStep(2) }}><UserRound size={26} /><h3>Sin preferencia de profesional</h3><p>Consulta los horarios de todos los profesionales de este servicio. Verás quién te atenderá antes de confirmar.</p><span className="booking-choice-action">Ver disponibilidad</span></button>}
      {service && options.professionals.filter(item => item.serviceIds.includes(serviceId)).map(item => <button key={item.id} className={`booking-choice ${professionalId === item.id ? 'selected' : ''}`} onClick={() => { if (professionalId !== item.id) { setProfessionalId(item.id); clearSelection() } setStep(2) }}>
        <span className="booking-avatar"><UserRound size={26} /></span><h3>{item.displayName}</h3><span>{item.jobTitle || 'Profesional'}</span><p>{item.bio}</p><span className="booking-choice-action">Seleccionar</span>
      </button>)}
    </div>{!options.professionals.some(item => item.serviceIds.includes(serviceId)) && <p>No hay profesionales disponibles para este servicio.</p>}</section>}
    {step === 2 && <section><h2>Selecciona fecha y hora</h2><p>{service?.name} · {professionalId === 'any' ? 'Sin preferencia de profesional' : professional?.displayName} · Zona horaria: {zone}</p>
      <div className="booking-date-grid"><div className="booking-panel">
        <label className="booking-field">Fecha de la cita<input type="date" value={date} min={today} max={maxDate} required disabled={searching}
          aria-invalid={!!invalidDate} aria-describedby="booking-date-help" onChange={event => { setDate(event.target.value); clearSelection() }} /></label>
        <p id="booking-date-help" className={invalidDate ? 'booking-error' : 'booking-notice'} role={invalidDate ? 'alert' : undefined}>{invalidDate || `Puedes reservar hasta el ${maxDate.split('-').reverse().join('/')}. Se respeta la anticipación mínima del negocio.`}</p>
        <div className="booking-quick-days" aria-label="Elegir día"><button type="button" disabled={searching} aria-pressed={date === today} onClick={() => { setDate(today); clearSelection() }}>Hoy</button><button type="button" disabled={searching || addDays(today, 1) > maxDate} aria-pressed={date === addDays(today, 1)} onClick={() => { setDate(addDays(today, 1)); clearSelection() }}>Mañana</button></div>
        <div className="booking-week-strip" role="group" aria-label="Días cercanos">{Array.from({ length: 7 }, (_, i) => addDays(invalidDate ? today : date, i)).filter(day => day <= maxDate).map(day => {
          const closed = closedDay(business, day)
          const label = new Intl.DateTimeFormat('es-BO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
          return <button type="button" key={day} disabled={searching || closed} aria-pressed={day === date} onClick={() => { setDate(day); clearSelection() }}><span>{label}</span><small>{closed ? 'Cerrado' : day === date ? 'Elegido' : 'Consultar'}</small></button>
        })}</div>
        <p className="booking-notice">Selecciona un día para comprobar sus horarios. «Consultar» no garantiza disponibilidad.</p>
        <button type="button" className="booking-button secondary" disabled={searching || !candidateIds.length || searchThrough >= maxDate || (!invalidDate && date >= maxDate)} onClick={findNext}>{searching ? 'Buscando…' : searchThrough ? 'Buscar siguientes 7 días' : 'Ver próximo día disponible'}</button>
        {searching && <button type="button" className="booking-link" onClick={() => { searchRun.current.id++; setSearching(false); setSearchMessage('Búsqueda detenida. Puedes elegir una fecha.')}}>Detener búsqueda</button>}
        {searchMessage && <p role="status" className="booking-notice">{searchMessage}</p>}
      </div>
      <div className="booking-panel"><div className="booking-heading"><h3>Horarios disponibles</h3><button type="button" className="booking-link" disabled={!!invalidDate || searching} onClick={refreshAvailability}>Actualizar</button></div>
        {invalidDate ? <p>Corrige la fecha para consultar horarios.</p> : searching ? <p role="status">Buscando el próximo día con horarios…</p> : availability.key !== queryKey ? <p role="status">Consultando horarios…</p> : availability.error ? <div><p role="alert" className="booking-error">No pudimos consultar los horarios. {availability.error}</p><button className="booking-button secondary" onClick={refreshAvailability}>Reintentar consulta</button></div>
          : availability.slots.length ? <div role="group" aria-label="Horarios disponibles">{['Mañana', 'Tarde'].map((period, index) => {
            const slots = availability.slots.filter(slot => (Number(slot.label.split(':')[0]) < 12 ? 0 : 1) === index)
            return slots.length > 0 && <div className="booking-slot-period" key={period}><h4>{period}</h4><div className="booking-slots">{slots.map(slot => <button type="button" key={`${slot.start}-${slot.professionalId}`} aria-pressed={chosen?.start === slot.start && chosen?.professionalId === slot.professionalId} onClick={() => { setChosen(slot); setError('') }}>{slot.label}{professionalId === 'any' && <small>{options.professionals.find(p => p.id === slot.professionalId)?.displayName}</small>}</button>)}</div></div>
          })}</div>
          : <div className="booking-empty"><h4>{closedDay(business, date) ? 'El negocio no atiende este día' : 'No hay horarios disponibles para esta fecha'}</h4><p>Elige otra fecha o utiliza «Ver próximo día disponible».</p>{!publicMode && membership?.role === 'client' && <Link to="/cliente/favoritos">Registrar interés en la lista de espera</Link>}</div>}
      </div></div>
      <div className="booking-controls booking-selection-bar">{chosen && <p>{formatAppointmentDate(chosen.start, zone)} · {chosen.label} · {chosenProfessional?.displayName}<strong>{formatPrice(chosen.quote?.price, chosen.quote?.currencyCode)}</strong></p>}<button className="booking-button" disabled={!selectedValid} onClick={() => setStep(3)}>Continuar <Check size={16} /></button></div>
    </section>}
    {step === 3 && chosen && <form onSubmit={confirm}>
      <h2>{reservation ? 'Confirmar reprogramación' : 'Confirma tu reserva'}</h2><button type="button" className="booking-link" disabled={blocked} onClick={() => setStep(2)}>Cambiar fecha u hora</button>
      <div className="booking-confirm-grid"><BookingSummary service={service} professional={chosenProfessional} slot={chosen} quote={chosen.quote} timeZone={zone} />
        <fieldset className="booking-panel booking-fields" disabled={blocked}><legend>Datos del cliente</legend>
          {manual && !reservation ? <>
            <label className="booking-field">Cliente<select value={clientId} onChange={event => { setClientId(event.target.value); pending.current = null }}><option value="">Cliente sin cuenta</option>{options.clients.map(item => <option key={item.id} value={item.id}>{item.name} · {item.phone}</option>)}</select></label>
            {!clientId && [['name', 'Nombre completo', 'text'], ['phone', 'Teléfono', 'tel'], ['email', 'Correo electrónico (opcional)', 'email']].map(([key, label, type]) => <label key={key} className="booking-field">{label}<input type={type} required={key !== 'email'} maxLength={key === 'name' ? 120 : key === 'phone' ? 30 : 254} value={manualClient[key]} onChange={event => setManualClient(previous => ({ ...previous, [key]: event.target.value }))} /></label>)}
          </> : <dl className="booking-client-data"><dt>Nombre</dt><dd>{reservation?.clientName || (userDoc ? `${userDoc.firstName} ${userDoc.lastName}` : 'Inicia sesión al confirmar')}</dd><dt>Correo</dt><dd>{reservation?.clientEmail || userDoc?.email || 'Sin sesión'}</dd><dt>Teléfono</dt><dd>{reservation?.clientPhone || userDoc?.phone || 'Sin teléfono'}</dd></dl>}
          {!reservation && <label className="booking-field">Notas adicionales (opcional)<textarea maxLength={1000} value={notes} onChange={event => setNotes(event.target.value)} rows={3} /></label>}
          <p className="booking-notice">{business.settings?.autoConfirmBookings ? 'La cita se confirmará al guardarla.' : 'La cita quedará pendiente de confirmación por el negocio.'}</p>
          {membership?.role === 'professional' && reservation && <p className="booking-notice">Guarda el nuevo horario solo después de acordarlo con el cliente. Recibirá un aviso en su cuenta.</p>}
          <p className="booking-notice">{chosen.start - (business.settings?.cancellationLimitHours ?? 24) * 3600000 <= now ? 'Esta cita está dentro del plazo sin cambios en línea. Si necesitas cancelar o cambiarla, contacta al negocio.' : <>Puedes cambiar o cancelar hasta el {formatAppointmentDate(chosen.start - (business.settings?.cancellationLimitHours ?? 24) * 3600000, zone)} a las {formatAppointmentDate(chosen.start - (business.settings?.cancellationLimitHours ?? 24) * 3600000, zone, true)} ({zone}).</>}</p>
        </fieldset></div>
      {publicMode && !currentUser ? <div className="booking-controls"><p>Inicia sesión o regístrate para confirmar. El horario se comprobará otra vez al volver.</p><Link className="booking-button" onClick={preserveDraft} to={`/b/${encodeURIComponent(business.id)}/login?reserva=1`}>Iniciar sesión para confirmar</Link><Link className="booking-button secondary" onClick={preserveDraft} to={`/b/${encodeURIComponent(business.id)}/registro?reserva=1`}>Registrarme para confirmar</Link></div> : <div className="booking-controls"><button className="booking-button" disabled={saving}>{saving ? 'Guardando…' : uncertain ? 'Reintentar confirmación' : reservation ? 'Guardar nuevo horario' : business.settings?.autoConfirmBookings || manual ? 'Confirmar reserva' : 'Solicitar cita'}</button></div>}
    </form>}
    {step > 0 && !reservation && <button className="booking-button secondary" disabled={blocked} onClick={() => { setStep(value => value - 1); setError('') }}><ArrowLeft size={16} />Volver</button>}
    {reservation && step === 3 && <button className="booking-button secondary" disabled={blocked} onClick={() => setStep(2)}>Elegir otro horario</button>}
  </div>
}
