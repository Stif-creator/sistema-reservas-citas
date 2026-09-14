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
    <div>
      <h2>Categorías</h2>

      {categoriesListError && (
        <p style={{ color: 'red' }}>Error al cargar categorías: {categoriesListError}</p>
      )}

      {categoriesLoading ? (
        <p>Cargando categorías...</p>
      ) : categories.length === 0 ? (
        <p>Todavía no hay categorías.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Descripción</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat.id}>
                <td>{cat.name}</td>
                <td>{cat.description}</td>
                <td>{cat.isActive ? 'Activa' : 'Inactiva'}</td>
                <td>
                  <button type="button" onClick={() => loadCategoryForEdit(cat)}>
                    Editar
                  </button>{' '}
                  <button type="button" onClick={() => toggleCategoryActive(cat)}>
                    {cat.isActive ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>{catEditingId ? 'Editar categoría' : 'Nueva categoría'}</h3>
      <form onSubmit={handleCategorySubmit} noValidate>
        <div>
          <label htmlFor="catName">Nombre</label>
          <input
            id="catName"
            value={catName}
            onChange={(e) => {
              setCatName(e.target.value)
              clearCatFieldError('name')
            }}
          />
          {catFieldErrors.name && <p style={{ color: 'red' }}>{catFieldErrors.name}</p>}
        </div>

        <div>
          <label htmlFor="catDescription">Descripción</label>
          <textarea
            id="catDescription"
            value={catDescription}
            onChange={(e) => setCatDescription(e.target.value)}
          />
        </div>

        {catError && <p style={{ color: 'red' }}>{catError}</p>}
        {catSuccess && <p style={{ color: 'green' }}>{catSuccess}</p>}

        <button type="submit" disabled={catSaving}>
          {catSaving ? 'Guardando...' : catEditingId ? 'Guardar cambios' : 'Crear categoría'}
        </button>{' '}
        {catEditingId && (
          <button type="button" onClick={resetCategoryForm}>
            Cancelar edición
          </button>
        )}
      </form>

      <hr />

      <h2>Servicios</h2>

      {servicesListError && (
        <p style={{ color: 'red' }}>Error al cargar servicios: {servicesListError}</p>
      )}

      {servicesLoading ? (
        <p>Cargando servicios...</p>
      ) : services.length === 0 ? (
        <p>Todavía no hay servicios.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Precio</th>
              <th>Duración</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {services.map((svc) => (
              <tr key={svc.id}>
                <td>{svc.name}</td>
                <td>{categories.find((c) => c.id === svc.categoryId)?.name ?? '—'}</td>
                <td>
                  {svc.price} {svc.currencyCode}
                </td>
                <td>{svc.durationMinutes} min</td>
                <td>{svc.isActive ? 'Activo' : 'Inactivo'}</td>
                <td>
                  <button type="button" onClick={() => loadServiceForEdit(svc)}>
                    Editar
                  </button>{' '}
                  <button type="button" onClick={() => toggleServiceActive(svc)}>
                    {svc.isActive ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>{svcEditingId ? 'Editar servicio' : 'Nuevo servicio'}</h3>

      {activeCategories.length === 0 ? (
        <p>Crea una categoría primero.</p>
      ) : (
        <form onSubmit={handleServiceSubmit} noValidate>
          <div>
            <label htmlFor="svcName">Nombre</label>
            <input
              id="svcName"
              value={svcName}
              onChange={(e) => {
                setSvcName(e.target.value)
                clearSvcFieldError('name')
              }}
            />
            {svcFieldErrors.name && <p style={{ color: 'red' }}>{svcFieldErrors.name}</p>}
          </div>

          <div>
            <label htmlFor="svcDescription">Descripción</label>
            <textarea
              id="svcDescription"
              value={svcDescription}
              onChange={(e) => setSvcDescription(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="svcCategoryId">Categoría</label>
            <select
              id="svcCategoryId"
              value={svcCategoryId}
              onChange={(e) => {
                setSvcCategoryId(e.target.value)
                clearSvcFieldError('categoryId')
              }}
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
            {svcFieldErrors.categoryId && <p style={{ color: 'red' }}>{svcFieldErrors.categoryId}</p>}
          </div>

          <div>
            <label htmlFor="svcPrice">Precio ({currencyCode || 'moneda del negocio'})</label>
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
            />
            {svcFieldErrors.price && <p style={{ color: 'red' }}>{svcFieldErrors.price}</p>}
          </div>

          <div>
            <label htmlFor="svcDuration">Duración (minutos)</label>
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
            />
            {svcFieldErrors.durationMinutes && (
              <p style={{ color: 'red' }}>{svcFieldErrors.durationMinutes}</p>
            )}
          </div>

          {/* bufferBeforeMinutes: minutos que se bloquean en la agenda
              ANTES de que empiece la cita (ej. preparar el espacio o el
              material). bufferAfterMinutes: minutos que se bloquean
              DESPUÉS de que termina (ej. limpieza, dejar salir al
              cliente). Ninguno de los dos forma parte de durationMinutes
              ni se cobra: son márgenes internos. Los usaremos recién
              cuando construyamos el cálculo de disponibilidad/horarios
              en una fase futura; por ahora solo se guardan. */}
          <div>
            <label htmlFor="svcBufferBefore">Margen antes (minutos)</label>
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
            />
            {svcFieldErrors.bufferBeforeMinutes && (
              <p style={{ color: 'red' }}>{svcFieldErrors.bufferBeforeMinutes}</p>
            )}
          </div>

          <div>
            <label htmlFor="svcBufferAfter">Margen después (minutos)</label>
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
            />
            {svcFieldErrors.bufferAfterMinutes && (
              <p style={{ color: 'red' }}>{svcFieldErrors.bufferAfterMinutes}</p>
            )}
          </div>

          <div>
            <label htmlFor="svcImageUrl">URL de la imagen</label>
            <input id="svcImageUrl" value={svcImageUrl} onChange={(e) => setSvcImageUrl(e.target.value)} />
            {svcImageUrl && (
              <img
                src={svcImageUrl}
                alt="Vista previa del servicio"
                style={{ maxWidth: 150, display: 'block', marginTop: 8 }}
              />
            )}
          </div>

          {svcError && <p style={{ color: 'red' }}>{svcError}</p>}
          {svcSuccess && <p style={{ color: 'green' }}>{svcSuccess}</p>}

          <button type="submit" disabled={svcSaving}>
            {svcSaving ? 'Guardando...' : svcEditingId ? 'Guardar cambios' : 'Crear servicio'}
          </button>{' '}
          {svcEditingId && (
            <button type="button" onClick={resetServiceForm}>
              Cancelar edición
            </button>
          )}
        </form>
      )}
    </div>
  )
}

export default Services
