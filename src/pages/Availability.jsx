import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { ArrowLeft, ArrowRight, Ban, BriefcaseBusiness, CalendarDays, ChevronLeft, ChevronRight, Clock3, Globe2, Info, Moon, Sun, UserRound } from 'lucide-react'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'
import { availableSlots } from '../lib/availability'
import { addDays, dayKey } from '../lib/calendarDates'
import { availabilityQueryRange, availabilityState, availabilityViewDays, quickAvailabilityRange } from '../lib/availabilityCalendar'
import PageHeader from '../components/ui/PageHeader'
import Alert from '../components/ui/Alert'
import useProfessionalProfile from '../hooks/useProfessionalProfile'
import './availability.css'

const DAY_MS = 86400000
const dayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const monthLabel = (date, zone) => new Intl.DateTimeFormat('es-BO', { month: 'long', year: 'numeric', timeZone: zone }).format(new Date(`${date}T12:00:00Z`))
const fullDate = (date, zone) => new Intl.DateTimeFormat('es-BO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: zone }).format(new Date(`${date}T12:00:00Z`))
const shortDate = date => new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
const dateValid = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function errorMessage(error) {
  if (error?.code === 'permission-denied') return 'No tienes permisos para consultar esta disponibilidad.'
  if (['unavailable', 'deadline-exceeded', 'network-request-failed'].includes(error?.code)) return 'No hay conexión con Firebase. Comprueba tu conexión e inténtalo de nuevo.'
  if (error?.code === 'resource-exhausted') return 'El período tiene demasiados registros para consultarse completo. Elige un rango más corto.'
  return 'No se pudo cargar la disponibilidad del período. Intenta actualizar.'
}

export default function Availability() {
  const { membership, currentUser } = useAuth()
  const isProfessional = membership.role === 'professional'
  const own = useProfessionalProfile(membership.businessId, currentUser.uid, isProfessional)
  if (isProfessional && own.loading) return <p role="status">Cargando perfil profesional…</p>
  if (isProfessional && own.error) return <Alert tone="error">{own.error}</Alert>
  return <AvailabilityView key={`${membership.businessId}-${membership.role}-${currentUser.uid}-${own.profile?.id}`} membership={membership} ownId={own.profile?.id || ''} />
}

function AvailabilityView({ membership, ownId }) {
  const businessId = membership.businessId
  const isAdmin = membership.role === 'admin'
  const [now, setNow] = useState(Date.now)
  const [base, setBase] = useState({ key: '', data: {}, error: '' })
  const [professionalId, setProfessionalId] = useState(isAdmin ? '' : ownId)
  const [serviceId, setServiceId] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [monthAnchor, setMonthAnchor] = useState('')
  const [view, setView] = useState('month')
  const [rangeType, setRangeType] = useState('30')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [availability, setAvailability] = useState({ key: '', reservations: [], blocks: [], loaded: false, error: '' })
  const zone = base.key === businessId ? base.data.business?.settings?.timezone || 'America/La_Paz' : 'America/La_Paz'
  const today = dayKey(now, zone)
  const baseData = base.key === businessId ? base.data : {}

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [])

  useEffect(() => {
    let active = true
    setBase({ key: businessId, data: {}, error: '' })
    const receive = (key, value) => setBase(previous => active && previous.key === businessId
      ? { ...previous, data: { ...previous.data, [key]: value } }
      : previous)
    const fail = error => { if (active) setBase(previous => previous.key === businessId ? { ...previous, error: errorMessage(error) } : previous) }
    const stops = [
      onSnapshot(doc(db, 'businesses', businessId), snapshot => receive('business', snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null), fail),
      onSnapshot(query(collection(db, 'services'), where('businessId', '==', businessId), limit(1001)), snapshot => {
        if (snapshot.size > 1000) return fail({ code: 'resource-exhausted' })
        receive('services', snapshot.docs.map(item => ({ ...item.data(), id: item.id })))
      }, fail),
    ]
    if (isAdmin) stops.push(onSnapshot(query(collection(db, 'professionals'), where('businessId', '==', businessId), limit(1001)), snapshot => {
      if (snapshot.size > 1000) return fail({ code: 'resource-exhausted' })
      receive('professionals', snapshot.docs.map(item => ({ ...item.data(), id: item.id })))
    }, fail))
    else if (ownId) stops.push(onSnapshot(doc(db, 'professionals', ownId), snapshot => receive('professionals', snapshot.exists() ? [{ ...snapshot.data(), id: snapshot.id }] : []), fail))
    else receive('professionals', [])
    return () => { active = false; stops.forEach(stop => stop()) }
  }, [businessId, isAdmin, ownId])

  const baseLoaded = ['business', 'services', 'professionals'].every(key => key in baseData)
  const professionals = (baseData.professionals || []).filter(item => item.isActive === true)
  const professional = professionals.find(item => item.id === (isAdmin ? professionalId : ownId))
  const services = (baseData.services || []).filter(item => item.isActive === true && professional?.serviceIds?.includes(item.id))
  const service = services.find(item => item.id === serviceId)
  const queryProfessionalId = professional?.id || ''
  const days = useMemo(() => selectedDate && monthAnchor ? availabilityViewDays(view, selectedDate, monthAnchor) : [], [view, selectedDate, monthAnchor])
  const dateRangeError = !dateValid(rangeStart) || !dateValid(rangeEnd) || rangeEnd < rangeStart || (Date.parse(`${rangeEnd}T12:00:00Z`) - Date.parse(`${rangeStart}T12:00:00Z`)) / DAY_MS > 30
  const queryRange = useMemo(() => !dateRangeError ? availabilityQueryRange(days, rangeStart, rangeEnd, zone) : null, [days, rangeStart, rangeEnd, zone, dateRangeError])
  const occupancyKey = queryRange && professional && service
    ? [businessId, membership.role, membership.userId, professional.id, queryRange.startMs, queryRange.endMs].join(':')
    : ''

  useEffect(() => {
    if (!baseLoaded) return
    if (!rangeStart) {
      const start = dayKey(Date.now(), zone)
      const range = quickAvailabilityRange('30', start)
      setSelectedDate(start); setMonthAnchor(start.slice(0, 7)); setRangeStart(range.startDate); setRangeEnd(range.endDate); setRangeType('30')
    }
  }, [baseLoaded, selectedDate, rangeStart, zone])

  useEffect(() => {
    if (isAdmin && professionalId && !professionals.some(item => item.id === professionalId)) {
      setProfessionalId(''); setServiceId('')
    }
  }, [isAdmin, professionalId, professionals])

  useEffect(() => {
    if (!occupancyKey || !queryRange || !queryProfessionalId) return undefined
    let active = true
    const empty = { key: occupancyKey, reservations: [], blocks: [], loaded: false, error: '' }
    setAvailability(empty)
    const lower = Timestamp.fromMillis(queryRange.startMs - DAY_MS)
    const upper = Timestamp.fromMillis(queryRange.endMs + DAY_MS)
    // Valid reservations fit inside a business operating-day interval, including their stored buffers.
    const reservationClauses = [where('businessId', '==', businessId),
      ...(isAdmin ? [where('professionalId', '==', queryProfessionalId)] : [where('professionalUserId', '==', membership.userId)]),
      where('startAt', '>=', lower), where('startAt', '<', upper)]
    const reservationQuery = query(collection(db, 'reservations'), ...reservationClauses, orderBy('startAt'), limit(2001))
    const rangeClauses = [where('startAt', '<', Timestamp.fromMillis(queryRange.endMs)), where('endAt', '>', Timestamp.fromMillis(queryRange.startMs))]
    const businessClause = where('businessId', '==', businessId)
    const blocksCollection = collection(db, 'scheduleBlocks')
    const globalBlocksQuery = query(blocksCollection, businessClause, where('allProfessionals', '==', true), ...rangeClauses, limit(2001))
    const professionalBlocksQuery = query(blocksCollection, businessClause, where('professionalId', '==', queryProfessionalId), ...rangeClauses, limit(2001))
    let reservationsLoaded = false, globalBlocksLoaded = false, professionalBlocksLoaded = false
    let reservations = [], globalBlocks = [], professionalBlocks = []
    const publish = () => {
      const blocksById = new Map([...globalBlocks, ...professionalBlocks].map(block => [block.id, block]))
      const blocks = [...blocksById.values()]
      if (blocks.length > 2000) return fail({ code: 'resource-exhausted' })
      if (active) setAvailability({ key: occupancyKey, reservations, blocks, loaded: reservationsLoaded && globalBlocksLoaded && professionalBlocksLoaded, error: '' })
    }
    const fail = error => {
      console.error('Error al consultar disponibilidad en Firestore:', error?.code || error)
      if (active) setAvailability(previous => previous.key === occupancyKey ? { ...previous, loaded: false, error: errorMessage(error) } : previous)
    }
    const stops = [
      onSnapshot(reservationQuery, snapshot => {
        if (snapshot.size > 2000) return fail({ code: 'resource-exhausted' })
        reservations = snapshot.docs.map(item => ({ ...item.data(), id: item.id })); reservationsLoaded = true; publish()
      }, fail),
      onSnapshot(globalBlocksQuery, snapshot => {
        if (snapshot.size > 2000) return fail({ code: 'resource-exhausted' })
        globalBlocks = snapshot.docs.map(item => ({ ...item.data(), id: item.id })); globalBlocksLoaded = true; publish()
      }, fail),
      onSnapshot(professionalBlocksQuery, snapshot => {
        if (snapshot.size > 2000) return fail({ code: 'resource-exhausted' })
        professionalBlocks = snapshot.docs.map(item => ({ ...item.data(), id: item.id })); professionalBlocksLoaded = true; publish()
      }, fail),
    ]
    return () => { active = false; stops.forEach(stop => stop()) }
  }, [occupancyKey, businessId, isAdmin, membership.role, membership.userId, queryProfessionalId, queryRange, baseLoaded])

  const occupancy = availability.key === occupancyKey ? availability : null
  const queryError = base.error || occupancy?.error || ''
  const queryLoading = Boolean(occupancyKey && (!occupancy || !occupancy.loaded) && !queryError)
  const known = Boolean(occupancy?.loaded && !queryError)
  const counts = useMemo(() => {
    const result = new Map()
    if (!known || !queryRange || !professional || !service) return result
    for (const day of days) {
      if (day < queryRange.startDate || day > queryRange.endDate) continue
      result.set(day, availableSlots({ business: baseData.business, professional, service, date: day, blocks: occupancy.blocks, reservations: occupancy.reservations, now }).length)
    }
    return result
  }, [known, queryRange, professional, service, days, baseData.business, occupancy?.blocks, occupancy?.reservations, now])
  const selectedSlots = counts.has(selectedDate)
    ? availableSlots({ business: baseData.business, professional, service, date: selectedDate, blocks: occupancy.blocks, reservations: occupancy.reservations, now })
    : []
  const dayBlock = (occupancy?.blocks || []).filter(block => (!block.status || block.status === 'approved') &&
    (block.allProfessionals || block.professionalId === professional?.id) && Number.isFinite(block.startAt?.toMillis?.() ?? new Date(block.startAt).getTime()) &&
    (block.startAt?.toMillis?.() ?? new Date(block.startAt).getTime()) < (queryRange?.endMs ?? 0) && (block.endAt?.toMillis?.() ?? new Date(block.endAt).getTime()) > (queryRange?.startMs ?? Infinity))
  const dayBlockForSelected = dayBlock.filter(block => {
    const start = dayKey(block.startAt?.toMillis?.() ?? block.startAt, zone), end = dayKey(Math.max((block.startAt?.toMillis?.() ?? new Date(block.startAt).getTime()), (block.endAt?.toMillis?.() ?? new Date(block.endAt).getTime()) - 1), zone)
    return selectedDate >= start && selectedDate <= end
  })

  function setQuickRange(preset, anchor = today) {
    const result = quickAvailabilityRange(preset, anchor)
    if (!result) return
    setRangeType(preset); setRangeStart(result.startDate); setRangeEnd(result.endDate)
  }
  function selectDay(day) {
    setSelectedDate(day); setMonthAnchor(day.slice(0, 7))
    if (rangeType !== 'custom') setQuickRange(rangeType, day)
  }
  function navigate(direction) {
    if (view === 'week') {
      const day = addDays(selectedDate, direction * 7)
      setSelectedDate(day)
      if (rangeType !== 'custom') setQuickRange(rangeType, day)
      return
    }
    const [year, month] = monthAnchor.split('-').map(Number)
    const target = new Date(Date.UTC(year, month - 1 + direction, 1)).toISOString().slice(0, 7)
    const day = `${target}-01`
    setMonthAnchor(target); setSelectedDate(day)
    if (rangeType !== 'custom') setQuickRange(rangeType, day)
  }
  function choosePreset(preset) {
    const start = preset === 'custom' ? rangeStart || today : today
    setQuickRange(preset, start)
    setRangeType(preset)
    if (preset !== 'custom') { setSelectedDate(start); setMonthAnchor(start.slice(0, 7)) }
  }

  const baseError = base.error
  const periodLabel = rangeStart && rangeEnd ? `${shortDate(rangeStart)} – ${shortDate(rangeEnd)}` : ''
  const title = view === 'month' && monthAnchor ? monthLabel(`${monthAnchor}-01`, zone) : days.length ? `${shortDate(days[0])} – ${shortDate(days.at(-1))}` : ''
  const noProfessionals = baseLoaded && professionals.length === 0
  const noServices = Boolean(professional && services.length === 0)
  const selectedInRange = Boolean(queryRange && selectedDate >= queryRange.startDate && selectedDate <= queryRange.endDate)
  const selectedStatus = availabilityState({ known, loading: queryLoading, inRange: selectedInRange, slotCount: selectedSlots.length })
  const scheduleLink = `/agenda?date=${encodeURIComponent(selectedDate)}${isAdmin && professional ? `&professional=${encodeURIComponent(professional.id)}` : ''}`

  return <main className="availability-page">
    <PageHeader title="Disponibilidad" description="Consulta los horarios libres de tu negocio según el profesional, el servicio y las fechas seleccionadas." />
    {baseError && <Alert tone="error">{baseError}</Alert>}
    {queryError && !baseError && <Alert tone="error">{queryError}</Alert>}
    {baseLoaded && !baseData.business && <Alert tone="error">No se encontró la configuración de este negocio.</Alert>}
    {baseLoaded && baseData.business && <>
      <section className="availability-filters" aria-label="Filtros de disponibilidad">
        {isAdmin && <label className="availability-field"><span>Profesional</span><span className="availability-select-wrap"><UserRound size={17} aria-hidden="true" /><select aria-label="Profesional" value={professionalId} onChange={event => { setProfessionalId(event.target.value); setServiceId('') }}><option value="">Selecciona un profesional</option>{professionals.map(item => <option key={item.id} value={item.id}>{item.displayName || item.name || 'Profesional'}</option>)}</select></span></label>}
        <label className="availability-field"><span>Servicio</span><span className="availability-select-wrap"><BriefcaseBusiness size={17} aria-hidden="true" /><select aria-label="Servicio" value={serviceId} disabled={!professional || noServices} onChange={event => setServiceId(event.target.value)}><option value="">Selecciona un servicio</option>{services.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></span></label>
        <div className="availability-period"><span>Período</span><div className="availability-presets" role="group" aria-label="Rango de fechas">
          {[['today', 'Hoy'], ['7', '7 días'], ['30', '30 días'], ['custom', 'Personalizado']].map(([value, label]) => <button key={value} type="button" aria-pressed={rangeType === value} onClick={() => choosePreset(value)}>{label}</button>)}
        </div></div>
        <div className="availability-date-range"><label>Desde<input aria-label="Fecha de inicio" type="date" value={rangeStart} onChange={event => { setRangeStart(event.target.value); setRangeType('custom') }} /></label><span aria-hidden="true">→</span><label>Hasta<input aria-label="Fecha de fin" type="date" min={rangeStart} value={rangeEnd} onChange={event => { setRangeEnd(event.target.value); setRangeType('custom') }} /></label></div>
      </section>
      {dateRangeError && <Alert tone="error">Selecciona fechas válidas y un rango de hasta 31 días.</Alert>}
      {!dateRangeError && !queryRange && professional && service && <Alert tone="error">No se pudo determinar el período en la zona horaria del negocio.</Alert>}
      {noProfessionals && <EmptyState title="No hay profesionales activos" detail="No hay profesionales disponibles para consultar en este negocio." />}
      {professional && noServices && <EmptyState title="Sin servicios activos asignados" detail="Este profesional no tiene servicios activos vinculados." />}
      {isAdmin && !professional && !noProfessionals && <EmptyState title="Selecciona un profesional" detail="Elige un profesional activo para consultar sus horarios." compact />}
      {professional && !service && !noServices && <p className="availability-hint" role="status">Selecciona uno de los servicios activos asignados a {professional.displayName || professional.name || 'este profesional'}.</p>}
      {professional && service && <>
        <section className="availability-toolbar" aria-label="Vista del calendario">
          <div className="availability-view-toggle" role="group" aria-label="Tipo de vista">
            <button type="button" aria-pressed={view === 'month'} onClick={() => setView('month')}><CalendarDays size={16} />Mes</button>
            <button type="button" aria-pressed={view === 'week'} onClick={() => setView('week')}><Clock3 size={16} />Semana</button>
          </div>
          <div className="availability-calendar-nav"><button type="button" aria-label="Período anterior" onClick={() => navigate(-1)}><ChevronLeft size={20} /></button><h2>{title}</h2><button type="button" aria-label="Período siguiente" onClick={() => navigate(1)}><ChevronRight size={20} /></button><button type="button" className="availability-today" onClick={() => { setSelectedDate(today); setMonthAnchor(today.slice(0, 7)); if (rangeType !== 'custom') setQuickRange(rangeType, today) }}>Hoy</button></div>
          <p className="availability-range-label">{periodLabel}</p>
        </section>
        <div className="availability-workspace">
          <section className="availability-calendar-panel" aria-label="Calendario de disponibilidad">
            {view === 'month' && <div className="availability-weekdays" aria-hidden="true">{dayLabels.map(label => <span key={label}>{label}</span>)}</div>}
            {view === 'month' ? <div className="availability-month-grid">{days.map(day => {
              const status = availabilityState({ known, loading: queryLoading, inRange: Boolean(queryRange && day >= queryRange.startDate && day <= queryRange.endDate), slotCount: counts.get(day) || 0 })
              const isCurrentMonth = day.slice(0, 7) === monthAnchor
              return <button key={day} type="button" className={`availability-day-cell is-${status} ${day === selectedDate ? 'is-selected' : ''} ${day === today ? 'is-today' : ''} ${!isCurrentMonth ? 'is-other-month' : ''}`} aria-pressed={day === selectedDate} aria-label={`${fullDate(day, zone)}, ${statusText(status, counts.get(day))}`} onClick={() => selectDay(day)}>
                <span className="availability-day-number">{Number(day.slice(-2))}</span><span className="availability-day-indicator"><i aria-hidden="true" />{statusShort(status, counts.get(day))}</span>
              </button>
            })}</div> : <div className="availability-week-grid">{days.map(day => {
              const status = availabilityState({ known, loading: queryLoading, inRange: Boolean(queryRange && day >= queryRange.startDate && day <= queryRange.endDate), slotCount: counts.get(day) || 0 })
              return <button key={day} type="button" className={`availability-week-card is-${status} ${day === selectedDate ? 'is-selected' : ''} ${day === today ? 'is-today' : ''}`} aria-pressed={day === selectedDate} aria-label={`${fullDate(day, zone)}, ${statusText(status, counts.get(day))}`} onClick={() => selectDay(day)}><strong>{new Intl.DateTimeFormat('es-BO', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))}</strong><span>{shortDate(day)}</span><b>{counts.get(day) ?? '—'}</b><small>{statusShort(status, counts.get(day))}</small></button>
            })}</div>}
            {queryLoading && <p className="availability-loading" role="status">Consultando reservas y bloqueos del período…</p>}
            <div className="availability-legend" aria-label="Leyenda de estados">
              <strong>Leyenda</strong>{[['available', 'Con horarios'], ['low', 'Poca disponibilidad'], ['empty', 'Sin horarios'], ['not-consulted', 'No consultado']].map(([state, label]) => <span key={state} className={`availability-legend-item is-${state}`}><i aria-hidden="true" />{label}</span>)}
            </div>
          </section>
          <aside className="availability-detail" aria-label="Resumen del día">
            <header><div><h2>Resumen del día</h2><p>{selectedDate ? fullDate(selectedDate, zone) : 'Selecciona una fecha'}</p></div><div className="availability-detail-nav"><button type="button" aria-label="Día anterior" disabled={!selectedDate} onClick={() => selectDay(addDays(selectedDate, -1))}><ArrowLeft size={17} /></button><button type="button" aria-label="Día siguiente" disabled={!selectedDate} onClick={() => selectDay(addDays(selectedDate, 1))}><ArrowRight size={17} /></button></div></header>
            <div className={`availability-summary-state is-${selectedStatus}`}><i aria-hidden="true" /><div><strong>{statusText(selectedStatus, selectedSlots.length)}</strong><span>{!selectedInRange ? 'Selecciona una fecha dentro del período consultado.' : queryLoading ? 'Calculando horarios con los datos del período…' : `${selectedSlots.length} horarios para ${service.name}.`}</span></div></div>
            <div className="availability-detail-facts"><span><UserRound size={17} />{professional.displayName || professional.name || 'Profesional'}</span><span><BriefcaseBusiness size={17} />{service.name}</span><span><Clock3 size={17} />{service.durationMinutes} min · {service.bufferBeforeMinutes || 0} min antes · {service.bufferAfterMinutes || 0} min después</span><span><Globe2 size={17} />Zona horaria: {zone}</span></div>
            {!selectedInRange ? <EmptyState title="Fecha fuera del período consultado" detail="Amplía el rango o selecciona una fecha dentro del período." compact />
              : queryLoading ? <p className="availability-loading" role="status">Cargando horarios de esta fecha…</p>
                : known && selectedSlots.length > 0 ? <SlotGroups slots={selectedSlots} />
                  : known ? <div className="availability-no-slots"><CalendarDays size={22} /><div><strong>No hay horarios disponibles</strong><span>Las reglas de atención, reservas, márgenes y bloqueos determinan este resultado.</span></div></div>
                    : null}
            {known && selectedInRange && <div className="availability-block-note">{dayBlockForSelected.length ? <><Ban size={16} /><span>{dayBlockForSelected.length === 1 ? 'Hay un bloqueo aprobado que se solapa con esta fecha.' : `Hay ${dayBlockForSelected.length} bloqueos aprobados que se solapan con esta fecha.`} Los horarios también dependen de la agenda y las reservas.</span></> : <><Info size={16} /><span>No se encontraron bloqueos aprobados que se solapen con esta fecha.</span></>}</div>}
            <div className="availability-detail-links"><Link to={scheduleLink}><CalendarDays size={16} />Ver agenda del día<ChevronRight size={16} /></Link>{isAdmin && <><Link to={`/bloqueos?fecha=${encodeURIComponent(selectedDate)}&profesional=${encodeURIComponent(professional.id)}`}><Ban size={16} />Gestionar bloqueos<ChevronRight size={16} /></Link><Link to="/profesionales"><UserRound size={16} />Configurar horarios del profesional<ChevronRight size={16} /></Link></>}</div>
          </aside>
        </div>
      </>}
    </>}
    {!baseLoaded && !baseError && <p role="status" className="availability-loading">Cargando profesionales, servicios y horarios del negocio…</p>}
  </main>
}

