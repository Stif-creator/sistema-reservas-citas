import { markFormSaved } from '../lib/unsavedForms'
import { useSearchParams } from 'react-router-dom'
import { bookingRequest } from '../lib/bookingApi'
import { useRef } from 'react'
import DataList from '../components/ui/DataList'
import { useEffect, useState } from 'react'
import {
  getDoc,
  and,
  collection,
  doc,
  onSnapshot,
  or,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import useProfessionalProfile from '../hooks/useProfessionalProfile'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import Field from '../components/ui/Field'
import { fieldControlClasses } from '../components/ui/fieldStyles'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import EditorDialog from '../components/ui/EditorDialog'
import { CalendarDays, Check, CheckCircle2, Clock3, Eye, Hourglass, Plus, Trash2, Users, X } from 'lucide-react'
import { useFeedback } from '../context/feedback-context'
import './schedule-blocks.css'
import { businessDate } from '../../functions/shared/hours.js'

const REASON_OPTIONS = [
  { value: 'meeting', label: 'Reunión' },
  { value: 'vacation', label: 'Vacaciones' },
  { value: 'personal', label: 'Personal' },
  { value: 'other', label: 'Otro' },
]

const REASON_LABELS = Object.fromEntries(REASON_OPTIONS.map((opt) => [opt.value, opt.label]))

function toDate(value) {
  return value?.toDate ? value.toDate() : new Date(value)
}

function formatRange(startAt, endAt, timeZone, mode = '') {
  const DATE_FMT = new Intl.DateTimeFormat('es-BO', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const TIME_FMT = new Intl.DateTimeFormat('es-BO', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  })
  const start = toDate(startAt)
  const end = toDate(endAt)
  if (mode === 'fullDay') end.setTime(end.getTime() - 1)
  if (mode === 'fullDay' && DATE_FMT.format(start) === DATE_FMT.format(end)) return DATE_FMT.format(start)
  if (mode === 'fullDay') return `${DATE_FMT.format(start)} – ${DATE_FMT.format(end)}`
  if (DATE_FMT.format(start) === DATE_FMT.format(end)) {
    return `${DATE_FMT.format(start)} · ${TIME_FMT.format(start)}–${TIME_FMT.format(end)}`
  }
  return `${DATE_FMT.format(start)} ${TIME_FMT.format(start)} – ${DATE_FMT.format(end)} ${TIME_FMT.format(end)}`
}

function ScheduleBlocks() {
  const { confirm } = useFeedback()
  const [params] = useSearchParams()
  const { currentUser, membership, userDoc } = useAuth()
  const businessId = membership?.businessId
  const isAdmin = membership?.role === 'admin'
  const ownProfile = useProfessionalProfile(businessId, currentUser?.uid, !isAdmin)
  const myProfessionalId = ownProfile.profile?.id
  const myName = userDoc ? `${userDoc.firstName} ${userDoc.lastName}` : 'Ti'

  // --- Lista de bloqueos ---
  const [timeZone, setTimeZone] = useState('')
  const [zoneError, setZoneError] = useState('')
  useEffect(() => {
    let active = true
    if (!businessId) return
    getDoc(doc(db, 'businesses', businessId))
      .then((snap) => {
        if (!snap.exists()) throw new Error('Negocio no disponible')
        const zone = snap.data().settings?.timezone || 'America/La_Paz'
        new Intl.DateTimeFormat('es', { timeZone: zone }).format(new Date())
        if (active) setTimeZone(zone)
      })
      .catch(() => {
        if (active)
          setZoneError(
            'No se pudo cargar la zona horaria. Recarga la página antes de crear bloqueos.'
          )
      })
    return () => {
      active = false
    }
  }, [businessId])

  const [blocks, setBlocks] = useState([])
  const [blocksLoading, setBlocksLoading] = useState(true)
  const [blocksListError, setBlocksListError] = useState('')
  const [actionError, setActionError] = useState('')

  // --- Profesionales (para el selector de alcance del admin y para
  //     mostrar el nombre en el badge de cada bloqueo) ---
  const [professionals, setProfessionals] = useState([])

  // --- Formulario de creación ---
  const [title, setTitle] = useState('')
  const [reason, setReason] = useState(REASON_OPTIONS[0].value)
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [scope, setScope] = useState('all')
  const [selectedProfessionalId, setSelectedProfessionalId] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [mode, setMode] = useState('fullDay')
  const [specificDate, setSpecificDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [statusFilter, setStatusFilter] = useState(params.has('pendientes') ? 'pending' : 'all')
  const [professionalFilter, setProfessionalFilter] = useState('')
  const [scopeFilter, setScopeFilter] = useState('all')
  const [periodFilter, setPeriodFilter] = useState('all')
  const [detailId, setDetailId] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const request = useRef(null)
  const actions = useRef({})

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!businessId) return
    if (!isAdmin && !myProfessionalId) return

    const businessFilter = where('businessId', '==', businessId)
    // where(businessId) + orderBy(startAt) pide un índice compuesto la
    // primera vez (igual que en categorías/servicios). Para el rol
    // profesional, el filtro OR (allProfessionals || professionalId
    // propio) puede pedir un índice adicional. Si ves un error en
    // consola con un link de Firestore, ábrelo y crea el índice.
    const q = isAdmin
      ? query(collection(db, 'scheduleBlocks'), businessFilter, orderBy('startAt'))
      : query(
          collection(db, 'scheduleBlocks'),
          and(
            businessFilter,
            or(
              where('allProfessionals', '==', true),
              where('professionalId', '==', myProfessionalId)
            )
          ),
          orderBy('startAt')
        )

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setBlocks(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
        setBlocksListError('')
        setBlocksLoading(false)
      },
      (err) => {
        console.error('Error al escuchar bloqueos', err)
        setBlocksListError(`${err.code}: ${err.message}`)
        setBlocksLoading(false)
      }
    )

    return () => unsubscribe()
  }, [businessId, isAdmin, myProfessionalId])

  useEffect(() => {
    if (!businessId || !isAdmin) return

    const q = query(collection(db, 'professionals'), where('businessId', '==', businessId))
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
        list.sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''))
        setProfessionals(list)
      },
      () => setActionError('No se pudieron cargar los profesionales. Recarga la página.')
    )

    return () => unsubscribe()
  }, [businessId, isAdmin])

  const activeProfessionals = professionals.filter((p) => p.isActive)
  const selectedBlock = blocks.find(block => block.id === detailId) ?? null
  const weekEnd = now + 7 * 86400000

  function scopeLabel(block) {
    if (block.allProfessionals) return 'Todo el negocio'
    if (isAdmin) {
      return professionals.find((p) => p.id === block.professionalId)?.displayName ?? 'Profesional'
    }
    return myName
  }

  function canDelete(block) {
    return isAdmin || (block.status === 'pending' && block.createdByUserId === currentUser?.uid)
  }

  async function blockAction(block, action) {
    const labels = { blockDelete: 'Eliminar', blockApprove: 'Aprobar', blockReject: 'Rechazar' }
    if (!await confirm({ title: `${labels[action]} bloqueo`, description: action === 'blockApprove' ? `La aprobación volverá a comprobar si hay citas o bloqueos que se crucen con “${block.title}”.` : `${labels[action]}: ${block.title}?`, confirmLabel: labels[action] })) return false
    setActionError('')
    setSaving(true)
    try {
      const key = `${action}_${block.id}`
      actions.current[key] ||= crypto.randomUUID()
      await bookingRequest({ action, businessId, blockId: block.id, requestId: actions.current[key] })
      return true
    } catch (err) { setActionError(err.message); return false }
    finally { setSaving(false) }
  }

  function clearFieldError(key) {
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev))
  }

  function validate() {
    const errors = {}

    if (!title.trim()) {
      errors.title = 'El título es obligatorio.'
    }
    if (mode === 'fullDay') {
      if (!startAt) errors.startAt = 'Selecciona el primer día.'
      if (!endAt) errors.endAt = 'Selecciona el último día.'
      if (startAt && endAt && endAt < startAt) errors.endAt = 'El último día no puede ser anterior al primero.'
    } else {
      if (!specificDate) errors.specificDate = 'Selecciona una fecha.'
      if (!startTime) errors.startTime = 'Selecciona la hora inicial.'
      if (!endTime) errors.endTime = 'Selecciona la hora final.'
      if (startTime && endTime && endTime <= startTime) errors.endTime = 'La hora final debe ser posterior a la inicial.'
      if (specificDate && startTime && timeZone) {
        try { if (businessDate(`${specificDate}T${startTime}`, timeZone).getTime() <= Date.now()) errors.specificDate = 'La hora inicial debe estar en el futuro.' }
        catch { errors.specificDate = 'Selecciona una fecha válida.' }
      }
    }
    if (isAdmin && scope === 'one' && !selectedProfessionalId) {
      errors.selectedProfessionalId = 'Selecciona un profesional.'
    }

    return errors
  }

  function resetForm() {
    setTitle('')
    setReason(REASON_OPTIONS[0].value)
    setStartAt('')
    setEndAt('')
    setScope('all')
    setSelectedProfessionalId('')
    setSpecificDate('')
    setStartTime('')
    setEndTime('')
    setMode('fullDay')
    setFieldErrors({})
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    setFormSuccess('')

    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    if (!timeZone) {
      setFormError('La zona horaria todavía no está disponible.')
      return
    }
    setSaving(true)
    try {
      const isAllProfessionals = isAdmin ? scope === 'all' : false
      const professionalId = isAdmin
        ? isAllProfessionals
          ? null
          : selectedProfessionalId
        : myProfessionalId

      const payload = mode === 'specificHours'
        ? { action: 'blockCreate', mode, businessId, professionalId, allProfessionals: isAllProfessionals, title: title.trim(), reason, date: specificDate, startTime, endTime }
        : { action: 'blockCreate', mode, businessId, professionalId, allProfessionals: isAllProfessionals, title: title.trim(), reason, startDate: startAt, endDate: endAt }
      const signature = JSON.stringify(payload)
      if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() }
      await bookingRequest({ ...payload, requestId: request.current.id })
      request.current = null

      markFormSaved(e.target, true)
      resetForm()
      setCreating(false)
      setFormSuccess(isAdmin ? 'Bloqueo creado.' : 'Solicitud enviada al administrador.')
    } catch (err) {
      console.error('Error al crear el bloqueo', err)
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredBlocks = blocks.filter(block => {
    const status = block.status || 'approved'
    if (statusFilter !== 'all' && status !== statusFilter) return false
    if (professionalFilter && block.professionalId !== professionalFilter) return false
    if (scopeFilter === 'business' && !block.allProfessionals) return false
    if (scopeFilter === 'professional' && block.allProfessionals) return false
    const start = toDate(block.startAt).getTime(), end = toDate(block.endAt).getTime()
    if (periodFilter === 'upcoming' && (end <= now || start >= weekEnd)) return false
    if (periodFilter === 'past' && end > now) return false
    return true
  })
  const pendingCount = blocks.filter(block => (block.status || 'approved') === 'pending').length
  const approvedCount = blocks.filter(block => !block.status || block.status === 'approved').length
  const upcomingCount = blocks.filter(block => (!block.status || block.status === 'approved') && toDate(block.startAt).getTime() < weekEnd && toDate(block.endAt).getTime() > now).length
  const statusNames = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', cancelled: 'Cancelado' }
  const statusTone = status => ({ pending: 'pending', approved: 'approved', rejected: 'rejected', cancelled: 'neutral' })[status || 'approved']

  return (
    <div className="schedule-blocks-page">
      <div className="blocks-heading"><div className="blocks-heading-title"><span className="blocks-heading-icon"><CalendarDays size={24}/></span><PageHeader title="Bloqueos" description="Gestiona ausencias, cierres y períodos no disponibles de tu negocio." /></div><Button onClick={() => { setFormError(''); setFormSuccess(''); setCreating(true) }}><Plus size={19}/>Nuevo bloqueo</Button></div>
      {zoneError && <Alert tone="error">{zoneError}</Alert>}{ownProfile.error && <Alert tone="error">{ownProfile.error}</Alert>}{actionError && <Alert tone="error">{actionError}</Alert>}{formSuccess && <Alert tone="success">{formSuccess}</Alert>}
      <div className="blocks-stats"><article className="blocks-stat blocks-stat-pending"><span><Hourglass size={25}/></span><div><small>Pendientes</small><strong>{pendingCount}</strong><p>Solicitudes por revisar</p></div></article><article className="blocks-stat blocks-stat-approved"><span><CheckCircle2 size={26}/></span><div><small>Aprobados</small><strong>{approvedCount}</strong><p>Bloqueos confirmados</p></div></article><article className="blocks-stat blocks-stat-upcoming"><span><CalendarDays size={26}/></span><div><small>Próximos</small><strong>{upcomingCount}</strong><p>En los próximos 7 días</p></div></article></div>
      <div className="blocks-filter-bar"><div className="blocks-status-tabs" role="group" aria-label="Filtrar por estado">{[['all','Todos'],['pending','Pendientes'],['approved','Aprobados'],['rejected','Rechazados']].map(([key,label])=><button key={key} type="button" className={statusFilter===key?'selected':''} onClick={()=>setStatusFilter(key)}>{label} <span>({key==='all'?blocks.length:blocks.filter(block=>(block.status||'approved')===key).length})</span></button>)}</div><div className="blocks-filters"><label>Profesional<select aria-label="Filtrar por profesional" value={professionalFilter} onChange={e=>setProfessionalFilter(e.target.value)}><option value="">Todos los profesionales</option>{professionals.map(prof=><option key={prof.id} value={prof.id}>{prof.displayName}</option>)}</select></label><label>Alcance<select aria-label="Filtrar por alcance" value={scopeFilter} onChange={e=>setScopeFilter(e.target.value)}><option value="all">Todos los alcances</option><option value="business">Todo el negocio</option><option value="professional">Profesional específico</option></select></label><label>Período<select aria-label="Filtrar por período" value={periodFilter} onChange={e=>setPeriodFilter(e.target.value)}><option value="all">Todas las fechas</option><option value="upcoming">Próximos 7 días</option><option value="past">Anteriores</option></select></label></div></div>
      {blocksListError && <Alert tone="error">Error al cargar bloqueos: {blocksListError}</Alert>}
      {blocksLoading ? <p className="text-sm text-muted">Cargando bloqueos...</p> : <Card className="blocks-table-card"><div className="blocks-table-heading"><h2>Bloqueos programados y solicitudes de ausencia</h2><span>{filteredBlocks.length} registros</span></div><DataList items={filteredBlocks} label="Bloqueos" searchText={block => `${block.title} ${scopeLabel(block)} ${REASON_LABELS[block.reason] || block.reason} ${timeZone ? formatRange(block.startAt,block.endAt,timeZone,block.mode) : ''}`}>
        {rows=><div className="blocks-table-scroll"><table className="blocks-table"><thead><tr><th>Título</th><th>Alcance</th><th>Motivo</th><th>Fecha y hora</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{rows.map(block=><tr key={block.id}><td><strong>{block.title}</strong><small>{block.mode==='specificHours'?'Horario específico':block.mode==='fullDay'?'Días completos':'Bloqueo programado'}</small></td><td><span className="blocks-scope"><Users size={14}/>{scopeLabel(block)}</span></td><td>{REASON_LABELS[block.reason]??block.reason}</td><td className="blocks-date"><CalendarDays size={15}/>{timeZone?formatRange(block.startAt,block.endAt,timeZone,block.mode):'Cargando zona horaria…'}</td><td><span className={`blocks-status-pill ${statusTone(block.status)}`}><i/>{statusNames[block.status||'approved']||block.status}</span></td><td><div className="blocks-row-actions"><Button variant="secondary" className="blocks-view-button" onClick={()=>setDetailId(block.id)}><Eye size={15}/>Ver</Button>{isAdmin&&block.status==='pending'&&<><Button className="blocks-approve-button" disabled={saving} onClick={()=>blockAction(block,'blockApprove')}><Check size={15}/>Aprobar</Button><Button variant="danger" className="blocks-reject-button" disabled={saving} onClick={()=>blockAction(block,'blockReject')}><X size={15}/>Rechazar</Button></>}{canDelete(block)&&<Button variant="danger" className="blocks-delete-button" disabled={saving} onClick={()=>blockAction(block,'blockDelete')}><Trash2 size={15}/>{block.status==='approved'?'Cancelar':'Eliminar'}</Button>}</div></td></tr>)}</tbody></table></div>}
      </DataList></Card>}

      {creating&&<EditorDialog title={isAdmin?'Nuevo bloqueo':'Solicitar ausencia'} description="Define un período durante el cual no se recibirán nuevas reservas." onClose={()=>setCreating(false)} busy={saving}>
        <div className="block-create-modal"><div className="block-mode-switch" role="group" aria-label="Modalidad del bloqueo"><button type="button" aria-pressed={mode==='fullDay'} className={mode==='fullDay'?'active':''} onClick={()=>{setMode('fullDay');setFieldErrors({})}}><CalendarDays size={18}/>Días completos</button><button type="button" aria-pressed={mode==='specificHours'} className={mode==='specificHours'?'active':''} onClick={()=>{setMode('specificHours');setFieldErrors({})}}><Clock3 size={18}/>Horario específico</button></div>
        <form onSubmit={handleSubmit} noValidate className="block-create-form"><div className="block-form-grid"><Field label="Título" htmlFor="title" error={fieldErrors.title}><input id="title" value={title} maxLength={120} onChange={e=>{setTitle(e.target.value);clearFieldError('title')}} placeholder="Ej. Reunión del equipo" className={fieldControlClasses(Boolean(fieldErrors.title))}/></Field><Field label="Motivo" htmlFor="reason"><select id="reason" value={reason} onChange={e=>setReason(e.target.value)} className={fieldControlClasses(false)}>{REASON_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
        {isAdmin&&<><Field label="Alcance" htmlFor="scope"><select id="scope" value={scope} onChange={e=>{setScope(e.target.value);clearFieldError('selectedProfessionalId')}} className={fieldControlClasses(false)}><option value="all">Todo el negocio</option><option value="one">Un profesional</option></select></Field>{scope==='one'&&<Field label="Profesional" htmlFor="selectedProfessionalId" error={fieldErrors.selectedProfessionalId}><select id="selectedProfessionalId" value={selectedProfessionalId} onChange={e=>{setSelectedProfessionalId(e.target.value);clearFieldError('selectedProfessionalId')}} className={fieldControlClasses(Boolean(fieldErrors.selectedProfessionalId))}><option value="">Selecciona un profesional</option>{activeProfessionals.map(prof=><option key={prof.id} value={prof.id}>{prof.displayName}</option>)}</select></Field>}</>}
        {mode==='fullDay'?<><Field label="Primer día" htmlFor="startAt" error={fieldErrors.startAt}><input id="startAt" type="date" value={startAt} onChange={e=>{setStartAt(e.target.value);clearFieldError('startAt');clearFieldError('endAt')}} className={fieldControlClasses(Boolean(fieldErrors.startAt))}/></Field><Field label="Último día (incluido)" htmlFor="endAt" error={fieldErrors.endAt}><input id="endAt" type="date" min={startAt||undefined} value={endAt} onChange={e=>{setEndAt(e.target.value);clearFieldError('endAt')}} className={fieldControlClasses(Boolean(fieldErrors.endAt))}/></Field></>:<><Field label="Fecha" htmlFor="specificDate" error={fieldErrors.specificDate}><input id="specificDate" type="date" value={specificDate} onChange={e=>{setSpecificDate(e.target.value);clearFieldError('specificDate')}} className={fieldControlClasses(Boolean(fieldErrors.specificDate))}/></Field><Field label="Hora inicio" htmlFor="startTime" error={fieldErrors.startTime}><input id="startTime" type="time" value={startTime} onChange={e=>{setStartTime(e.target.value);clearFieldError('startTime');clearFieldError('endTime')}} className={fieldControlClasses(Boolean(fieldErrors.startTime))}/></Field><Field label="Hora fin" htmlFor="endTime" error={fieldErrors.endTime}><input id="endTime" type="time" value={endTime} onChange={e=>{setEndTime(e.target.value);clearFieldError('endTime')}} className={fieldControlClasses(Boolean(fieldErrors.endTime))}/></Field></>}
        </div><Alert>{mode==='fullDay'?'El último día seleccionado también quedará bloqueado.':'El bloqueo afecta únicamente a las horas indicadas en la fecha seleccionada.'} Las horas se interpretan en {timeZone||'la zona horaria del negocio'}. {isAdmin?'El bloqueo se aplicará al confirmarlo.':'La solicitud requiere aprobación del administrador.'}</Alert>{formError&&<Alert tone="error">{formError}</Alert>}
        <div className="block-form-actions"><Button variant="secondary" onClick={()=>setCreating(false)}>Cancelar</Button><Button type="submit" disabled={saving||!timeZone||(!isAdmin&&!myProfessionalId)}><Plus size={16}/>{saving?'Guardando…':isAdmin?'Crear bloqueo':'Enviar solicitud'}</Button></div></form></div>
      </EditorDialog>}

      {selectedBlock && <EditorDialog title="Detalle del bloqueo" description={selectedBlock.title} onClose={() => setDetailId(null)}>
        <div className="block-detail">
          <div className="block-detail-status"><span className={`blocks-status-pill ${statusTone(selectedBlock.status)}`}><i />{statusNames[selectedBlock.status || 'approved'] || selectedBlock.status}</span><span>{selectedBlock.mode === 'specificHours' ? 'Horario específico' : selectedBlock.mode === 'fullDay' ? 'Días completos' : 'Bloqueo programado'}</span></div>
          <dl><div><dt>Motivo</dt><dd>{REASON_LABELS[selectedBlock.reason] ?? selectedBlock.reason}</dd></div><div><dt>Alcance</dt><dd>{scopeLabel(selectedBlock)}</dd></div><div><dt>Período</dt><dd>{timeZone ? formatRange(selectedBlock.startAt, selectedBlock.endAt, timeZone, selectedBlock.mode) : 'Cargando…'}</dd></div>{selectedBlock.createdByUserId && <div><dt>Solicitante</dt><dd>{selectedBlock.createdByUserId === currentUser?.uid ? myName : selectedBlock.createdByUserId}</dd></div>}{selectedBlock.createdAt && <div><dt>Solicitud creada</dt><dd>{new Intl.DateTimeFormat('es-BO', { timeZone: timeZone || 'America/La_Paz', dateStyle: 'medium', timeStyle: 'short' }).format(toDate(selectedBlock.createdAt))}</dd></div>}{selectedBlock.reviewedAt && <div><dt>Revisada</dt><dd>{new Intl.DateTimeFormat('es-BO', { timeZone: timeZone || 'America/La_Paz', dateStyle: 'medium', timeStyle: 'short' }).format(toDate(selectedBlock.reviewedAt))}</dd></div>}</dl>
          {actionError && <Alert tone="error">{actionError}</Alert>}
          <div className="block-detail-actions">{isAdmin && selectedBlock.status === 'pending' && <><Button disabled={saving} onClick={async () => { if (await blockAction(selectedBlock, 'blockApprove')) setDetailId(null) }}><Check size={16} />Aprobar</Button><Button variant="danger" disabled={saving} onClick={async () => { if (await blockAction(selectedBlock, 'blockReject')) setDetailId(null) }}><X size={16} />Rechazar</Button></>}{canDelete(selectedBlock) && <Button variant="danger" disabled={saving} onClick={async () => { if (await blockAction(selectedBlock, 'blockDelete')) setDetailId(null) }}><Trash2 size={16} />{selectedBlock.status === 'approved' ? 'Cancelar bloqueo' : 'Eliminar solicitud'}</Button>}<Button variant="secondary" onClick={() => setDetailId(null)}>Cerrar</Button></div>
        </div>
      </EditorDialog>}
    </div>
  )
}

export default ScheduleBlocks
