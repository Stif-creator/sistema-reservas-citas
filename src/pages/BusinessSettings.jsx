import { useEffect, useState } from 'react'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'

const PHONE_REGEX = /^\+?\d{8,}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function BusinessSettings() {
  const { membership } = useAuth()
  const businessId = membership?.businessId

  const [loadingBusiness, setLoadingBusiness] = useState(true)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#000000')
  const [secondaryColor, setSecondaryColor] = useState('#ffffff')
  const [contactPhone, setContactPhone] = useState('')
  const [contactWhatsapp, setContactWhatsapp] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [addressLine, setAddressLine] = useState('')
  const [city, setCity] = useState('')
  const [stateRegion, setStateRegion] = useState('')
  const [countryCode, setCountryCode] = useState('')

  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function fetchBusiness() {
      if (!businessId) return
      const snap = await getDoc(doc(db, 'businesses', businessId))
      if (snap.exists()) {
        const data = snap.data()
        setName(data.name ?? '')
        setDescription(data.description ?? '')
        setLogoUrl(data.logo?.url ?? '')
        setCoverUrl(data.cover?.url ?? '')
        setPrimaryColor(data.appearance?.primaryColor ?? '#000000')
        setSecondaryColor(data.appearance?.secondaryColor ?? '#ffffff')
        setContactPhone(data.contact?.phone ?? '')
        setContactWhatsapp(data.contact?.whatsapp ?? '')
        setContactEmail(data.contact?.email ?? '')
        setAddressLine(data.location?.addressLine ?? '')
        setCity(data.location?.city ?? '')
        setStateRegion(data.location?.stateRegion ?? '')
        setCountryCode(data.location?.countryCode ?? '')
      }
      setLoadingBusiness(false)
    }
    fetchBusiness()
  }, [businessId])

  function clearFieldError(key) {
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev))
  }

  function validate() {
    const errors = {}

    if (!name.trim()) {
      errors.name = 'El nombre del negocio es obligatorio.'
    }

    if (contactEmail.trim() && !EMAIL_REGEX.test(contactEmail.trim())) {
      errors.contactEmail = 'Ingresa un email válido.'
    }

    if (contactPhone.trim() && !PHONE_REGEX.test(contactPhone.trim())) {
      errors.contactPhone =
        'Ingresa un teléfono válido: solo dígitos (puede empezar con "+"), mínimo 8 dígitos.'
    }

    if (contactWhatsapp.trim() && !PHONE_REGEX.test(contactWhatsapp.trim())) {
      errors.contactWhatsapp =
        'Ingresa un WhatsApp válido: solo dígitos (puede empezar con "+"), mínimo 8 dígitos.'
    }

    return errors
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }

    setSaving(true)
    try {
      // Reescribimos cada sub-objeto completo (no dot-notation) para que
      // sea fácil de razonar: lo que se ve en el formulario es
      // exactamente lo que queda guardado en cada campo.
      await updateDoc(doc(db, 'businesses', businessId), {
        name: name.trim(),
        description,
        logo: { url: logoUrl.trim() },
        cover: { url: coverUrl.trim() },
        appearance: { primaryColor, secondaryColor },
        contact: {
          phone: contactPhone.trim(),
          whatsapp: contactWhatsapp.trim(),
          email: contactEmail.trim(),
        },
        location: {
          addressLine,
          city,
          stateRegion,
          countryCode,
        },
        updatedAt: serverTimestamp(),
      })
      setSuccess('Cambios guardados.')
    } catch (err) {
      console.error('Error al guardar el negocio', err)
      setError('No se pudieron guardar los cambios. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  if (loadingBusiness) {
    return <p>Cargando configuración del negocio...</p>
  }

  return (
    <div>
      <h2>Configuración del negocio</h2>
      <form onSubmit={handleSubmit} noValidate>
        <fieldset>
          <legend>Datos generales</legend>

          <div>
            <label htmlFor="name">Nombre</label>
            <input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                clearFieldError('name')
              }}
            />
            {fieldErrors.name && <p style={{ color: 'red' }}>{fieldErrors.name}</p>}
          </div>

          <div>
            <label htmlFor="description">Descripción</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </fieldset>

        <fieldset>
          <legend>Imágenes</legend>

          <div>
            <label htmlFor="logoUrl">URL del logo</label>
            <input id="logoUrl" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
            {logoUrl && (
              <img
                src={logoUrl}
                alt="Vista previa del logo"
                style={{ maxWidth: 150, display: 'block', marginTop: 8 }}
              />
            )}
          </div>

          <div>
            <label htmlFor="coverUrl">URL de la portada</label>
            <input id="coverUrl" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} />
            {coverUrl && (
              <img
                src={coverUrl}
                alt="Vista previa de la portada"
                style={{ maxWidth: 300, display: 'block', marginTop: 8 }}
              />
            )}
          </div>
        </fieldset>

        <fieldset>
          <legend>Colores</legend>

          <div>
            <label htmlFor="primaryColor">Color primario</label>
            <input
              id="primaryColor"
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="secondaryColor">Color secundario</label>
            <input
              id="secondaryColor"
              type="color"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
            />
          </div>
        </fieldset>

        <fieldset>
          <legend>Contacto</legend>

          <div>
            <label htmlFor="contactPhone">Teléfono</label>
            <input
              id="contactPhone"
              value={contactPhone}
              onChange={(e) => {
                setContactPhone(e.target.value)
                clearFieldError('contactPhone')
              }}
            />
            {fieldErrors.contactPhone && <p style={{ color: 'red' }}>{fieldErrors.contactPhone}</p>}
          </div>

          <div>
            <label htmlFor="contactWhatsapp">WhatsApp</label>
            <input
              id="contactWhatsapp"
              value={contactWhatsapp}
              onChange={(e) => {
                setContactWhatsapp(e.target.value)
                clearFieldError('contactWhatsapp')
              }}
            />
            {fieldErrors.contactWhatsapp && (
              <p style={{ color: 'red' }}>{fieldErrors.contactWhatsapp}</p>
            )}
          </div>

          <div>
            <label htmlFor="contactEmail">Email</label>
            <input
              id="contactEmail"
              type="email"
              value={contactEmail}
              onChange={(e) => {
                setContactEmail(e.target.value)
                clearFieldError('contactEmail')
              }}
            />
            {fieldErrors.contactEmail && <p style={{ color: 'red' }}>{fieldErrors.contactEmail}</p>}
          </div>
        </fieldset>

        <fieldset>
          <legend>Ubicación</legend>

          <div>
            <label htmlFor="addressLine">Dirección</label>
            <input id="addressLine" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} />
          </div>

          <div>
            <label htmlFor="city">Ciudad</label>
            <input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>

          <div>
            <label htmlFor="stateRegion">Departamento / Región</label>
            <input id="stateRegion" value={stateRegion} onChange={(e) => setStateRegion(e.target.value)} />
          </div>

          <div>
            <label htmlFor="countryCode">Código de país</label>
            <input id="countryCode" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} />
          </div>
        </fieldset>

        {error && <p style={{ color: 'red' }}>{error}</p>}
        {success && <p style={{ color: 'green' }}>{success}</p>}

        <button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  )
}

export default BusinessSettings
