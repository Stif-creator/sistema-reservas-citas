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
import Badge from '../components/ui/Badge'
import { Trash2 } from 'lucide-react'

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

function formatRange(startAt, endAt, timeZone) {
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
  if (DATE_FMT.format(start) === DATE_FMT.format(end)) {
    return `${DATE_FMT.format(start)} · ${TIME_FMT.format(start)}–${TIME_FMT.format(end)}`
  }
  return `${DATE_FMT.format(start)} ${TIME_FMT.format(start)} – ${DATE_FMT.format(end)} ${TIME_FMT.format(end)}`
}

function ScheduleBlocks() {
  const [params, setParams] = useSearchParams()
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
  const request = useRef(null)
  const actions = useRef({})

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
    if (!window.confirm(`${labels[action]}: ${block.title}?`)) return
    setActionError('')
    setSaving(true)
    try {
      const key = `${action}_${block.id}`
      actions.current[key] ||= crypto.randomUUID()
      await bookingRequest({ action, businessId, blockId: block.id, requestId: actions.current[key] })
    } catch (err) { setActionError(err.message) }
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
    if (!startAt) {
      errors.startAt = 'Selecciona fecha de inicio.'
    }
    if (!endAt) {
      errors.endAt = 'Selecciona fecha de fin.'
    }
    if (startAt && endAt && endAt <= startAt) {
      errors.endAt = 'La fecha de fin debe ser posterior a la de inicio.'
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

      const payload = { action: 'blockCreate', businessId, professionalId,
        allProfessionals: isAllProfessionals, title: title.trim(), reason,
        startDate: startAt, endDate: endAt }
      const signature = JSON.stringify(payload)
      if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() }
      await bookingRequest({ ...payload, requestId: request.current.id })
      request.current = null

      markFormSaved(e.target, true)
      resetForm()
      setFormSuccess(isAdmin ? 'Bloqueo creado.' : 'Solicitud enviada al administrador.')
    } catch (err) {
      console.error('Error al crear el bloqueo', err)
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bloqueos"
        description="Gestiona bloqueos por días y solicitudes de ausencia de los profesionales."
      />

      {zoneError && <Alert>{zoneError}</Alert>}
      {ownProfile.error && <Alert tone="error">{ownProfile.error}</Alert>}
      {timeZone && <p className="text-sm text-muted">Todas las horas corresponden a {timeZone}.</p>}
      {params.has('pendientes') && <Button variant="secondary" onClick={() => setParams({})}>Mostrar todos los bloqueos</Button>}
      <div className="admin-workspace-grid"><Card title="Bloqueos programados">
        {blocksListError && <Alert tone="error">Error al cargar bloqueos: {blocksListError}</Alert>}
        {actionError && <Alert tone="error">{actionError}</Alert>}

        {blocksLoading ? (
          <p className="text-sm text-muted">Cargando bloqueos...</p>
        ) : blocks.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay bloqueos programados.</p>
        ) : (
          <DataList items={params.has('pendientes') ? blocks.filter(b => b.status === 'pending') : blocks} label="Bloqueos" searchText={b => `${b.title} ${scopeLabel(b)} ${REASON_LABELS[b.reason] || b.reason} ${timeZone ? formatRange(b.startAt,b.endAt,timeZone) : ""}`}>{rows => <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4">Título</th>
                  <th className="py-2 pr-4">Alcance</th>
                  <th className="py-2 pr-4">Motivo</th>
                  <th className="py-2 pr-4">Fecha y hora</th>
                  <th className="py-2 pr-4">Estado</th><th className="py-2 pr-4">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((block) => (
                  <tr key={block.id}>
                    <td className="py-2.5 pr-4 font-medium text-ink">{block.title}</td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={block.allProfessionals ? 'primary' : 'neutral'}>
                        {scopeLabel(block)}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4 text-muted">
                      {REASON_LABELS[block.reason] ?? block.reason}
                    </td>
                    <td className="py-2.5 pr-4 text-muted">
                      {timeZone
                        ? formatRange(block.startAt, block.endAt, timeZone)
                        : 'Cargando zona horaria…'}
                    </td>
                    <td className="py-2.5 pr-4"><Badge>{({ pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado' })[block.status || 'approved']}</Badge></td>
                    <td className="py-2.5 pr-4">
                      {isAdmin && block.status === 'pending' && <div className="flex gap-2"><Button disabled={saving} onClick={() => blockAction(block, 'blockApprove')}>Aprobar</Button><Button disabled={saving} variant="ghost" onClick={() => blockAction(block, 'blockReject')}>Rechazar</Button></div>}
                      {canDelete(block) && (
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-error"
                          disabled={saving}
                          onClick={() => blockAction(block, 'blockDelete')}
                        >
                          <Trash2 size={14} />
                          Eliminar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}</DataList>
        )}

      </Card>
      <Card title={isAdmin ? "Crear bloqueo" : "Solicitar bloqueo"} description="Define el periodo en el que no se recibirán reservas.">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-4"
        >


          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Título" htmlFor="title" error={fieldErrors.title}>
              <input
                id="title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  clearFieldError('title')
                }}
                className={fieldControlClasses(Boolean(fieldErrors.title))}
              />
            </Field>

            <Field label="Motivo" htmlFor="reason">
              <select
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={fieldControlClasses(false)}
              >
                {REASON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Desde" htmlFor="startAt" error={fieldErrors.startAt}>
              <input
                id="startAt"
                type="date"
                value={startAt}
                onChange={(e) => {
                  setStartAt(e.target.value)
                  clearFieldError('startAt')
                  clearFieldError('endAt')
                }}
                className={fieldControlClasses(Boolean(fieldErrors.startAt))}
              />
            </Field>

            <Field label="Hasta" htmlFor="endAt" error={fieldErrors.endAt}>
              <input
                id="endAt"
                type="date"
                value={endAt}
                onChange={(e) => {
                  setEndAt(e.target.value)
                  clearFieldError('endAt')
                }}
                className={fieldControlClasses(Boolean(fieldErrors.endAt))}
              />
            </Field>
          </div>

          {isAdmin && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Alcance" htmlFor="scope">
                <select
                  id="scope"
                  value={scope}
                  onChange={(e) => {
                    setScope(e.target.value)
                    clearFieldError('selectedProfessionalId')
                  }}
                  className={fieldControlClasses(false)}
                >
                  <option value="all">Todo el negocio</option>
                  <option value="one">Un profesional específico</option>
                </select>
              </Field>

              {scope === 'one' && (
                <Field
                  label="Profesional"
                  htmlFor="selectedProfessionalId"
                  error={fieldErrors.selectedProfessionalId}
                >
                  <select
                    id="selectedProfessionalId"
                    value={selectedProfessionalId}
                    onChange={(e) => {
                      setSelectedProfessionalId(e.target.value)
                      clearFieldError('selectedProfessionalId')
                    }}
                    className={fieldControlClasses(Boolean(fieldErrors.selectedProfessionalId))}
                  >
                    <option value="" disabled>
                      Selecciona un profesional
                    </option>
                    {activeProfessionals.map((prof) => (
                      <option key={prof.id} value={prof.id}>
                        {prof.displayName}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          )}

          <Alert>El periodo comienza a las 00:00 del inicio y termina a las 00:00 del fin (no incluye ese último día). Para bloquear un día, selecciona el siguiente como fin. Las solicitudes requieren aprobación del administrador.</Alert>
          {formError && <Alert tone="error">{formError}</Alert>}
          {formSuccess && <Alert tone="success">{formSuccess}</Alert>}

          <Button type="submit" disabled={saving || !timeZone || (!isAdmin && !myProfessionalId)}>
            {saving ? 'Guardando...' : isAdmin ? 'Crear bloqueo' : 'Solicitar bloqueo'}
          </Button>
        </form>
      </Card></div>
    </div>
  )
}

export default ScheduleBlocks
