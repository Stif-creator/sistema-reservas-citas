import { useEffect, useState } from 'react'
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
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
import { Pencil } from 'lucide-react'

function Services() {
  const { membership } = useAuth()
  const businessId = membership?.businessId

  const [currencyCode, setCurrencyCode] = useState('')

  // --- Categorías ---
  const [categories, setCategories] = useState([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [categoriesListError, setCategoriesListError] = useState('')
  const [catEditingId, setCatEditingId] = useState(null)
  const [catName, setCatName] = useState('')
  const [catDescription, setCatDescription] = useState('')
  const [catFieldErrors, setCatFieldErrors] = useState({})
  const [catError, setCatError] = useState('')
  const [catSuccess, setCatSuccess] = useState('')
  const [catSaving, setCatSaving] = useState(false)

  // --- Servicios ---
  const [services, setServices] = useState([])
  const [servicesLoading, setServicesLoading] = useState(true)
  const [servicesListError, setServicesListError] = useState('')
  const [svcEditingId, setSvcEditingId] = useState(null)
  const [svcName, setSvcName] = useState('')
  const [svcDescription, setSvcDescription] = useState('')
  const [svcCategoryId, setSvcCategoryId] = useState('')
  const [svcPrice, setSvcPrice] = useState('')
  const [svcDuration, setSvcDuration] = useState('')
  const [svcBufferBefore, setSvcBufferBefore] = useState('')
  const [svcBufferAfter, setSvcBufferAfter] = useState('')
  const [svcImageUrl, setSvcImageUrl] = useState('')
  const [svcFieldErrors, setSvcFieldErrors] = useState({})
  const [svcError, setSvcError] = useState('')
  const [svcSuccess, setSvcSuccess] = useState('')
  const [svcSaving, setSvcSaving] = useState(false)

  useEffect(() => {
    if (!businessId) return

    setCategoriesLoading(true)
    // where + orderBy en campos distintos suele pedir un índice
    // compuesto la primera vez: si ves un error en consola con un link
    // de Firestore, ábrelo y crea el índice, luego reintenta.
    const q = query(
      collection(db, 'categories'),
      where('businessId', '==', businessId),
      orderBy('displayOrder')
    )
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setCategoriesListError('')
        setCategoriesLoading(false)
      },
      (err) => {
        console.error('Error al escuchar categorías', err)
        setCategoriesListError(`${err.code}: ${err.message}`)
        setCategoriesLoading(false)
      }
    )

    // Evita dejar el listener activo si el componente se desmonta (o si
    // businessId cambia y este efecto se vuelve a ejecutar).
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

  useEffect(() => {
    async function fetchCurrencyCode() {
      if (!businessId) return
      const snap = await getDoc(doc(db, 'businesses', businessId))
      setCurrencyCode(snap.exists() ? snap.data()?.settings?.currencyCode ?? '' : '')
    }
    fetchCurrencyCode()
  }, [businessId])

  const activeCategories = categories.filter((c) => c.isActive)
  // Si estamos editando un servicio cuya categoría ya fue desactivada,
  // igual la mostramos en el <select> para no dejar el campo "roto".
  const categoryOptions =
    svcEditingId && svcCategoryId && !activeCategories.some((c) => c.id === svcCategoryId)
      ? [...activeCategories, ...categories.filter((c) => c.id === svcCategoryId)]
      : activeCategories

  // ---------- Categorías: formulario ----------

  function resetCategoryForm() {
    setCatEditingId(null)
    setCatName('')
    setCatDescription('')
    setCatFieldErrors({})
  }

  function loadCategoryForEdit(category) {
    setCatEditingId(category.id)
    setCatName(category.name ?? '')
    setCatDescription(category.description ?? '')
    setCatFieldErrors({})
    setCatError('')
    setCatSuccess('')
  }

  function clearCatFieldError(key) {
    setCatFieldErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev))
  }

  function validateCategory() {
    const errors = {}
    if (!catName.trim()) {
      errors.name = 'El nombre de la categoría es obligatorio.'
    }
    return errors
  }

  async function handleCategorySubmit(e) {
    e.preventDefault()
    setCatError('')
    setCatSuccess('')

    const errors = validateCategory()
    setCatFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setCatSaving(true)
    try {
      if (catEditingId) {
        await updateDoc(doc(db, 'categories', catEditingId), {
          name: catName.trim(),
          description: catDescription.trim(),
          updatedAt: serverTimestamp(),
        })
        setCatSuccess('Categoría actualizada.')
      } else {
        const categoryRef = doc(collection(db, 'categories'))
        await setDoc(categoryRef, {
          businessId,
          name: catName.trim(),
          description: catDescription.trim(),
          displayOrder: categories.length + 1,
          isActive: true,
          image: { url: null, publicId: null },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          id: categoryRef.id,
        })
        setCatSuccess('Categoría creada.')
      }
      resetCategoryForm()
    } catch (err) {
      console.error('Error al guardar categoría', err)
      setCatError('No se pudo guardar la categoría. Intenta de nuevo.')
    } finally {
      setCatSaving(false)
    }
  }

  async function toggleCategoryActive(category) {
    setCatError('')
    try {
      await updateDoc(doc(db, 'categories', category.id), {
        isActive: !category.isActive,
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      console.error('Error al actualizar categoría', err)
      setCatError('No se pudo actualizar la categoría. Intenta de nuevo.')
    }
  }

  // ---------- Servicios: formulario ----------

  function resetServiceForm() {
    setSvcEditingId(null)
    setSvcName('')
    setSvcDescription('')
    setSvcCategoryId('')
    setSvcPrice('')
    setSvcDuration('')
    setSvcBufferBefore('')
    setSvcBufferAfter('')
    setSvcImageUrl('')
    setSvcFieldErrors({})
  }

  function loadServiceForEdit(service) {
    setSvcEditingId(service.id)
    setSvcName(service.name ?? '')
    setSvcDescription(service.description ?? '')
    setSvcCategoryId(service.categoryId ?? '')
    setSvcPrice(service.price != null ? String(service.price) : '')
    setSvcDuration(service.durationMinutes != null ? String(service.durationMinutes) : '')
    setSvcBufferBefore(service.bufferBeforeMinutes != null ? String(service.bufferBeforeMinutes) : '')
    setSvcBufferAfter(service.bufferAfterMinutes != null ? String(service.bufferAfterMinutes) : '')
    setSvcImageUrl(service.image?.url ?? '')
    setSvcFieldErrors({})
    setSvcError('')
    setSvcSuccess('')
  }

  function clearSvcFieldError(key) {
    setSvcFieldErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev))
  }

  function isNonNegativeInteger(value) {
    const n = Number(value)
    return Number.isInteger(n) && n >= 0
  }

  function validateService() {
    const errors = {}

    if (!svcName.trim()) {
      errors.name = 'El nombre del servicio es obligatorio.'
    }

    if (!svcCategoryId) {
      errors.categoryId = 'Selecciona una categoría.'
    }

    const priceNum = Number(svcPrice)
    if (svcPrice === '' || Number.isNaN(priceNum) || priceNum <= 0) {
      errors.price = 'El precio debe ser un número mayor a 0.'
    }

    const durationNum = Number(svcDuration)
    if (svcDuration === '' || !Number.isInteger(durationNum) || durationNum <= 0) {
      errors.durationMinutes = 'La duración debe ser un número entero de minutos mayor a 0.'
    }

    if (svcBufferBefore !== '' && !isNonNegativeInteger(svcBufferBefore)) {
      errors.bufferBeforeMinutes = 'Debe ser un número entero de minutos, 0 o mayor.'
    }

    if (svcBufferAfter !== '' && !isNonNegativeInteger(svcBufferAfter)) {
      errors.bufferAfterMinutes = 'Debe ser un número entero de minutos, 0 o mayor.'
    }

    return errors
  }

  async function handleServiceSubmit(e) {
    e.preventDefault()
    setSvcError('')
    setSvcSuccess('')

    const errors = validateService()
    setSvcFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSvcSaving(true)
    try {
      const commonFields = {
        categoryId: svcCategoryId,
        name: svcName.trim(),
        description: svcDescription.trim(),
        price: Number(svcPrice),
        durationMinutes: Number(svcDuration),
        bufferBeforeMinutes: svcBufferBefore === '' ? 0 : Number(svcBufferBefore),
        bufferAfterMinutes: svcBufferAfter === '' ? 0 : Number(svcBufferAfter),
        image: { url: svcImageUrl.trim() || null, publicId: null },
        updatedAt: serverTimestamp(),
      }

      if (svcEditingId) {
        await updateDoc(doc(db, 'services', svcEditingId), commonFields)
        setSvcSuccess('Servicio actualizado.')
      } else {
        const serviceRef = doc(collection(db, 'services'))
        await setDoc(serviceRef, {
          ...commonFields,
          businessId,
          currencyCode,
          isActive: true,
          isPublic: true,
          professionalIds: [],
          createdAt: serverTimestamp(),
          id: serviceRef.id,
        })
        setSvcSuccess('Servicio creado.')
      }
      resetServiceForm()
    } catch (err) {
      console.error('Error al guardar servicio', err)
      setSvcError('No se pudo guardar el servicio. Intenta de nuevo.')
    } finally {
      setSvcSaving(false)
    }
  }

  async function toggleServiceActive(service) {
    setSvcError('')
    try {
      await updateDoc(doc(db, 'services', service.id), {
        isActive: !service.isActive,
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      console.error('Error al actualizar servicio', err)
      setSvcError('No se pudo actualizar el servicio. Intenta de nuevo.')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Servicios" description="Organiza tus categorías y los servicios que ofreces." />

      <Card title="Categorías">
        {categoriesListError && <Alert tone="error">Error al cargar categorías: {categoriesListError}</Alert>}

        {categoriesLoading ? (
          <p className="text-sm text-muted">Cargando categorías...</p>
        ) : categories.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay categorías.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Descripción</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {categories.map((cat) => (
                  <tr key={cat.id}>
                    <td className="py-2.5 pr-4 font-medium text-ink">{cat.name}</td>
                    <td className="py-2.5 pr-4 text-muted">{cat.description || '—'}</td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={cat.isActive ? 'success' : 'neutral'}>
                        {cat.isActive ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" className="px-2 py-1" onClick={() => loadCategoryForEdit(cat)}>
                          Editar
                        </Button>
                        <Button variant="ghost" className="px-2 py-1" onClick={() => toggleCategoryActive(cat)}>
                          {cat.isActive ? 'Desactivar' : 'Activar'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form onSubmit={handleCategorySubmit} noValidate className="mt-6 space-y-4 border-t border-border pt-6">
          <h4 className="text-sm font-semibold text-ink">
            {catEditingId ? 'Editar categoría' : 'Nueva categoría'}
          </h4>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nombre" htmlFor="catName" error={catFieldErrors.name}>
              <input
                id="catName"
                value={catName}
                onChange={(e) => {
                  setCatName(e.target.value)
                  clearCatFieldError('name')
                }}
                className={fieldControlClasses(Boolean(catFieldErrors.name))}
              />
            </Field>

            <Field label="Descripción" htmlFor="catDescription">
              <input
                id="catDescription"
                value={catDescription}
                onChange={(e) => setCatDescription(e.target.value)}
                className={fieldControlClasses(false)}
              />
            </Field>
          </div>

          {catError && <Alert tone="error">{catError}</Alert>}
          {catSuccess && <Alert tone="success">{catSuccess}</Alert>}

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={catSaving}>
              {catSaving ? 'Guardando...' : catEditingId ? 'Guardar cambios' : 'Crear categoría'}
            </Button>
            {catEditingId && (
              <Button type="button" variant="secondary" onClick={resetCategoryForm}>
                Cancelar edición
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card title="Servicios">
        {servicesListError && <Alert tone="error">Error al cargar servicios: {servicesListError}</Alert>}

        {servicesLoading ? (
          <p className="text-sm text-muted">Cargando servicios...</p>
        ) : services.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay servicios.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Categoría</th>
                  <th className="py-2 pr-4">Precio</th>
                  <th className="py-2 pr-4">Duración</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {services.map((svc) => (
                  <tr key={svc.id}>
                    <td className="py-2.5 pr-4 font-medium text-ink">{svc.name}</td>
                    <td className="py-2.5 pr-4 text-muted">
                      {categories.find((c) => c.id === svc.categoryId)?.name ?? '—'}
                    </td>
                    <td className="py-2.5 pr-4 text-ink">
                      {svc.price} {svc.currencyCode}
                    </td>
                    <td className="py-2.5 pr-4 text-muted">{svc.durationMinutes} min</td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={svc.isActive ? 'success' : 'neutral'}>
                        {svc.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" className="px-2 py-1" onClick={() => loadServiceForEdit(svc)}>
                          <Pencil size={14} />
                          Editar
                        </Button>
                        <Button variant="ghost" className="px-2 py-1" onClick={() => toggleServiceActive(svc)}>
                          {svc.isActive ? 'Desactivar' : 'Activar'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 border-t border-border pt-6">
          <h4 className="mb-4 text-sm font-semibold text-ink">
            {svcEditingId ? 'Editar servicio' : 'Nuevo servicio'}
          </h4>

          {activeCategories.length === 0 ? (
            <p className="text-sm text-muted">Crea una categoría primero.</p>
          ) : (
            <form onSubmit={handleServiceSubmit} noValidate className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nombre" htmlFor="svcName" error={svcFieldErrors.name}>
                  <input
                    id="svcName"
                    value={svcName}
                    onChange={(e) => {
                      setSvcName(e.target.value)
                      clearSvcFieldError('name')
                    }}
                    className={fieldControlClasses(Boolean(svcFieldErrors.name))}
                  />
                </Field>

                <Field label="Categoría" htmlFor="svcCategoryId" error={svcFieldErrors.categoryId}>
                  <select
                    id="svcCategoryId"
                    value={svcCategoryId}
                    onChange={(e) => {
                      setSvcCategoryId(e.target.value)
                      clearSvcFieldError('categoryId')
                    }}
                    className={fieldControlClasses(Boolean(svcFieldErrors.categoryId))}
                  >
                    <option value="" disabled>
                      Selecciona una categoría
                    </option>
                    {categoryOptions.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Descripción" htmlFor="svcDescription">
                <textarea
                  id="svcDescription"
                  rows={2}
                  value={svcDescription}
                  onChange={(e) => setSvcDescription(e.target.value)}
                  className={fieldControlClasses(false)}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={`Precio (${currencyCode || 'moneda del negocio'})`} htmlFor="svcPrice" error={svcFieldErrors.price}>
                  <input
                    id="svcPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={svcPrice}
                    onChange={(e) => {
                      setSvcPrice(e.target.value)
                      clearSvcFieldError('price')
                    }}
                    className={fieldControlClasses(Boolean(svcFieldErrors.price))}
                  />
                </Field>

                <Field label="Duración (minutos)" htmlFor="svcDuration" error={svcFieldErrors.durationMinutes}>
                  <input
                    id="svcDuration"
                    type="number"
                    min="1"
                    step="1"
                    value={svcDuration}
                    onChange={(e) => {
                      setSvcDuration(e.target.value)
                      clearSvcFieldError('durationMinutes')
                    }}
                    className={fieldControlClasses(Boolean(svcFieldErrors.durationMinutes))}
                  />
                </Field>
              </div>

              {/* bufferBeforeMinutes: minutos que se bloquean en la agenda
                  ANTES de que empiece la cita (ej. preparar el espacio o el
                  material). bufferAfterMinutes: minutos que se bloquean
                  DESPUÉS de que termina (ej. limpieza, dejar salir al
                  cliente). Ninguno de los dos forma parte de durationMinutes
                  ni se cobra: son márgenes internos. Los usaremos recién
                  cuando construyamos el cálculo de disponibilidad/horarios
                  en una fase futura; por ahora solo se guardan. */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Margen antes (minutos)"
                  htmlFor="svcBufferBefore"
                  error={svcFieldErrors.bufferBeforeMinutes}
                >
                  <input
                    id="svcBufferBefore"
                    type="number"
                    min="0"
                    step="1"
                    value={svcBufferBefore}
                    onChange={(e) => {
                      setSvcBufferBefore(e.target.value)
                      clearSvcFieldError('bufferBeforeMinutes')
                    }}
                    className={fieldControlClasses(Boolean(svcFieldErrors.bufferBeforeMinutes))}
                  />
                </Field>

                <Field
                  label="Margen después (minutos)"
                  htmlFor="svcBufferAfter"
                  error={svcFieldErrors.bufferAfterMinutes}
                >
                  <input
                    id="svcBufferAfter"
                    type="number"
                    min="0"
                    step="1"
                    value={svcBufferAfter}
                    onChange={(e) => {
                      setSvcBufferAfter(e.target.value)
                      clearSvcFieldError('bufferAfterMinutes')
                    }}
                    className={fieldControlClasses(Boolean(svcFieldErrors.bufferAfterMinutes))}
                  />
                </Field>
              </div>

              <Field label="URL de la imagen" htmlFor="svcImageUrl">
                <input
                  id="svcImageUrl"
                  value={svcImageUrl}
                  onChange={(e) => setSvcImageUrl(e.target.value)}
                  className={fieldControlClasses(false)}
                />
                {svcImageUrl && (
                  <img
                    src={svcImageUrl}
                    alt="Vista previa del servicio"
                    className="mt-2 h-16 w-16 rounded-lg border border-border object-cover"
                  />
                )}
              </Field>

              {svcError && <Alert tone="error">{svcError}</Alert>}
              {svcSuccess && <Alert tone="success">{svcSuccess}</Alert>}

              <div className="flex items-center gap-2">
                <Button type="submit" disabled={svcSaving}>
                  {svcSaving ? 'Guardando...' : svcEditingId ? 'Guardar cambios' : 'Crear servicio'}
                </Button>
                {svcEditingId && (
                  <Button type="button" variant="secondary" onClick={resetServiceForm}>
                    Cancelar edición
                  </Button>
                )}
              </div>
            </form>
          )}
        </div>
      </Card>
    </div>
  )
}

export default Services
