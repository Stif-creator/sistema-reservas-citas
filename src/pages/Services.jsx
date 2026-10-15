import { safeImageUrl } from '../lib/brand'
import { Scissors } from 'lucide-react'
import DataList from '../components/ui/DataList'
import ImageUploadField from '../components/ImageUploadField'
import { useEffect, useState } from 'react'
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import Field from '../components/ui/Field'
import { fieldControlClasses } from '../components/ui/fieldStyles'
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
  const [imageUploading, setImageUploading] = useState(false)
  const [svcFieldErrors, setSvcFieldErrors] = useState({})
  const [svcError, setSvcError] = useState('')
  const [svcSuccess, setSvcSuccess] = useState('')
  const [svcSaving, setSvcSaving] = useState(false)

  useEffect(() => {
    if (!businessId) return

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
        setCategories(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
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

  useEffect(() => {
    async function fetchCurrencyCode() {
      if (!businessId) return
      try {
        const snap = await getDoc(doc(db, 'businesses', businessId))
        setCurrencyCode(snap.exists() ? (snap.data()?.settings?.currencyCode ?? '') : '')
      } catch {
        setSvcError('No se pudo cargar la moneda del negocio. Recarga la página.')
      }
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
    setSvcBufferBefore(
      service.bufferBeforeMinutes != null ? String(service.bufferBeforeMinutes) : ''
    )
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
    if (svcPrice === '' || !Number.isFinite(priceNum) || priceNum <= 0) {
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
    if (imageUploading) return
    setSvcError('')
    setSvcSuccess('')

    if (!currencyCode) {
      setSvcError('Espera a que se cargue la moneda del negocio o recarga la página.')
      return
    }
    const errors = validateService()
    setSvcFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSvcSaving(true)
    let writeCompleted = false
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
        const ref = doc(db, 'services', svcEditingId)
        await updateDoc(ref, commonFields)
        writeCompleted = true
        // Confirm server state and refresh the visible row before reporting success.
        const saved = await getDocFromServer(ref)
        if (!saved.exists()) throw new Error('El servicio ya no existe.')
        const persisted = { ...saved.data(), id: saved.id }
        setServices((previous) => previous.map((item) => item.id === saved.id ? persisted : item)
          .sort((a, b) => a.name.localeCompare(b.name)))
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
      setSvcError(writeCompleted
        ? 'El cambio se guardó, pero no pudimos actualizar la tabla. Recarga la página para consultar los datos guardados.'
        : err.code === 'permission-denied'
          ? 'No tienes permisos para guardar este servicio. Contacta al administrador del negocio.'
          : 'No se pudo guardar el servicio. Intenta de nuevo.')
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
      <PageHeader
        title="Servicios"
        description="Administra los servicios que ofreces. Gestiona sus categorías desde el menú Categorías."
      />

      {categoriesListError && <Alert tone="error">No se pudieron cargar las categorías.</Alert>}
      {categoriesLoading && <p>Cargando categorías…</p>}
      <Card title="Servicios">
        {servicesListError && (
          <Alert tone="error">Error al cargar servicios: {servicesListError}</Alert>
        )}

        {servicesLoading ? (
          <p className="text-sm text-muted">Cargando servicios...</p>
        ) : services.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay servicios.</p>
        ) : (
          <DataList items={services} label="Servicios" searchText={s => `${s.name} ${s.description || ""} ${categories.find(c => c.id === s.categoryId)?.name || ""} ${s.price} ${s.durationMinutes} ${s.isActive ? "Activo" : "Inactivo"}`}>{rows => <div className="overflow-x-auto">
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
                {rows.map((svc) => (
                  <tr key={svc.id}>
                    <td className="py-2.5 pr-4 font-medium text-ink"><div className="admin-service-cell"><span className="admin-service-image">{safeImageUrl(svc.image?.url) ? <img src={svc.image.url} alt="" loading="lazy" /> : <Scissors size={20} />}</span><div><strong>{svc.name}</strong><p title={svc.description}>{svc.description}</p></div></div></td>
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
                        <Button
                          variant="ghost"
                          className="px-2 py-1"
                          onClick={() => loadServiceForEdit(svc)}
                          disabled={svcSaving || imageUploading}
                        >
                          <Pencil size={14} />
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          className="px-2 py-1"
                          onClick={() => toggleServiceActive(svc)}
                          disabled={svcSaving || imageUploading}
                        >
                          {svc.isActive ? 'Desactivar' : 'Activar'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}</DataList>
        )}

        <div className="mt-6 border-t border-border pt-6">
          <h4 className="mb-4 text-sm font-semibold text-ink">
            {svcEditingId ? 'Editar servicio' : 'Nuevo servicio'}
          </h4>

          {activeCategories.length === 0 && !svcEditingId ? (
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
                <Field
                  label={`Precio (${currencyCode || 'moneda del negocio'})`}
                  htmlFor="svcPrice"
                  error={svcFieldErrors.price}
                >
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

                <Field
                  label="Duración (minutos)"
                  htmlFor="svcDuration"
                  error={svcFieldErrors.durationMinutes}
                >
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
                  ni se cobra: son márgenes internos que se respetan al
                  calcular la disponibilidad y comprobar los bloqueos. */}
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

              <ImageUploadField label="Imagen del servicio" value={svcImageUrl} onChange={setSvcImageUrl} businessId={businessId} kind="service" disabled={svcSaving || imageUploading} onBusyChange={setImageUploading} />

              {svcError && <Alert tone="error">{svcError}</Alert>}
              {svcSuccess && <Alert tone="success">{svcSuccess}</Alert>}

              <div className="flex items-center gap-2">
                <Button type="submit" disabled={svcSaving || imageUploading || !currencyCode || categoriesLoading}>
                  {svcSaving ? 'Guardando...' : svcEditingId ? 'Guardar cambios' : 'Crear servicio'}
                </Button>
                {svcEditingId && (
                  <Button type="button" variant="secondary" onClick={resetServiceForm} disabled={svcSaving || imageUploading}>
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
