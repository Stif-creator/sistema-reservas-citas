import { markFormSaved, confirmDiscard } from '../lib/unsavedForms'
import DataList from '../components/ui/DataList'
import ImageUploadField from '../components/ImageUploadField'
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
import { useAuth } from '../context/auth-context'
import WeeklyHoursEditor from '../components/WeeklyHoursEditor'
import CreateProfessionalForm from '../components/CreateProfessionalForm'
import { hasInvalidWeeklyHoursSlot } from '../lib/hours'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import Field from '../components/ui/Field'
import { fieldControlClasses } from '../components/ui/fieldStyles'
import { DAYS } from '../../functions/shared/hours'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import Badge from '../components/ui/Badge'
import EditorDialog from '../components/ui/EditorDialog'
import AdminSummary from '../components/ui/AdminSummary'
import { MoreVertical, User, Users, Clock, Briefcase, ShieldCheck, Plus, Pencil, Mail, CalendarDays, Phone, Search } from 'lucide-react'
import { useFeedback } from '../context/feedback-context'
import './professionals-page.css'

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

function ProfessionalCard({ professional, services, onEdit, onToggleActive }) {
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

  const assignedServices = services.filter(s => professional.serviceIds?.includes(s.id))

  return (
    <Card className="relative professional-list-card">
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

      <p className="professional-card-email"><Mail size={15} />{professional.email}</p>
      <div className="professional-card-services" aria-label="Servicios asignados">{assignedServices.slice(0,3).map(s => <span key={s.id}>{s.name}</span>)}{assignedServices.length > 3 && <span>+{assignedServices.length - 3}</span>}{!assignedServices.length && <span className="muted">Sin servicios</span>}</div>
      <div className="professional-card-meta"><span><Clock size={15} />{Object.values(professional.weeklyHours || {}).some(slots => slots?.length) ? 'Horario configurado' : 'Horario pendiente'}</span><span><Briefcase size={15} />{professional.serviceIds?.length ?? 0} servicios</span></div>
      <Button variant="secondary" className="professional-card-manage" onClick={() => onEdit(professional)}><Pencil size={16} />Gestionar</Button>
    </Card>
  )
}

