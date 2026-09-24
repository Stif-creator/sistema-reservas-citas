import { useEffect, useRef, useState } from 'react'
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import WeeklyHoursEditor from '../components/WeeklyHoursEditor'
import { hasInvalidWeeklyHoursSlot } from '../lib/hours'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import Field, { fieldControlClasses } from '../components/ui/Field'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import Badge from '../components/ui/Badge'
import { MoreVertical, User, X } from 'lucide-react'

const PHONE_REGEX = /^\+?\d{8,}$/

function todayDateString() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function initialsFor(text) {
  return (text || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('')
}

function ProfessionalCard({ professional, onEdit, onToggleActive }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const bioSnippet =
    professional.bio && professional.bio.length > 60
      ? `${professional.bio.slice(0, 60)}…`
      : professional.bio

  return (
    <Card className="relative">
      <div className="flex items-start gap-3">
        {professional.photo?.url ? (
          <img
            src={professional.photo.url}
            alt={professional.displayName}
            className="h-12 w-12 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-primary">
            {initialsFor(professional.displayName) || <User size={18} />}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{professional.displayName}</p>
          {professional.jobTitle && (
            <p className="truncate text-xs text-muted">{professional.jobTitle}</p>
          )}
        </div>

        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-ink"
            aria-label="Más acciones"
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-lg border border-border bg-surface py-1 shadow-card">
              <button
                type="button"
                onClick={() => {
                  onToggleActive(professional)
                  setMenuOpen(false)
                }}
                className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-slate-50"
              >
                {professional.isActive ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3">
        <Badge tone={professional.isActive ? 'success' : 'neutral'}>
          {professional.isActive ? 'Activo' : 'Inactivo'}
        </Badge>
      </div>

      {bioSnippet && <p className="mt-3 text-sm text-muted">{bioSnippet}</p>}

      <p className="mt-3 text-xs text-muted">
        {professional.serviceIds?.length ?? 0} servicio
        {professional.serviceIds?.length === 1 ? '' : 's'} asignado
        {professional.serviceIds?.length === 1 ? '' : 's'}
      </p>

      <Button variant="secondary" className="mt-4 w-full" onClick={() => onEdit(professional)}>
        Editar
      </Button>
    </Card>
  )
}

function Professionals() {
  const { membership } = useAuth()
  const businessId = membership?.businessId

  // --- Lista de profesionales ---
  const [professionals, setProfessionals] = useState([])
  const [professionalsLoading, setProfessionalsLoading] = useState(true)
  const [professionalsListError, setProfessionalsListError] = useState('')
  const [actionError, setActionError] = useState('')

  // --- Lista de servicios (para los checkboxes) ---
  const [services, setServices] = useState([])
  const [servicesLoading, setServicesLoading] = useState(true)
  const [servicesListError, setServicesListError] = useState('')

  // --- Editor: qué profesional está abierto ---
  const [editingId, setEditingId] = useState(null)

  // --- Sección A: datos del perfil ---
  const [jobTitle, setJobTitle] = useState('')
  const [bio, setBio] = useState('')
  const [phone, setPhone] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [profileFieldErrors, setProfileFieldErrors] = useState({})
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)

  // --- Sección B: servicios asignados ---
  const [selectedServiceIds, setSelectedServiceIds] = useState(new Set())
  const [svcAssignError, setSvcAssignError] = useState('')
  const [svcAssignSuccess, setSvcAssignSuccess] = useState('')
  const [svcAssignSaving, setSvcAssignSaving] = useState(false)

  // --- Sección C: horario semanal ---
  const [weeklyHours, setWeeklyHours] = useState({})
  const [scheduleValidFrom, setScheduleValidFrom] = useState(todayDateString())
  const [scheduleValidUntil, setScheduleValidUntil] = useState('')
  const [hoursError, setHoursError] = useState('')
  const [hoursSuccess, setHoursSuccess] = useState('')
  const [hoursSaving, setHoursSaving] = useState(false)

  useEffect(() => {
    if (!businessId) return

    setProfessionalsLoading(true)
    const q = query(collection(db, 'professionals'), where('businessId', '==', businessId))
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        list.sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''))
        setProfessionals(list)
        setProfessionalsListError('')
        setProfessionalsLoading(false)
      },
      (err) => {
        console.error('Error al escuchar profesionales', err)
        setProfessionalsListError(`${err.code}: ${err.message}`)
        setProfessionalsLoading(false)
      }
    )

    return () => unsubscribe()
  }, [businessId])

  useEffect(() => {
    if (!businessId) return

    setServicesLoading(true)
    const q = query(collection(db, 'services'), where('businessId', '==', businessId))
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        list.sort((a, b) => a.name.localeCompare(b.name))
        setServices(list)
        setServicesListError('')
        setServicesLoading(false)
      },
      (err) => {
        console.error('Error al escuchar servicios', err)
        setServicesListError(`${err.code}: ${err.message}`)
        setServicesLoading(false)
      }
    )

    return () => unsubscribe()
  }, [businessId])

  const editingProfessional = professionals.find((p) => p.id === editingId) ?? null

  function loadProfessionalForEdit(prof) {
    setEditingId(prof.id)

    setJobTitle(prof.jobTitle ?? '')
    setBio(prof.bio ?? '')
    setPhone(prof.phone ?? '')
    setPhotoUrl(prof.photo?.url ?? '')
    setProfileFieldErrors({})
    setProfileError('')
    setProfileSuccess('')

    setSelectedServiceIds(new Set(prof.serviceIds ?? []))
    setSvcAssignError('')
    setSvcAssignSuccess('')

    setWeeklyHours(prof.weeklyHours ?? {})
    setScheduleValidFrom(prof.scheduleValidFrom ?? todayDateString())
    setScheduleValidUntil(prof.scheduleValidUntil ?? '')
    setHoursError('')
    setHoursSuccess('')
  }

  function closeEditor() {
    setEditingId(null)
  }

  async function toggleProfessionalActive(prof) {
    setActionError('')
    try {
      const batch = writeBatch(db)
      batch.update(doc(db, 'professionals', prof.id), {
        isActive: !prof.isActive,
        updatedAt: serverTimestamp(),
      })
      batch.update(doc(db, 'memberships', `${businessId}_${prof.userId}`), {
        status: prof.isActive ? 'inactive' : 'active',
      })
      await batch.commit()
    } catch (err) {
      console.error('Error al actualizar profesional', err)
      setActionError('No se pudo actualizar el profesional. Intenta de nuevo.')
    }
  }

  // ---------- Sección A: perfil ----------

  function clearProfileFieldError(key) {
    setProfileFieldErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev))
  }

  function validateProfile() {
    const errors = {}
    if (phone.trim() && !PHONE_REGEX.test(phone.trim())) {
      errors.phone =
        'Ingresa un teléfono válido: solo dígitos (puede empezar con "+"), mínimo 8 dígitos.'
    }
    return errors
  }

  async function handleProfileSubmit(e) {
    e.preventDefault()
    setProfileError('')
    setProfileSuccess('')

    const errors = validateProfile()
    setProfileFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setProfileSaving(true)
    try {
      await updateDoc(doc(db, 'professionals', editingId), {
        jobTitle: jobTitle.trim(),
        bio: bio.trim(),
        phone: phone.trim(),
        photo: { url: photoUrl.trim() || null, publicId: null },
        updatedAt: serverTimestamp(),
      })
      setProfileSuccess('Perfil actualizado.')
    } catch (err) {
      console.error('Error al actualizar el perfil del profesional', err)
      setProfileError('No se pudo guardar el perfil. Intenta de nuevo.')
    } finally {
      setProfileSaving(false)
    }
  }

  // ---------- Sección C: horario semanal ----------

  async function handleHoursSubmit(e) {
    e.preventDefault()
    setHoursError('')
    setHoursSuccess('')

    if (hasInvalidWeeklyHoursSlot(weeklyHours)) {
      setHoursError(
        'Completa las franjas, coloca el fin después del inicio y evita horarios superpuestos.'
      )
      return
    }

    if (scheduleValidFrom && scheduleValidUntil && scheduleValidUntil < scheduleValidFrom) {
      setHoursError('La fecha final no puede ser anterior a la fecha inicial.')
      return
    }

    setHoursSaving(true)
    try {
      await updateDoc(doc(db, 'professionals', editingId), {
        weeklyHours,
        scheduleValidFrom: scheduleValidFrom || null,
        scheduleValidUntil: scheduleValidUntil || null,
        updatedAt: serverTimestamp(),
      })
      setHoursSuccess('Horario guardado.')
    } catch (err) {
      console.error('Error al guardar el horario del profesional', err)
      setHoursError('No se pudo guardar el horario. Intenta de nuevo.')
    } finally {
      setHoursSaving(false)
    }
  }

  // ---------- Sección B: servicios asignados ----------

  function toggleServiceSelected(serviceId) {
    setSelectedServiceIds((prev) => {
      const next = new Set(prev)
      if (next.has(serviceId)) {
        next.delete(serviceId)
      } else {
        next.add(serviceId)
      }
      return next
    })
  }

  async function handleServicesSubmit(e) {
    e.preventDefault()
    setSvcAssignError('')
    setSvcAssignSuccess('')

    setSvcAssignSaving(true)
    try {
      const previousIds = new Set(editingProfessional?.serviceIds ?? [])
      const newIds = selectedServiceIds

      const added = [...newIds].filter((id) => !previousIds.has(id))
      const removed = [...previousIds].filter((id) => !newIds.has(id))

      const batch = writeBatch(db)

      batch.update(doc(db, 'professionals', editingId), {
        serviceIds: [...newIds],
        updatedAt: serverTimestamp(),
      })

      added.forEach((serviceId) => {
        batch.update(doc(db, 'services', serviceId), {
          professionalIds: arrayUnion(editingId),
        })
      })

      removed.forEach((serviceId) => {
        batch.update(doc(db, 'services', serviceId), {
          professionalIds: arrayRemove(editingId),
        })
      })

      await batch.commit()
      setSvcAssignSuccess('Servicios asignados actualizados.')
    } catch (err) {
      console.error('Error al actualizar los servicios asignados', err)
      setSvcAssignError('No se pudieron guardar los servicios asignados. Intenta de nuevo.')
    } finally {
      setSvcAssignSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Profesionales"
        description="Los profesionales se registran ellos mismos; aquí solo administras su perfil, servicios y horario."
      />

      {professionalsListError && (
        <div className="mb-4">
          <Alert tone="error">Error al cargar profesionales: {professionalsListError}</Alert>
        </div>
      )}
      {actionError && (
        <div className="mb-4">
          <Alert tone="error">{actionError}</Alert>
        </div>
      )}

      {professionalsLoading ? (
        <p className="text-sm text-muted">Cargando profesionales...</p>
      ) : professionals.length === 0 ? (
        <p className="text-sm text-muted">
          Todavía no hay profesionales registrados en este negocio.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {professionals.map((prof) => (
            <ProfessionalCard
              key={prof.id}
              professional={prof}
              onEdit={loadProfessionalForEdit}
              onToggleActive={toggleProfessionalActive}
            />
          ))}
        </div>
      )}

      {editingProfessional && (
        <>
          <button
            type="button"
            aria-label="Cerrar panel"
            onClick={closeEditor}
            className="fixed inset-0 z-40 bg-ink/30"
          />

          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-l border-border bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-ink">
                  {editingProfessional.displayName}
                </h3>
                <p className="truncate text-sm text-muted">{editingProfessional.email}</p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="shrink-0 rounded-lg p-2 text-muted hover:bg-slate-100"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-8 px-6 py-6">
              <section>
                <h4 className="mb-4 text-sm font-semibold text-ink">Datos del perfil</h4>
                <form onSubmit={handleProfileSubmit} noValidate className="space-y-4">
                  <Field label="Puesto" htmlFor="jobTitle">
                    <input
                      id="jobTitle"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      className={fieldControlClasses(false)}
                    />
                  </Field>

                  <Field label="Biografía" htmlFor="bio">
                    <textarea
                      id="bio"
                      rows={3}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      className={fieldControlClasses(false)}
                    />
                  </Field>

                  <Field label="Teléfono" htmlFor="phone" error={profileFieldErrors.phone}>
                    <input
                      id="phone"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value)
                        clearProfileFieldError('phone')
                      }}
                      className={fieldControlClasses(Boolean(profileFieldErrors.phone))}
                    />
                  </Field>

                  <Field label="URL de la foto" htmlFor="photoUrl">
                    <input
                      id="photoUrl"
                      value={photoUrl}
                      onChange={(e) => setPhotoUrl(e.target.value)}
                      className={fieldControlClasses(false)}
                    />
                    {photoUrl && (
                      <img
                        src={photoUrl}
                        alt="Vista previa de la foto"
                        className="mt-2 h-16 w-16 rounded-full border border-border object-cover"
                      />
                    )}
                  </Field>

                  <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                    <span className="text-sm text-ink">Profesional activo</span>
                    <button
                      type="button"
                      onClick={() => toggleProfessionalActive(editingProfessional)}
                      aria-pressed={editingProfessional.isActive}
                      aria-label="Alternar profesional activo"
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        editingProfessional.isActive ? 'bg-primary' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          editingProfessional.isActive ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {profileError && <Alert tone="error">{profileError}</Alert>}
                  {profileSuccess && <Alert tone="success">{profileSuccess}</Alert>}

                  <Button type="submit" disabled={profileSaving}>
                    {profileSaving ? 'Guardando...' : 'Guardar perfil'}
                  </Button>
                </form>
              </section>

              <section className="border-t border-border pt-6">
                <h4 className="mb-4 text-sm font-semibold text-ink">Servicios asignados</h4>
                {servicesListError && (
                  <Alert tone="error">Error al cargar servicios: {servicesListError}</Alert>
                )}
                <form onSubmit={handleServicesSubmit} className="space-y-4">
                  {servicesLoading ? (
                    <p className="text-sm text-muted">Cargando servicios...</p>
                  ) : services.length === 0 ? (
                    <p className="text-sm text-muted">
                      Todavía no hay servicios creados en este negocio.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {services.map((svc) => (
                        <label
                          key={svc.id}
                          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedServiceIds.has(svc.id)}
                            onChange={() => toggleServiceSelected(svc.id)}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                          />
                          <span className="text-ink">{svc.name}</span>
                          {!svc.isActive && <span className="text-xs text-muted">(inactivo)</span>}
                        </label>
                      ))}
                    </div>
                  )}

                  {svcAssignError && <Alert tone="error">{svcAssignError}</Alert>}
                  {svcAssignSuccess && <Alert tone="success">{svcAssignSuccess}</Alert>}

                  <Button type="submit" disabled={svcAssignSaving || services.length === 0}>
                    {svcAssignSaving ? 'Guardando...' : 'Guardar servicios'}
                  </Button>
                </form>
              </section>

              <section className="border-t border-border pt-6">
                <h4 className="mb-4 text-sm font-semibold text-ink">Horario semanal</h4>
                <form onSubmit={handleHoursSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Vigente desde" htmlFor="scheduleValidFrom">
                      <input
                        id="scheduleValidFrom"
                        type="date"
                        value={scheduleValidFrom}
                        onChange={(e) => setScheduleValidFrom(e.target.value)}
                        className={fieldControlClasses(false)}
                      />
                    </Field>

                    <Field label="Vigente hasta (opcional)" htmlFor="scheduleValidUntil">
                      <input
                        id="scheduleValidUntil"
                        type="date"
                        min={scheduleValidFrom || undefined}
                        value={scheduleValidUntil}
                        onChange={(e) => setScheduleValidUntil(e.target.value)}
                        className={fieldControlClasses(false)}
                      />
                    </Field>
                  </div>

                  <WeeklyHoursEditor value={weeklyHours} onChange={setWeeklyHours} />

                  {hoursError && <Alert tone="error">{hoursError}</Alert>}
                  {hoursSuccess && <Alert tone="success">{hoursSuccess}</Alert>}

                  <Button type="submit" disabled={hoursSaving}>
                    {hoursSaving ? 'Guardando...' : 'Guardar horario'}
                  </Button>
                </form>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default Professionals
