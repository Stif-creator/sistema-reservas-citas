import { useEffect, useState } from 'react'
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

const PHONE_REGEX = /^\+?\d{8,}$/

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
  }

  function closeEditor() {
    setEditingId(null)
  }

  async function toggleProfessionalActive(prof) {
    setActionError('')
    try {
      await updateDoc(doc(db, 'professionals', prof.id), {
        isActive: !prof.isActive,
        updatedAt: serverTimestamp(),
      })
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
      errors.phone = 'Ingresa un teléfono válido: solo dígitos (puede empezar con "+"), mínimo 8 dígitos.'
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
      <h2>Profesionales</h2>

      {professionalsListError && (
        <p style={{ color: 'red' }}>Error al cargar profesionales: {professionalsListError}</p>
      )}
      {actionError && <p style={{ color: 'red' }}>{actionError}</p>}

      {professionalsLoading ? (
        <p>Cargando profesionales...</p>
      ) : professionals.length === 0 ? (
        <p>Todavía no hay profesionales registrados en este negocio.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Puesto</th>
              <th>Servicios asignados</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {professionals.map((prof) => (
              <tr key={prof.id}>
                <td>{prof.displayName}</td>
                <td>{prof.jobTitle || '—'}</td>
                <td>{prof.serviceIds?.length ?? 0}</td>
                <td>{prof.isActive ? 'Activo' : 'Inactivo'}</td>
                <td>
                  <button type="button" onClick={() => loadProfessionalForEdit(prof)}>
                    Editar
                  </button>{' '}
                  <button type="button" onClick={() => toggleProfessionalActive(prof)}>
                    {prof.isActive ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editingProfessional && (
        <div style={{ border: '1px solid #ccc', padding: 16, marginTop: 24 }}>
          <h3>
            Editando a {editingProfessional.displayName} ({editingProfessional.email})
          </h3>
          <button type="button" onClick={closeEditor}>
            Cerrar
          </button>

          <h4>Datos del perfil</h4>
          <form onSubmit={handleProfileSubmit} noValidate>
            <div>
              <label htmlFor="jobTitle">Puesto</label>
              <input id="jobTitle" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>

            <div>
              <label htmlFor="bio">Biografía</label>
              <textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} />
            </div>

            <div>
              <label htmlFor="phone">Teléfono</label>
              <input
                id="phone"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value)
                  clearProfileFieldError('phone')
                }}
              />
              {profileFieldErrors.phone && <p style={{ color: 'red' }}>{profileFieldErrors.phone}</p>}
            </div>

            <div>
              <label htmlFor="photoUrl">URL de la foto</label>
              <input id="photoUrl" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} />
              {photoUrl && (
                <img
                  src={photoUrl}
                  alt="Vista previa de la foto"
                  style={{ maxWidth: 150, display: 'block', marginTop: 8 }}
                />
              )}
            </div>

            {profileError && <p style={{ color: 'red' }}>{profileError}</p>}
            {profileSuccess && <p style={{ color: 'green' }}>{profileSuccess}</p>}

            <button type="submit" disabled={profileSaving}>
              {profileSaving ? 'Guardando...' : 'Guardar perfil'}
            </button>
          </form>

          <h4>Servicios asignados</h4>
          {servicesListError && (
            <p style={{ color: 'red' }}>Error al cargar servicios: {servicesListError}</p>
          )}
          <form onSubmit={handleServicesSubmit}>
            {servicesLoading ? (
              <p>Cargando servicios...</p>
            ) : services.length === 0 ? (
              <p>Todavía no hay servicios creados en este negocio.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {services.map((svc) => (
                  <li key={svc.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedServiceIds.has(svc.id)}
                        onChange={() => toggleServiceSelected(svc.id)}
                      />{' '}
                      {svc.name}
                      {!svc.isActive && ' (inactivo)'}
                    </label>
                  </li>
                ))}
              </ul>
            )}

            {svcAssignError && <p style={{ color: 'red' }}>{svcAssignError}</p>}
            {svcAssignSuccess && <p style={{ color: 'green' }}>{svcAssignSuccess}</p>}

            <button type="submit" disabled={svcAssignSaving || services.length === 0}>
              {svcAssignSaving ? 'Guardando...' : 'Guardar servicios'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

export default Professionals
