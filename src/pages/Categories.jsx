import DataList from '../components/ui/DataList'
import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import Field from '../components/ui/Field'
import { fieldControlClasses } from '../components/ui/fieldStyles'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import Badge from '../components/ui/Badge'

export default function Categories() {
  const { membership } = useAuth()
  const businessId = membership?.businessId
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

  return <div className="space-y-6"><PageHeader title="Categorías" description="Organiza las categorías de tus servicios." />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 items-start [&>*]:min-w-0"><Card title="Categorías">
        {categoriesListError && (
          <Alert tone="error">Error al cargar categorías: {categoriesListError}</Alert>
        )}

        {categoriesLoading ? (
          <p className="text-sm text-muted">Cargando categorías...</p>
        ) : categories.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay categorías.</p>
        ) : (
          <DataList items={categories} label="Categorías" >{rows => <div className="overflow-x-auto">
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
                {rows.map((cat) => (
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
                        <Button
                          variant="ghost"
                          className="px-2 py-1"
                          onClick={() => loadCategoryForEdit(cat)}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          className="px-2 py-1"
                          onClick={() => toggleCategoryActive(cat)}
                        >
                          {cat.isActive ? 'Desactivar' : 'Activar'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}</DataList>
        )}

      </Card><Card title="Gestionar categoría">
        <form
          onSubmit={handleCategorySubmit}
          noValidate
          className="space-y-4"
        >
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
      </Card></div>

  </div>
}