function SlotGroups({ slots }) {
  const morning = slots.filter(slot => Number(slot.label.slice(0, 2)) < 12)
  const afternoon = slots.filter(slot => Number(slot.label.slice(0, 2)) >= 12 && Number(slot.label.slice(0, 2)) < 18)
  const evening = slots.filter(slot => Number(slot.label.slice(0, 2)) >= 18)
  return <div className="availability-slots" aria-label="Horarios disponibles">
    {morning.length > 0 && <SlotGroup title="Mañana" icon={<Sun size={16} />} slots={morning} />}
    {afternoon.length > 0 && <SlotGroup title="Tarde" icon={<Sun size={16} />} slots={afternoon} />}
    {evening.length > 0 && <SlotGroup title="Noche" icon={<Moon size={16} />} slots={evening} />}
  </div>
}

function SlotGroup({ title, icon, slots }) {
  return <section className="availability-slot-group"><header>{icon}<strong>{title}</strong><span>{slots.length} {slots.length === 1 ? 'horario' : 'horarios'}</span></header><ul>{slots.map(slot => <li key={slot.start}>{slot.label}</li>)}</ul></section>
}

function EmptyState({ title, detail, compact = false }) {
  return <div className={`availability-empty ${compact ? 'is-compact' : ''}`}><CalendarDays size={21} /><div><strong>{title}</strong><span>{detail}</span></div></div>
}

function statusText(status, count = 0) {
  return ({ available: 'Con horarios disponibles', low: 'Poca disponibilidad', empty: 'Sin horarios disponibles', loading: 'Consultando disponibilidad', 'not-consulted': 'No consultado' })[status] || `${count} horarios disponibles`
}
function statusShort(status, count = 0) {
  return ({ available: 'Con horarios', low: 'Pocos horarios', empty: 'Sin horarios', loading: 'Consultando', 'not-consulted': 'Sin información' })[status] || `${count} horarios`
}