function Professionals() {
  const { membership } = useAuth()
  const { confirm } = useFeedback()
  const businessId = membership?.businessId

  // --- Lista de profesionales ---
  const [professionals, setProfessionals] = useState([])
  const [professionalUsers, setProfessionalUsers] = useState([])
  const [professionalsLoading, setProfessionalsLoading] = useState(true)
  const [professionalsListError, setProfessionalsListError] = useState('')
  const [actionError, setActionError] = useState('')

  // --- Lista de servicios (para los checkboxes) ---
  const [services, setServices] = useState([])
  const [categories, setCategories] = useState([])
  const [servicesLoading, setServicesLoading] = useState(true)
  const [servicesListError, setServicesListError] = useState('')

  // --- Editor: qué profesional está abierto ---
  const [editingId, setEditingId] = useState(null)
  const [tab, setTab] = useState('profile')
  const [creating, setCreating] = useState(false)
  const [creatingBusy, setCreatingBusy] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')
  const [serviceSearch, setServiceSearch] = useState('')

  // --- Sección A: datos del perfil ---
  const [jobTitle, setJobTitle] = useState('')
  const [bio, setBio] = useState('')
  const [phone, setPhone] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [imageUploading, setImageUploading] = useState(false)
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
    return onSnapshot(query(collection(db, 'memberships'), where('businessId', '==', businessId)),
      (snapshot) => setProfessionalUsers(snapshot.docs.filter((item) => item.data().role === 'professional').map((item) => item.data().userId)),
      () => setProfessionalsListError('No se pudieron cargar los roles de los profesionales.'))
  }, [businessId])

  useEffect(() => {
    if (!businessId) return
    return onSnapshot(query(collection(db, 'categories'), where('businessId', '==', businessId)),
      snapshot => setCategories(snapshot.docs.map(item => ({ ...item.data(), id: item.id }))),
      error => console.error('Error al cargar categorías de servicios', error))
  }, [businessId])

  useEffect(() => {
    if (!businessId) return

    const q = query(collection(db, 'professionals'), where('businessId', '==', businessId))
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
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

    const q = query(collection(db, 'services'), where('businessId', '==', businessId))
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
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
    if (imageUploading) return
    setEditingId(prof.id)
    setTab('profile')

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

  async function closeEditor() {
    if (!await confirmDiscard(document, confirm)) return
    if (imageUploading) return
    setEditingId(null)
  }

  async function toggleProfessionalActive(prof) {
    if (prof.isActive && !await confirm({ title: '¿Desactivar profesional?', description: 'Dejará de estar disponible para nuevas reservas.', confirmLabel: 'Desactivar profesional' })) return
    setActionError('')
    try {
      const batch = writeBatch(db)
      batch.update(doc(db, 'professionals', prof.id), {
        isActive: !prof.isActive,
        updatedAt: serverTimestamp(),
      })
      batch.update(doc(db, 'memberships', `${businessId}_${prof.userId}`), {
        status: prof.isActive ? 'inactive' : 'active',
        professionalId: prof.id,
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
    if (imageUploading) return
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
        photo: { url: photoUrl.trim() || null, publicId: photoUrl.trim() === (editingProfessional?.photo?.url ?? '') ? (editingProfessional?.photo?.publicId ?? null) : null },
        updatedAt: serverTimestamp(),
      })
      markFormSaved(e.target, false); setProfileSuccess('Perfil actualizado.')
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
      markFormSaved(e.target, false); setHoursSuccess('Horario guardado.')
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
      const existingIds = new Set(services.map((service) => service.id))
      // Keep legacy references to deleted services unless an explicit UI can remove them.
      const newIds = new Set(selectedServiceIds)

      const added = [...newIds].filter((id) => !previousIds.has(id))
      const removed = [...previousIds].filter((id) => existingIds.has(id) && !newIds.has(id))

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
      setSelectedServiceIds(newIds)
      markFormSaved(e.target, false); setSvcAssignSuccess('Servicios asignados actualizados.')
    } catch (err) {
      console.error('Error al actualizar los servicios asignados', err)
      setSvcAssignError('No se pudieron guardar los servicios asignados. Intenta de nuevo.')
    } finally {
      setSvcAssignSaving(false)
    }
  }

  return (
    <div className="professionals-page">
      <PageHeader
        title="Profesionales"
        description="Registra profesionales y administra su perfil, servicios y horario."
      />

      <div className="professionals-heading"><AdminSummary items={[
        { label: 'Profesionales activos', value: professionals.filter(p => p.isActive).length, icon: Users },
        { label: 'Sin servicios asignados', value: professionals.filter(p => !p.serviceIds?.length).length, icon: Briefcase, tone: 'blue' },
        { label: 'Sin horario configurado', value: professionals.filter(p => !Object.values(p.weeklyHours || {}).some(slots => slots.length)).length, icon: Clock, tone: 'green' },
      ]} /><Button onClick={() => setCreating(true)}><Plus size={18} />Registrar profesional</Button></div>
      {creating && <EditorDialog title="Registrar profesional" busy={creatingBusy} onClose={() => setCreating(false)}><CreateProfessionalForm businessId={businessId} onBusyChange={setCreatingBusy} /></EditorDialog>}
      <div className="professionals-filters"><label className="professional-filter-search"><span>Buscar profesionales</span><span className="professional-search-input"><Search size={17}/><input type="search" placeholder="Nombre, correo o especialidad…" value={serviceSearch} onChange={e=>setServiceSearch(e.target.value)}/></span></label><label>Estado<select aria-label="Filtrar estado del profesional" className={fieldControlClasses(false)} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">Todos los estados</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label><label>Servicio<select aria-label="Filtrar servicio del profesional" className={fieldControlClasses(false)} value={serviceFilter} onChange={e => setServiceFilter(e.target.value)}><option value="">Todos los servicios</option>{services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>

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
      ) : professionalUsers.length === 0 ? (
        <p className="text-sm text-muted">
          Todavía no hay profesionales registrados en este negocio.
        </p>
      ) : (
        <DataList label="Profesionales" search={false} items={professionals.filter(prof => professionalUsers.includes(prof.userId) && (!statusFilter || prof.isActive === (statusFilter === 'active')) && (!serviceFilter || prof.serviceIds?.includes(serviceFilter)) && (!serviceSearch.trim() || [prof.displayName,prof.email,prof.jobTitle].some(value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(serviceSearch.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()))))}>{rows => <div className="professionals-grid">
          {rows.map((prof) => (
            <ProfessionalCard
              key={prof.id}
              professional={prof}
              services={services}
              onEdit={loadProfessionalForEdit}
              onToggleActive={toggleProfessionalActive}
            />
          ))}
        </div>}</DataList>
      )}

      {editingProfessional && (
        <EditorDialog title="Gestionar profesional" description="Edita la información, servicios, horarios y permisos del profesional." onClose={closeEditor} busy={imageUploading || profileSaving || hoursSaving || svcAssignSaving}>
          <div className="professional-workspace">
          <div className="professional-editor-identity"><div className="professional-avatar">{editingProfessional.photo?.url ? <img src={photoUrl || editingProfessional.photo.url} alt=""/> : <User size={25}/>}</div><div className="min-w-0"><p className="font-semibold truncate">{editingProfessional.displayName}</p><p className="text-sm text-muted truncate">{editingProfessional.email}</p><p className="professional-job"><Briefcase size={14}/>{jobTitle || 'Puesto sin especificar'}</p></div><Badge tone={editingProfessional.isActive ? 'success' : 'neutral'}>{editingProfessional.isActive ? 'Activo' : 'Inactivo'}</Badge></div>
          <div className="workspace-tabs" role="tablist" aria-label="Editar profesional">{[['profile','Datos personales',User],['services','Servicios',Briefcase],['hours','Horarios',Clock],['access','Acceso',ShieldCheck]].map(([id,label,Icon]) => <button key={id} type="button" role="tab" aria-selected={tab === id} aria-controls={`professional-${id}`} id={`tab-${id}`} onClick={() => setTab(id)}><Icon size={18} />{label}</button>)}</div>
          <div className="professional-editor">

              <section className="professional-panel professional-panel-with-summary" role="tabpanel" id="professional-profile" aria-labelledby="tab-profile" hidden={tab !== 'profile'}>
                <h4 className="mb-4 text-sm font-semibold text-ink">Datos del perfil</h4>
                <form onSubmit={handleProfileSubmit} noValidate className="professional-form-grid">
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

                  <ImageUploadField label="Foto del profesional" value={photoUrl} onChange={setPhotoUrl} businessId={businessId} kind="professional" disabled={profileSaving || imageUploading} onBusyChange={setImageUploading} />

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

                  <Button type="submit" disabled={profileSaving || imageUploading}>
                    {profileSaving ? 'Guardando...' : 'Guardar perfil'}
                  </Button>
                </form>
                <aside className="professional-summary-card" aria-live="polite"><h3>Resumen del profesional</h3><p className="text-sm text-muted">Vista previa de la información actual.</p><div className="professional-summary-person"><div className="professional-avatar">{photoUrl ? <img src={photoUrl} alt=""/> : <User size={24}/>}</div><div className="min-w-0"><strong>{editingProfessional.displayName}</strong><span>{jobTitle || 'Puesto sin especificar'}</span></div><Badge tone={editingProfessional.isActive ? 'success' : 'neutral'}>{editingProfessional.isActive ? 'Activo' : 'Inactivo'}</Badge></div><p><Mail size={15}/>{editingProfessional.email}</p>{phone && <p><Phone size={15}/>{phone}</p>}<div className="professional-summary-divider"/><strong>Servicios asignados <small>{selectedServiceIds.size}</small></strong><div className="professional-summary-tags">{services.filter(s=>selectedServiceIds.has(s.id)).slice(0,4).map(s=><span key={s.id}>{s.name}</span>)}{selectedServiceIds.size>4&&<span>+{selectedServiceIds.size-4}</span>}{!selectedServiceIds.size&&<span className="muted">Sin servicios</span>}</div><p><Clock size={15}/>{Object.values(weeklyHours).some(slots=>slots?.length)?'Horario configurado':'Sin horario configurado'}</p></aside>
              </section>

              <section role="tabpanel" id="professional-services" aria-labelledby="tab-services" hidden={tab !== 'services'}>
                <h4 className="mb-4 text-sm font-semibold text-ink">Servicios asignados</h4>
                {servicesListError && (
                  <Alert tone="error">Error al cargar servicios: {servicesListError}</Alert>
                )}
                <form onSubmit={handleServicesSubmit} className="space-y-4">
                  {!servicesLoading && !servicesListError && [...selectedServiceIds].some((id) => !services.some((service) => service.id === id)) && (
                    <p className="text-sm text-muted">Hay referencias a servicios que ya no existen. Se conservarán para no alterar registros anteriores.</p>
                  )}
                  {servicesLoading ? (
                    <p className="text-sm text-muted">Cargando servicios...</p>
                  ) : services.length === 0 ? (
                    <p className="text-sm text-muted">
                      Todavía no hay servicios creados en este negocio.
                    </p>
                  ) : (
                    <DataList label="Servicios para asignar" items={services} searchText={s => s.name}>{rows => <div className="space-y-2">
                      {rows.map((svc) => (
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
                          <span className="min-w-0 flex-1"><span className="block text-ink">{svc.name}</span><span className="block text-xs text-muted">{categories.find(category=>category.id===svc.categoryId)?.name || 'Sin categoría'}{svc.durationMinutes ? ` · ${svc.durationMinutes} min` : ''}</span></span>
                          {!svc.isActive && <span className="text-xs text-muted">Inactivo</span>}
                        </label>
                      ))}
                    </div>}</DataList>
                  )}
                  <p className="rounded-xl bg-indigo-50 p-4 text-sm text-primary">{selectedServiceIds.size} servicios seleccionados. Solo estos servicios se pueden reservar con este profesional.</p>

                  {svcAssignError && <Alert tone="error">{svcAssignError}</Alert>}
                  {svcAssignSuccess && <Alert tone="success">{svcAssignSuccess}</Alert>}

                  <Button type="submit" disabled={svcAssignSaving || servicesLoading || Boolean(servicesListError)}>
                    {svcAssignSaving ? 'Guardando...' : 'Guardar servicios'}
                  </Button>
                </form>
              </section>

              <section className="professional-panel professional-panel-with-summary" role="tabpanel" id="professional-hours" aria-labelledby="tab-hours" hidden={tab !== 'hours'}>
                <div className="professional-panel-heading"><h4 className="text-sm font-semibold text-ink">Horario semanal</h4><p className="text-sm text-muted">Configura los días y las franjas horarias disponibles para reservas.</p></div>
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
                <aside className="professional-summary-card hours-summary"><h3>Resumen de horario</h3><p className="text-sm text-muted">Se actualiza mientras editas.</p><div className="hours-summary-counts"><span><strong>{Object.values(weeklyHours).filter(slots=>slots?.length).length}</strong>días activos</span><span><strong>{Object.values(weeklyHours).reduce((n,slots)=>n+(slots?.length||0),0)}</strong>franjas</span></div><p className="hours-validity"><CalendarDays size={15}/>Vigente desde {scheduleValidFrom || 'sin fecha'}{scheduleValidUntil ? ` hasta ${scheduleValidUntil}` : ''}</p><div className="hours-day-summary">{DAYS.map(({key,label})=>{const slots=weeklyHours[key]||[];return <p key={key}><strong>{label}</strong><span>{slots.length ? slots.map(slot=>`${slot.start || '—'}–${slot.end || '—'}`).join(', ') : 'Cerrado'}</span></p>})}</div></aside>
              </section>
              <section role="tabpanel" id="professional-access" aria-labelledby="tab-access" hidden={tab !== 'access'}><Card title="Acceso a la cuenta" description="La cuenta y el perfil del profesional mantienen los mismos permisos."><p className="mb-4 text-sm">{editingProfessional.email}</p><Alert>El profesional puede cambiar su clave desde Mi seguridad o recuperar el acceso desde el inicio de sesión.</Alert><div className="mt-5"><Button variant="secondary" onClick={() => toggleProfessionalActive(editingProfessional)}>{editingProfessional.isActive ? 'Desactivar acceso' : 'Activar acceso'}</Button></div></Card></section>
            </div>
          </div>
        </EditorDialog>
      )}
    </div>
  )
}

export default Professionals
