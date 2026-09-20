import { useEffect, useState } from 'react'
import {
  Timestamp,
  addDoc,
  and,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  or,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import Field, { fieldControlClasses } from '../components/ui/Field'
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

const DATE_FMT = new Intl.DateTimeFormat('es-BO', { day: '2-digit', month: 'short', year: 'numeric' })
const TIME_FMT = new Intl.DateTimeFormat('es-BO', { hour: '2-digit', minute: '2-digit' })

function toDate(value) {
  return value?.toDate ? value.toDate() : new Date(value)
}

function formatRange(startAt, endAt) {
  const start = toDate(startAt)
  const end = toDate(endAt)
  if (start.toDateString() === end.toDateString()) {
    return `${DATE_FMT.format(start)} · ${TIME_FMT.format(start)}–${TIME_FMT.format(end)}`
  }
  return `${DATE_FMT.format(start)} ${TIME_FMT.format(start)} – ${DATE_FMT.format(end)} ${TIME_FMT.format(end)}`
}

function ScheduleBlocks() {
  const { currentUser, membership, userDoc } = useAuth()
  const businessId = membership?.businessId
  const isAdmin = membership?.role === 'admin'
  const myProfessionalId = currentUser && businessId ? `${businessId}_${currentUser.uid}` : null
  const myName = userDoc ? `${userDoc.firstName} ${userDoc.lastName}` : 'Ti'

  // --- Lista de bloqueos ---
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

  useEffect(() => {
    if (!businessId) return
    if (!isAdmin && !myProfessionalId) return

    setBlocksLoading(true)
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
            or(where('allProfessionals', '==', true), where('professionalId', '==', myProfessionalId))
          ),
          orderBy('startAt')
        )

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setBlocks(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
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
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''))
      setProfessionals(list)
    })

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
    return isAdmin || block.createdByUserId === currentUser?.uid
  }

  async function handleDelete(block) {
    setActionError('')
    try {
      await deleteDoc(doc(db, 'scheduleBlocks', block.id))
    } catch (err) {
      console.error('Error al eliminar bloqueo', err)
      setActionError('No se pudo eliminar el bloqueo. Intenta de nuevo.')
    }
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
      errors.startAt = 'Selecciona fecha y hora de inicio.'
    }
    if (!endAt) {
      errors.endAt = 'Selecciona fecha y hora de fin.'
    }
    if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
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

    setSaving(true)
    try {
      const isAllProfessionals = isAdmin ? scope === 'all' : false
      const professionalId = isAdmin
        ? isAllProfessionals
          ? null
          : selectedProfessionalId
        : myProfessionalId

      const blockRef = await addDoc(collection(db, 'scheduleBlocks'), {
        businessId,
        professionalId,
        allProfessionals: isAllProfessionals,
        title: title.trim(),
        reason,
        startAt: Timestamp.fromDate(new Date(startAt)),
        endAt: Timestamp.fromDate(new Date(endAt)),
        createdByUserId: currentUser.uid,
        createdAt: serverTimestamp(),
      })
      await updateDoc(blockRef, { id: blockRef.id })

      resetForm()
      setFormSuccess('Bloqueo creado.')
    } catch (err) {
      console.error('Error al crear el bloqueo', err)
      setFormError('No se pudo crear el bloqueo. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bloqueos"
        description="Bloquea franjas de horario para todo el negocio o para un profesional específico."
      />

      <Card title="Bloqueos programados">
        {blocksListError && <Alert tone="error">Error al cargar bloqueos: {blocksListError}</Alert>}
        {actionError && <Alert tone="error">{actionError}</Alert>}

        {blocksLoading ? (
          <p className="text-sm text-muted">Cargando bloqueos...</p>
        ) : blocks.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay bloqueos programados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4">Título</th>
                  <th className="py-2 pr-4">Alcance</th>
                  <th className="py-2 pr-4">Motivo</th>
                  <th className="py-2 pr-4">Fecha y hora</th>
                  <th className="py-2 pr-4">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {blocks.map((block) => (
                  <tr key={block.id}>
                    <td className="py-2.5 pr-4 font-medium text-ink">{block.title}</td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={block.allProfessionals ? 'primary' : 'neutral'}>{scopeLabel(block)}</Badge>
                    </td>
                    <td className="py-2.5 pr-4 text-muted">{REASON_LABELS[block.reason] ?? block.reason}</td>
                    <td className="py-2.5 pr-4 text-muted">{formatRange(block.startAt, block.endAt)}</td>
                    <td className="py-2.5 pr-4">
                      {canDelete(block) && (
                        <Button variant="ghost" className="px-2 py-1 text-error" onClick={() => handleDelete(block)}>
                          <Trash2 size={14} />
                          Eliminar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4 border-t border-border pt-6">
          <h4 className="text-sm font-semibold text-ink">Nuevo bloqueo</h4>

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
                type="datetime-local"
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
                type="datetime-local"
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

          {formError && <Alert tone="error">{formError}</Alert>}
          {formSuccess && <Alert tone="success">{formSuccess}</Alert>}

          <Button type="submit" disabled={saving}>
            {saving ? 'Guardando...' : 'Crear bloqueo'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

export default ScheduleBlocks
