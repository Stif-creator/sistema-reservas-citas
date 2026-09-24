import { useEffect, useState } from 'react'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import WeeklyHoursEditor from '../components/WeeklyHoursEditor'
import { hasInvalidWeeklyHoursSlot } from '../lib/hours'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import Field, { fieldControlClasses } from '../components/ui/Field'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'

const PHONE_REGEX = /^\+?\d{8,}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function BusinessSettings() {
  const { membership } = useAuth()
  const businessId = membership?.businessId

  const [loadingBusiness, setLoadingBusiness] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#1672ed')
  const [secondaryColor, setSecondaryColor] = useState('#eaf3ff')
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

  // --- Sección: horario de atención ---
  const [weeklyHours, setWeeklyHours] = useState({})
  const [hoursError, setHoursError] = useState('')
  const [hoursSuccess, setHoursSuccess] = useState('')
  const [hoursSaving, setHoursSaving] = useState(false)

  useEffect(() => {
    let active = true
    async function fetchBusiness() {
      setLoadingBusiness(true)
      setLoadError('')
      try {
        if (!businessId) throw new Error('Sin negocio')
        const snap = await getDoc(doc(db, 'businesses', businessId))
        if (!active) return
        if (!snap.exists()) throw new Error('Negocio no encontrado')
        if (snap.exists()) {
          const data = snap.data()
          setName(data.name ?? '')
          setDescription(data.description ?? '')
          setLogoUrl(data.logo?.url ?? '')
          setCoverUrl(data.cover?.url ?? '')
          setPrimaryColor(data.appearance?.primaryColor ?? '#1672ed')
          setSecondaryColor(data.appearance?.secondaryColor ?? '#eaf3ff')
          setContactPhone(data.contact?.phone ?? '')
          setContactWhatsapp(data.contact?.whatsapp ?? '')
          setContactEmail(data.contact?.email ?? '')
          setAddressLine(data.location?.addressLine ?? '')
          setCity(data.location?.city ?? '')
          setStateRegion(data.location?.stateRegion ?? '')
          setCountryCode(data.location?.countryCode ?? '')
          setWeeklyHours(data.weeklyHours ?? {})
        }
      } catch {
        if (active) setLoadError('No se pudo cargar la configuración del negocio.')
      } finally {
        if (active) setLoadingBusiness(false)
      }
    }
    fetchBusiness()
    return () => {
      active = false
    }
  }, [businessId, loadAttempt])

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

    setHoursSaving(true)
    try {
      await updateDoc(doc(db, 'businesses', businessId), {
        weeklyHours,
        updatedAt: serverTimestamp(),
      })
      setHoursSuccess('Horario guardado.')
    } catch (err) {
      console.error('Error al guardar el horario del negocio', err)
      setHoursError('No se pudo guardar el horario. Intenta de nuevo.')
    } finally {
      setHoursSaving(false)
    }
  }

  if (loadError)
    return (
      <div className="space-y-4">
        <Alert>{loadError}</Alert>
        <Button onClick={() => setLoadAttempt((n) => n + 1)}>Reintentar</Button>
      </div>
    )

  if (loadingBusiness) {
    return <p className="text-sm text-muted">Cargando configuración del negocio...</p>
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Configuración"
        description="Datos generales, imágenes, contacto y ubicación de tu negocio."
      />

      <Card title="Tu página pública">
        <p className="mb-3 text-sm text-muted">
          Comparte este enlace con tus clientes. El logo, la portada y los colores se aplican
          también al inicio de sesión y registro.
        </p>
        <a
          className="break-all text-primary underline"
          href={`/b/${businessId}`}
          target="_blank"
          rel="noreferrer"
        >
          {window.location.origin}/b/{businessId}
        </a>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card title="Datos generales">
          <div className="space-y-4">
            <Field label="Nombre" htmlFor="name" error={fieldErrors.name}>
              <input
                id="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  clearFieldError('name')
                }}
                className={fieldControlClasses(Boolean(fieldErrors.name))}
              />
            </Field>

            <Field label="Descripción" htmlFor="description">
              <textarea
                id="description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={fieldControlClasses(false)}
              />
            </Field>
          </div>
        </Card>

        <Card title="Imágenes">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="URL del logo" htmlFor="logoUrl">
              <input
                id="logoUrl"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className={fieldControlClasses(false)}
              />
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt="Vista previa del logo"
                  className="mt-2 h-16 w-16 rounded-lg border border-border object-cover"
                />
              )}
            </Field>

            <Field label="URL de la portada" htmlFor="coverUrl">
              <input
                id="coverUrl"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                className={fieldControlClasses(false)}
              />
              {coverUrl && (
                <img
                  src={coverUrl}
                  alt="Vista previa de la portada"
                  className="mt-2 h-24 w-full rounded-lg border border-border object-cover"
                />
              )}
            </Field>
          </div>
        </Card>

        <Card title="Colores">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Color primario" htmlFor="primaryColor">
              <input
                id="primaryColor"
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-16 cursor-pointer rounded-lg border border-border bg-white p-1"
              />
            </Field>

            <Field label="Color secundario" htmlFor="secondaryColor">
              <input
                id="secondaryColor"
                type="color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="h-10 w-16 cursor-pointer rounded-lg border border-border bg-white p-1"
              />
            </Field>
          </div>
        </Card>

        <Card title="Contacto">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Teléfono" htmlFor="contactPhone" error={fieldErrors.contactPhone}>
              <input
                id="contactPhone"
                value={contactPhone}
                onChange={(e) => {
                  setContactPhone(e.target.value)
                  clearFieldError('contactPhone')
                }}
                className={fieldControlClasses(Boolean(fieldErrors.contactPhone))}
              />
            </Field>

            <Field label="WhatsApp" htmlFor="contactWhatsapp" error={fieldErrors.contactWhatsapp}>
              <input
                id="contactWhatsapp"
                value={contactWhatsapp}
                onChange={(e) => {
                  setContactWhatsapp(e.target.value)
                  clearFieldError('contactWhatsapp')
                }}
                className={fieldControlClasses(Boolean(fieldErrors.contactWhatsapp))}
              />
            </Field>

            <Field label="Email" htmlFor="contactEmail" error={fieldErrors.contactEmail}>
              <input
                id="contactEmail"
                type="email"
                value={contactEmail}
                onChange={(e) => {
                  setContactEmail(e.target.value)
                  clearFieldError('contactEmail')
                }}
                className={fieldControlClasses(Boolean(fieldErrors.contactEmail))}
              />
            </Field>
          </div>
        </Card>

        <Card title="Ubicación">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Dirección" htmlFor="addressLine">
              <input
                id="addressLine"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                className={fieldControlClasses(false)}
              />
            </Field>

            <Field label="Ciudad" htmlFor="city">
              <input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={fieldControlClasses(false)}
              />
            </Field>

            <Field label="Departamento / Región" htmlFor="stateRegion">
              <input
                id="stateRegion"
                value={stateRegion}
                onChange={(e) => setStateRegion(e.target.value)}
                className={fieldControlClasses(false)}
              />
            </Field>

            <Field label="Código de país" htmlFor="countryCode">
              <input
                id="countryCode"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className={fieldControlClasses(false)}
              />
            </Field>
          </div>
        </Card>

        {error && <Alert tone="error">{error}</Alert>}
        {success && <Alert tone="success">{success}</Alert>}

        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </form>

      <form onSubmit={handleHoursSubmit}>
        <Card
          title="Horario de atención"
          description="Define las franjas en las que tu negocio atiende cada día."
        >
          <WeeklyHoursEditor value={weeklyHours} onChange={setWeeklyHours} />

          <div className="mt-4 space-y-3">
            {hoursError && <Alert tone="error">{hoursError}</Alert>}
            {hoursSuccess && <Alert tone="success">{hoursSuccess}</Alert>}

            <Button type="submit" disabled={hoursSaving}>
              {hoursSaving ? 'Guardando...' : 'Guardar horario'}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  )
}

export default BusinessSettings
