import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { Check, Info, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'
import { useFeedback } from '../context/feedback-context'
import { confirmDiscard, markFormSaved } from '../lib/unsavedForms'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import Field from '../components/ui/Field'
import { fieldControlClasses } from '../components/ui/fieldStyles'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import Badge from '../components/ui/Badge'
import DataList from '../components/ui/DataList'
import EditorDialog from '../components/ui/EditorDialog'
import './categories-page.css'

const NAME_LIMIT = 80
const DESCRIPTION_LIMIT = 300
const normalizeName = value => String(value ?? '').trim().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')

export default function Categories() {
  const { membership } = useAuth()
  const { confirm, notify } = useFeedback()
  const businessId = membership?.businessId
  const [categories, setCategories] = useState([])
  const [loadedBusinessId, setLoadedBusinessId] = useState('')
  const [listError, setListError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dialog, setDialog] = useState(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [fieldErrors, setFieldErrors] = useState({})
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState('')
  const loading = Boolean(businessId && loadedBusinessId !== businessId)
  const businessCategories = useMemo(() => loadedBusinessId === businessId ? categories : [], [categories, loadedBusinessId, businessId])
  const currentListError = loadedBusinessId === businessId ? listError : ''

  useEffect(() => {
    if (!businessId) return undefined
    const categoriesQuery = query(collection(db, 'categories'), where('businessId', '==', businessId), orderBy('displayOrder'))
    return onSnapshot(categoriesQuery, snapshot => {
      setCategories(snapshot.docs.map(item => ({ ...item.data(), id: item.id })))
      setListError('')
      setLoadedBusinessId(businessId)
    }, error => {
      console.error('Error al escuchar categorías', error)
      setListError(`${error.code}: ${error.message}`)
      setLoadedBusinessId(businessId)
    })
  }, [businessId])

  const visibleCategories = useMemo(() => businessCategories.filter(category => statusFilter === 'all' || category.isActive === (statusFilter === 'active')), [businessCategories, statusFilter])

  function resetForm() {
    setName('')
    setDescription('')
    setIsActive(true)
    setFieldErrors({})
    setSaveError('')
  }

  function openCreate() {
    resetForm()
    setDialog({ mode: 'create', category: null })
  }

  function openEdit(category) {
    setName(category.name ?? '')
    setDescription(category.description ?? '')
    setIsActive(category.isActive !== false)
    setFieldErrors({})
    setSaveError('')
    setDialog({ mode: 'edit', category })
  }

  async function closeDialog(form) {
    if (saving) return
    if (form && !await confirmDiscard(form, confirm)) return
    setDialog(null)
    resetForm()
  }

  async function saveCategory(event) {
    event.preventDefault()
    if (!dialog || saving) return
    const cleanName = name.trim().replace(/\s+/g, ' ')
    const cleanDescription = description.trim()
    const errors = {}
    if (!cleanName) errors.name = 'El nombre es obligatorio.'
    else if (cleanName.length > NAME_LIMIT) errors.name = `Usa hasta ${NAME_LIMIT} caracteres.`
    else if (businessCategories.some(category => category.id !== dialog.category?.id && normalizeName(category.name) === normalizeName(cleanName))) errors.name = 'Ya existe una categoría con ese nombre en este negocio.'
    if (cleanDescription.length > DESCRIPTION_LIMIT) errors.description = `Usa hasta ${DESCRIPTION_LIMIT} caracteres.`
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    if (!businessId) { setSaveError('Selecciona un negocio antes de guardar.'); return }

    setSaving(true)
    setSaveError('')
    try {
      if (dialog.mode === 'edit') {
        await updateDoc(doc(db, 'categories', dialog.category.id), { name: cleanName, description: cleanDescription, isActive, updatedAt: serverTimestamp() })
      } else {
        const categoryRef = doc(collection(db, 'categories'))
        await setDoc(categoryRef, {
          id: categoryRef.id,
          businessId,
          name: cleanName,
          description: cleanDescription,
          displayOrder: businessCategories.reduce((max, item) => Math.max(max, Number(item.displayOrder) || 0), 0) + 1,
          isActive,
          image: { url: null, publicId: null },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }
      markFormSaved(event.currentTarget, true)
      const created = dialog.mode === 'create'
      setDialog(null)
      resetForm()
      notify({ title: created ? 'Categoría creada' : 'Categoría actualizada', message: 'Los datos se guardaron correctamente.', type: 'success' })
    } catch (error) {
      console.error('Error al guardar categoría', error)
      setSaveError(error.code === 'permission-denied' ? 'No tienes permiso para guardar categorías en este negocio.' : error.message || 'No se pudo guardar la categoría. Intenta de nuevo.')
    } finally { setSaving(false) }
  }

  async function toggleCategory(category) {
    const activating = category.isActive === false
    if (!activating && !await confirm({
      title: '¿Desactivar categoría?',
      description: 'La categoría dejará de aparecer como activa. Los servicios asociados y las reservas existentes se conservarán; los servicios activos y publicados pueden seguir disponibles para reservar.',
      confirmLabel: 'Desactivar categoría',
    })) return
    setTogglingId(category.id)
    try {
      await updateDoc(doc(db, 'categories', category.id), { isActive: activating, updatedAt: serverTimestamp() })
      notify({ title: activating ? 'Categoría activada' : 'Categoría desactivada', message: activating ? 'La categoría vuelve a estar activa.' : 'Se conservan los servicios y el historial asociado.', type: 'success' })
    } catch (error) {
      setListError(error.code === 'permission-denied' ? 'No tienes permiso para cambiar el estado de esta categoría.' : error.message || 'No se pudo actualizar el estado de la categoría.')
    } finally { setTogglingId('') }
  }

  const pageHeader = <PageHeader title="Categorías" description="Organiza las categorías de tus servicios." actions={<Button onClick={openCreate} disabled={!businessId || loading}><Plus size={17} />Nueva categoría</Button>} />

  return <section className="categories-page">
    {pageHeader}
    {!businessId && <Alert>Selecciona un negocio para consultar sus categorías.</Alert>}
    {currentListError && <Alert tone="error">{currentListError}</Alert>}
    <Card>
      <DataList items={visibleCategories} label="Categorías" resetKey={statusFilter} searchText={category => `${category.name || ''} ${category.description || ''}`} toolbar={<label className="categories-filter" htmlFor="category-status">Estado<select id="category-status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">Todas</option><option value="active">Activas</option><option value="inactive">Inactivas</option></select></label>}>
        {rows => <div className="categories-table-wrap"><table className="categories-table">
          <thead><tr><th>Nombre</th><th>Descripción</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>{rows.map(category => <tr key={category.id}>
            <td data-label="Nombre"><strong>{category.name}</strong></td>
            <td data-label="Descripción" className="categories-description">{category.description || '—'}</td>
            <td data-label="Estado"><Badge tone={category.isActive ? 'success' : 'neutral'}>{category.isActive ? 'Activa' : 'Inactiva'}</Badge></td>
            <td data-label="Acciones"><div className="categories-actions">
              <Button variant="secondary" className="categories-action" onClick={() => openEdit(category)}><Pencil size={15} />Editar</Button>
              <Button variant={category.isActive ? 'danger' : 'secondary'} className={`categories-action ${category.isActive ? 'categories-disable' : 'categories-enable'}`} onClick={() => toggleCategory(category)} disabled={togglingId === category.id}>
                {category.isActive ? <Trash2 size={15} /> : <Play size={15} />}{category.isActive ? 'Desactivar' : 'Activar'}
              </Button>
            </div></td>
          </tr>)}</tbody>
        </table></div>}
      </DataList>
      {!loading && !currentListError && visibleCategories.length === 0 && businessCategories.length === 0 && <p className="categories-note"><Info size={17} />Puedes crear y gestionar las categorías que organizan tus servicios.</p>}
      {loading && <p className="categories-loading" role="status">Cargando categorías…</p>}
    </Card>

    {dialog && <EditorDialog title={dialog.mode === 'create' ? 'Nueva categoría' : 'Editar categoría'} busy={saving} onClose={() => closeDialog()}>
      <form className="category-form" noValidate onSubmit={saveCategory}>
        <p className="category-form-description">{dialog.mode === 'create' ? 'Crea una nueva categoría para organizar tus servicios.' : 'Actualiza los datos y el estado de esta categoría.'}</p>
        <Field label="Nombre" htmlFor="category-name" error={fieldErrors.name}>
          <input id="category-name" name="name" autoFocus required maxLength={NAME_LIMIT} placeholder="Ej. Odontología general" value={name} onChange={event => { setName(event.target.value); setFieldErrors(current => ({ ...current, name: '' })) }} className={fieldControlClasses(Boolean(fieldErrors.name))} />
        </Field>
        <Field label="Descripción" htmlFor="category-description" error={fieldErrors.description}>
          <textarea id="category-description" name="description" rows={4} maxLength={DESCRIPTION_LIMIT} placeholder="Describe brevemente esta categoría" value={description} onChange={event => { setDescription(event.target.value); setFieldErrors(current => ({ ...current, description: '' })) }} className={fieldControlClasses(Boolean(fieldErrors.description))} />
          <span className="category-character-count">{description.length}/{DESCRIPTION_LIMIT}</span>
        </Field>
        <label className="category-active-toggle"><input type="checkbox" name="isActive" checked={isActive} onChange={event => setIsActive(event.target.checked)} /><span className="category-switch" aria-hidden="true" /><span>{isActive ? 'Activa' : 'Inactiva'}</span></label>
        <p className="category-form-note"><Info size={16} />Podrás editar o cambiar el estado de la categoría más adelante.</p>
        {saveError && <Alert tone="error">{saveError}</Alert>}
        <div className="category-form-actions">
          <Button type="button" variant="secondary" disabled={saving} onClick={event => closeDialog(event.currentTarget.form)}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{dialog.mode === 'create' ? <Plus size={16} /> : <Check size={16} />}{saving ? 'Guardando…' : dialog.mode === 'create' ? 'Crear categoría' : 'Guardar cambios'}</Button>
        </div>
      </form>
    </EditorDialog>}
  </section>
}
