import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { BriefcaseBusiness, Check, ChevronLeft, ChevronRight, Clock3, Eye, Info, Pencil, Plus, Scissors, Search, Users } from 'lucide-react'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'
import { useFeedback } from '../context/feedback-context'
import { confirmDiscard, markFormSaved } from '../lib/unsavedForms'
import { safeImageUrl } from '../lib/brand'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import Badge from '../components/ui/Badge'
import Field from '../components/ui/Field'
import EditorDialog from '../components/ui/EditorDialog'
import ImageUploadField from '../components/ImageUploadField'
import { fieldControlClasses } from '../components/ui/fieldStyles'
import './services-page.css'

const PAGE_SIZE = 10
export default function Services() {
  const { membership } = useAuth()
  return <ServicesContent key={`${membership?.businessId || 'none'}-${membership?.role || 'none'}`} />
}

function ServicesContent() {
  const { membership, currentUser, isSuperadmin } = useAuth()
  const { confirm, notify } = useFeedback()
  const businessId = membership?.businessId
  const isProfessional = membership?.role === 'professional'
  const [profileProfessional, setProfileProfessional] = useState(null)
  const professionalKey = `${businessId || ''}_${currentUser?.uid || ''}`
  const profileProfessionalId = profileProfessional?.key === professionalKey ? profileProfessional.id : ''
  const professionalId = isProfessional && currentUser ? profileProfessionalId || membership.professionalId || `${businessId}_${currentUser.uid}` : ''
  const [categories, setCategories] = useState([])
  const [services, setServices] = useState([])
  const [professionals, setProfessionals] = useState([])
  const [businessName, setBusinessName] = useState('')
  const [currencyCode, setCurrencyCode] = useState('')
  const [loadedBusinessId, setLoadedBusinessId] = useState('')
  const [loadError, setLoadError] = useState(null)
  const [dialogError, setDialogError] = useState('')
  const [queryText, setQueryText] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort] = useState('name')
  const [page, setPage] = useState(1)
  const [dialog, setDialog] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const loading = Boolean(businessId && loadedBusinessId !== businessId)
  const error = loadError?.businessId === businessId ? loadError.message : ''

  useEffect(() => {
    if (!isProfessional || !businessId || !currentUser) return undefined
    return onSnapshot(query(collection(db, 'professionals'), where('businessId', '==', businessId), where('userId', '==', currentUser.uid)), snapshot => {
      setProfileProfessional({ key: professionalKey, id: snapshot.docs[0]?.id || '' })
    }, () => setProfileProfessional({ key: professionalKey, id: '' }))
  }, [businessId, currentUser, isProfessional, professionalKey])

  useEffect(() => {
    if (!businessId) return undefined
    let active = true
    const categoryQuery = query(collection(db, 'categories'), where('businessId', '==', businessId), orderBy('displayOrder'))
    const serviceQuery = isProfessional
      ? query(collection(db, 'services'), where('businessId', '==', businessId), where('professionalIds', 'array-contains', professionalId))
      : query(collection(db, 'services'), where('businessId', '==', businessId))
    let categoriesReady = false, servicesReady = false
    const finishLoading = () => { if (active && categoriesReady && servicesReady) setLoadedBusinessId(businessId) }
    const stopCategories = onSnapshot(categoryQuery, snapshot => { setCategories(snapshot.docs.map(item => ({ ...item.data(), id: item.id }))); categoriesReady = true; finishLoading() }, reason => { setLoadError({ businessId, message:`No se pudieron cargar las categorías: ${reason.message}` }); categoriesReady = true; finishLoading() })
    const stopServices = onSnapshot(serviceQuery, snapshot => { setServices(snapshot.docs.map(item => ({ ...item.data(), id: item.id }))); servicesReady = true; finishLoading() }, reason => { setLoadError({ businessId, message:`No se pudieron cargar los servicios: ${reason.message}` }); servicesReady = true; finishLoading() })
    const stopProfessionals = isProfessional ? undefined : onSnapshot(query(collection(db, 'professionals'), where('businessId', '==', businessId)), snapshot => setProfessionals(snapshot.docs.map(item => ({ ...item.data(), id: item.id }))))
    getDoc(doc(db, 'businesses', businessId)).then(snapshot => {
      if (active && snapshot.exists()) { setCurrencyCode(snapshot.data()?.settings?.currencyCode || ''); setBusinessName(snapshot.data()?.name || '') }
    }).catch(() => { if (active) setCurrencyCode('') })
    return () => { active = false; stopCategories(); stopServices(); stopProfessionals?.() }
  }, [businessId, isProfessional, professionalId])

  const visible = useMemo(() => {
    const needle = queryText.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    return services.filter(service => {
      const category = categories.find(item => item.id === service.categoryId)?.name || ''
      const matchesText = !needle || `${service.name || ''} ${service.description || ''} ${category}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(needle)
      return matchesText && (categoryFilter === 'all' || service.categoryId === categoryFilter) && (statusFilter === 'all' || service.isActive === (statusFilter === 'active'))
    }).sort((a, b) => {
      if (sort === 'price') return (a.price || 0) - (b.price || 0)
      if (sort === 'duration') return (a.durationMinutes || 0) - (b.durationMinutes || 0)
      return (a.name || '').localeCompare(b.name || '', 'es')
    })
  }, [services, categories, queryText, categoryFilter, statusFilter, sort])
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const rows = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function openCreate() {
    setDialogError('')
    setDialog({ mode: 'create', service: { isActive: true, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, image: { url: '' } } })
  }
  function openEdit(service) { setDialogError(''); setDialog({ mode: 'edit', service }) }
  function openDetails(service) { setDialog({ mode: 'details', service }) }

  async function saveService(event, values) {
    event.preventDefault()
    if (saving || uploading) return
    const form = event.currentTarget
    const formData = new FormData(form)
    const name = String(formData.get('name') || '').trim()
    const description = String(formData.get('description') || '').trim()
    const categoryId = String(formData.get('categoryId') || '')
    const price = Number(formData.get('price'))
    const durationMinutes = Number(formData.get('durationMinutes'))
    const bufferBeforeMinutes = Number(formData.get('bufferBeforeMinutes') || 0)
    const bufferAfterMinutes = Number(formData.get('bufferAfterMinutes') || 0)
    const category = categories.find(item => item.id === categoryId && item.businessId === businessId)
    if (!name || name.length > 100) return setDialogError('El nombre es obligatorio y debe tener hasta 100 caracteres.')
    if (!category || (!category.isActive && categoryId !== dialog.service.categoryId)) return setDialogError('Selecciona una categoría activa de este negocio.')
    if (!Number.isFinite(price) || price <= 0) return setDialogError('El precio debe ser mayor a 0.')
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) return setDialogError('La duración debe ser un número entero mayor a 0.')
    if (![bufferBeforeMinutes, bufferAfterMinutes].every(value => Number.isInteger(value) && value >= 0)) return setDialogError('Los márgenes deben ser números enteros iguales o mayores a 0.')
    if (!currencyCode) return setDialogError('Espera a que se cargue la moneda del negocio y vuelve a intentar.')
    setDialogError(''); setSaving(true)
    const common = { name, description, categoryId, price, durationMinutes, bufferBeforeMinutes, bufferAfterMinutes, isActive: formData.get('isActive') === 'on', image: { url: values.imageUrl || null, publicId: dialog.service.image?.publicId || null }, updatedAt: serverTimestamp() }
    try {
      if (dialog.mode === 'edit') {
        await updateDoc(doc(db, 'services', dialog.service.id), common)
      } else {
        const ref = doc(collection(db, 'services'))
        await setDoc(ref, { ...common, businessId, currencyCode, isPublic: true, professionalIds: [], createdAt: serverTimestamp(), id: ref.id })
      }
      markFormSaved(form, true)
      setDialog(null)
      notify({ title: dialog.mode === 'edit' ? 'Servicio actualizado' : 'Servicio creado', message: 'Los datos se guardaron correctamente.', type: 'success' })
    } catch (reason) {
      setDialogError(reason.code === 'permission-denied' ? 'No tienes permiso para modificar los servicios de este negocio.' : reason.message || 'No se pudo guardar el servicio. Intenta de nuevo.')
    } finally { setSaving(false) }
  }

  async function toggleActive(service) {
    if (service.isActive && !await confirm({ title: '¿Desactivar servicio?', description: 'Dejará de estar disponible para nuevas reservas. Las reservas existentes se conservarán.', confirmLabel: 'Desactivar servicio' })) return
    try {
      await updateDoc(doc(db, 'services', service.id), { isActive: !service.isActive, updatedAt: serverTimestamp() })
      notify({ title: service.isActive ? 'Servicio desactivado' : 'Servicio activado', message: service.isActive ? 'Se conserva el historial y no estará disponible para nuevas reservas.' : 'El servicio vuelve a estar disponible según su configuración.', type: 'success' })
    } catch (reason) { setLoadError({ businessId, message:reason.code === 'permission-denied' ? 'No tienes permisos para cambiar el estado del servicio.' : 'No se pudo actualizar el estado del servicio.' }) }
  }

  const pageHeader = <PageHeader title={isProfessional ? 'Mis servicios' : 'Servicios'} description={isProfessional ? 'Consulta los servicios asignados a tu perfil.' : 'Administra los servicios que ofrece tu negocio.'} actions={isProfessional ? <span className="service-readonly"><Info size={17} />Solo lectura</span> : <Button onClick={openCreate} disabled={loading || !categories.some(category => category.isActive)}><Plus size={17} />Nuevo servicio</Button>} />

  return <section className={`services-page${isProfessional ? ' services-professional' : ''}`}>
    {pageHeader}
    {isSuperadmin && <p className="services-scope"><BriefcaseBusiness size={16} />Administrando: <strong>{businessName || 'Selecciona un negocio en el menú lateral'}</strong></p>}
    {isProfessional && <div className="service-readonly-note"><Info size={20} /><div><strong>Solo lectura</strong><span>Solo puedes consultar los servicios asignados a tu perfil.</span></div></div>}
    {!businessId && <Alert>Selecciona un negocio para consultar sus servicios.</Alert>}
    {error && <Alert>{error}</Alert>}
    {!isProfessional && !loading && categories.length === 0 && <Alert>Crea una categoría antes de registrar servicios.</Alert>}
    <div className="services-panel">
      <div className="services-toolbar">
        <label className="services-search"><Search size={18} aria-hidden="true" /><span className="sr-only">Buscar servicios</span><input type="search" placeholder="Buscar por nombre o descripción…" value={queryText} onChange={event => { setQueryText(event.target.value); setPage(1) }} /></label>
        <label>Categoría<select aria-label="Filtrar por categoría" value={categoryFilter} onChange={event => { setCategoryFilter(event.target.value); setPage(1) }}><option value="all">Todas</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Estado<select aria-label="Filtrar por estado" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1) }}><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label>
        <label>Ordenar por<select aria-label="Ordenar servicios" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Nombre (A - Z)</option><option value="price">Precio (menor a mayor)</option><option value="duration">Duración (menor a mayor)</option></select></label>
      </div>
      {loading ? <p className="services-empty" role="status">Cargando servicios…</p> : rows.length === 0 ? <p className="services-empty">{isProfessional ? 'Aún no tienes servicios asignados.' : 'No hay servicios que coincidan con estos filtros.'}</p> : isProfessional ? <div className="service-cards-grid">{rows.map(service => <article className="service-card" key={service.id}>
        <ServiceImage service={service} large /><div className="service-card-copy"><div className="service-card-title"><h3>{service.name}</h3><Badge tone={service.isActive ? 'success' : 'neutral'}>{service.isActive ? 'Activo' : 'Inactivo'}</Badge></div><p className="service-card-category">{categories.find(item => item.id === service.categoryId)?.name || 'Categoría no disponible'}</p><div className="service-card-facts"><span><Clock3 size={15} />{service.durationMinutes} min</span><span>{service.price} {service.currencyCode || currencyCode}</span></div><p className="service-card-description">{service.description || 'Sin descripción.'}</p><button type="button" onClick={() => openDetails(service)}>Ver detalles <ChevronRight size={16} /></button></div>
      </article>)}</div> : <div className="services-table-wrap"><table className="services-table"><thead><tr><th>Servicio</th><th>Descripción</th><th>Categoría</th><th>Precio</th><th>Duración</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{rows.map(service => <tr key={service.id}>
        <td><div className="service-name-cell"><ServiceImage service={service} /><strong>{service.name}</strong></div></td>
        <td className="service-description-cell" title={service.description}>{service.description || 'Sin descripción'}</td>
        <td>{categories.find(item => item.id === service.categoryId)?.name || '—'}</td><td>{service.price} {service.currencyCode || currencyCode}</td><td>{service.durationMinutes} min</td>
        <td><Badge tone={service.isActive ? 'success' : 'neutral'}>{service.isActive ? 'Activo' : 'Inactivo'}</Badge></td>
        <td><div className="service-actions"><button type="button" onClick={() => openDetails(service)} aria-label={`Ver detalle de ${service.name}`}><Eye size={16} />Detalle</button>{!isProfessional && <><button type="button" onClick={() => openEdit(service)}><Pencil size={16} />Editar</button><button type="button" className={service.isActive ? 'service-action-disable' : ''} onClick={() => toggleActive(service)}>{service.isActive ? 'Desactivar' : 'Activar'}</button></>}</div></td>
      </tr>)}</tbody></table></div>}
      <footer className="services-pagination"><span>{visible.length ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, visible.length)} de ${visible.length} servicios` : '0 servicios'}</span><div><button type="button" aria-label="Página anterior" disabled={currentPage <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={17} /></button><span>Página {currentPage} de {pageCount}</span><button type="button" aria-label="Página siguiente" disabled={currentPage >= pageCount} onClick={() => setPage(value => value + 1)}><ChevronRight size={17} /></button></div></footer>
    </div>
    {dialog?.mode === 'details' && <ServiceDetailsDialog service={dialog.service} categories={categories} professionals={professionals} professionalId={professionalId} onClose={() => setDialog(null)} />}
    {(dialog?.mode === 'create' || dialog?.mode === 'edit') && <ServiceEditorDialog key={`${dialog.mode}-${dialog.service.id || 'new'}`} dialog={dialog} categories={categories} professionals={professionals} businessId={businessId} currencyCode={currencyCode} error={dialogError} saving={saving} uploading={uploading} onUpload={setUploading} onSave={saveService} onClose={() => setDialog(null)} />}
  </section>
}

function ServiceImage({ service, large = false }) {
  return <span className={`service-image${large ? ' service-image-large' : ''}`}>{safeImageUrl(service.image?.url) ? <img src={service.image.url} alt={service.name ? `Imagen de ${service.name}` : ''} loading="lazy" /> : <Scissors size={large ? 24 : 18} aria-hidden="true" />}</span>
}

function ServiceDetailsDialog({ service, categories, professionals, professionalId, onClose }) {
  const category = categories.find(item => item.id === service.categoryId)?.name || 'Categoría no disponible'
  const assigned = professionals.filter(item => service.professionalIds?.includes(item.id))
  const ownAssignment = professionalId && service.professionalIds?.includes(professionalId)
  return <EditorDialog title={service.name || 'Detalle del servicio'} onClose={onClose}>
    <div className="service-detail-layout"><div className="service-detail-main"><ServiceImage service={service} large /><Badge tone={service.isActive ? 'success' : 'neutral'}>{service.isActive ? 'Activo' : 'Inactivo'}</Badge><h3>{service.name}</h3><p className="service-detail-description">{service.description || 'Este servicio no tiene descripción registrada.'}</p><div className="service-detail-facts"><span><Scissors size={17} />{category}</span><span><Clock3 size={17} />{service.durationMinutes} minutos</span><span>{service.price} {service.currencyCode || ''}</span></div><p><strong>Margen antes:</strong> {service.bufferBeforeMinutes ?? 0} minutos</p><p><strong>Margen después:</strong> {service.bufferAfterMinutes ?? 0} minutos</p>
      {professionals.length > 0 && <section className="service-associated"><h4><Users size={17} />Profesionales asociados</h4>{assigned.length ? assigned.map(person => <p key={person.id}>{person.displayName || `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Profesional'}</p>) : <p>No hay profesionales asociados a este servicio.</p>}</section>}
      {professionalId && <p className="service-assignment"><Check size={16} />{ownAssignment ? 'Asignado a tu perfil' : 'La asignación a tu perfil no está disponible.'}</p>}
    </div></div>
  </EditorDialog>
}

function ServiceEditorDialog({ dialog, categories, professionals, businessId, currencyCode, error, saving, uploading, onUpload, onSave, onClose }) {
  const service = dialog.service
  const isEdit = dialog.mode === 'edit'
  const { confirm } = useFeedback()
  const formRef = useRef(null)
  const [imageUrl, setImageUrl] = useState(service.image?.url || '')
  const associated = professionals.filter(item => service.professionalIds?.includes(item.id))
  const activeCategories = categories.filter(item => item.isActive || item.id === service.categoryId)
  return <EditorDialog title={isEdit ? 'Editar servicio' : 'Nuevo servicio'} busy={saving || uploading} onClose={onClose}>
    <form ref={formRef} className="service-editor-form" onSubmit={event => onSave(event, { imageUrl })}>
      {error && <Alert>{error}</Alert>}
      <div className="service-editor-grid">
        <div className="service-form-fields">
          <ImageUploadField label="Imagen del servicio" value={imageUrl} onChange={setImageUrl} businessId={businessId} kind="service" disabled={saving || uploading} onBusyChange={onUpload} />
          <div className="service-form-two"><Field label="Nombre del servicio" htmlFor="service-name"><input id="service-name" name="name" required maxLength={100} defaultValue={service.name || ''} className={fieldControlClasses(false)} /></Field><Field label="Categoría" htmlFor="service-category"><select id="service-category" name="categoryId" required defaultValue={service.categoryId || ''} className={fieldControlClasses(false)}><option value="" disabled>Selecciona una categoría</option>{activeCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field></div>
          <Field label="Descripción" htmlFor="service-description"><textarea id="service-description" name="description" maxLength={500} rows={4} defaultValue={service.description || ''} className={fieldControlClasses(false)} /></Field>
          <div className="service-form-two"><Field label={`Precio (${currencyCode || 'moneda del negocio'})`} htmlFor="service-price"><input id="service-price" name="price" type="number" min="0.01" step="0.01" required defaultValue={service.price ?? ''} className={fieldControlClasses(false)} /></Field><Field label="Duración (minutos)" htmlFor="service-duration"><input id="service-duration" name="durationMinutes" type="number" min="1" step="1" required defaultValue={service.durationMinutes ?? ''} className={fieldControlClasses(false)} /></Field></div>
          <div className="service-form-two"><Field label="Margen antes (minutos)" htmlFor="service-before"><input id="service-before" name="bufferBeforeMinutes" type="number" min="0" step="1" defaultValue={service.bufferBeforeMinutes ?? 0} className={fieldControlClasses(false)} /></Field><Field label="Margen después (minutos)" htmlFor="service-after"><input id="service-after" name="bufferAfterMinutes" type="number" min="0" step="1" defaultValue={service.bufferAfterMinutes ?? 0} className={fieldControlClasses(false)} /></Field></div>
          <label className="service-active-toggle"><input type="checkbox" name="isActive" defaultChecked={service.isActive !== false} /><span><strong>Servicio activo</strong><small>{service.isActive === false ? 'Al activarlo, volverá a ofrecerse para nuevas reservas.' : 'Al desactivarlo, dejará de ofrecerse para nuevas reservas.'}</small></span></label>
        </div>
        <aside className="service-preview"><h3>Vista previa</h3><ServiceImage service={{ ...service, image: { ...service.image, url: imageUrl } }} large /><h4>{service.name || 'Nombre del servicio'}</h4><Badge tone={service.isActive === false ? 'neutral' : 'success'}>{service.isActive === false ? 'Inactivo' : 'Activo'}</Badge><p>{categories.find(category => category.id === service.categoryId)?.name || 'Categoría'}</p><div className="service-detail-facts"><span><Clock3 size={16} />{service.durationMinutes || '—'} min</span><span>{service.price ?? '—'} {currencyCode}</span></div>
          {isEdit && <section className="service-associated"><h4><Users size={17} />Profesionales asociados</h4>{associated.length ? associated.map(person => <p key={person.id}>{person.displayName || person.id}</p>) : <p>No hay asociaciones registradas.</p>}<p className="service-metadata">{service.createdAt ? `Creado el ${formatDate(service.createdAt)}` : 'No hay fecha de creación disponible.'}</p></section>}
        </aside>
      </div>
      <div className="service-form-actions"><Button type="button" variant="secondary" disabled={saving || uploading} onClick={async () => { if (await confirmDiscard(formRef.current, confirm)) onClose() }}>Cancelar</Button><Button type="submit" disabled={saving || uploading}>{saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear servicio'}</Button></div>
    </form>
  </EditorDialog>
}

function formatDate(value) { const date = value?.toDate?.() || (value ? new Date(value) : null); return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '' }
