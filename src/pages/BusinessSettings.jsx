import SettingsPreview from '../components/SettingsPreview'
import BusinessMap from '../components/BusinessMap'
import { Building2, Image, Clock3, FileText, Phone, ExternalLink, Save, Info } from 'lucide-react'
import './business-settings.css'
import ImageUploadField from '../components/ImageUploadField'
import { useEffect, useState } from 'react'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'
import WeeklyHoursEditor from '../components/WeeklyHoursEditor'
import { hasInvalidWeeklyHoursSlot } from '../lib/hours'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import Field from '../components/ui/Field'
import { fieldControlClasses } from '../components/ui/fieldStyles'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import { aboutFields, defaultAbout } from '../lib/businessAbout'

const PHONE_REGEX = /^\+?\d{8,}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function BusinessSettings() {
  const { membership, isSuperadmin } = useAuth()
  const businessId = membership?.businessId
  const [publicPageEnabled, setPublicPageEnabled] = useState(false)

  const [loadingBusiness, setLoadingBusiness] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)

  const [tab, setTab] = useState('general')
  const [timeZone, setTimeZone] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [about, setAbout] = useState(defaultAbout)
  const [logoUrl, setLogoUrl] = useState('')
  const [imageUploading, setImageUploading] = useState(false)
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
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')

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
          setTimeZone(data.settings?.timezone || 'America/La_Paz')
          setPublicPageEnabled(data.settings?.publicPageEnabled === true)
          setName(data.name ?? '')
          setDescription(data.description ?? '')
          setAbout(Object.fromEntries(Object.entries(defaultAbout).map(([key, fallback]) => [key, data.about?.[key] ?? fallback])))
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
          setLatitude(data.location?.latitude ?? '')
          setLongitude(data.location?.longitude ?? '')
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
    if (imageUploading) return
    setError('')
    setSuccess('')

    const errors = validate()
    if ((latitude !== '' || longitude !== '') && (latitude === '' || longitude === '' || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude)) || Math.abs(Number(latitude)) > 85 || Math.abs(Number(longitude)) > 180)) {
      setTab('contact'); setError('Ingresa ambas coordenadas: latitud entre -85 y 85 y longitud entre -180 y 180.'); return
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setTab(errors.name ? 'general' : 'contact')
      return
    }

    setSaving(true)
    try {
      // Reescribimos cada sub-objeto completo (no dot-notation) para que
      // sea fácil de razonar: lo que se ve en el formulario es
      // exactamente lo que queda guardado en cada campo.
      await updateDoc(doc(db, 'businesses', businessId), {
        ...(isSuperadmin ? { name: name.trim() } : {}),
        description,
        'settings.publicPageEnabled': publicPageEnabled,
        about: Object.fromEntries(aboutFields.map(([key, , max]) => [key, about[key].trim().slice(0, max)])),
        logo: { url: logoUrl.trim() },
        cover: { url: coverUrl.trim() },
        ...(isSuperadmin ? { appearance: { primaryColor, secondaryColor } } : {}),
        contact: {
          phone: contactPhone.trim(),
          whatsapp: contactWhatsapp.trim(),
          email: contactEmail.trim(),
        },
        location: {
          latitude: latitude === '' ? null : Number(latitude),
          longitude: longitude === '' ? null : Number(longitude),
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

  const tabs = [['general', 'Datos generales', Building2], ['images', 'Imágenes', Image], ['hours', 'Horarios', Clock3], ['about', 'Página nosotros', FileText], ['contact', 'Contacto', Phone]]
  return <div className="settings-page">
    <PageHeader title="Configuración" description="Personaliza la información de tu negocio y tu página pública."
      actions={<a className="settings-public-link" href={`/b/${businessId}`} target="_blank" rel="noreferrer"><ExternalLink size={15} />Ver página pública</a>} />
    <div className="settings-tabs" role="tablist" aria-label="Secciones de configuración">
      {tabs.map(([key, label, Icon]) => <button key={key} type="button" id={`settings-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`settings-panel-${key}`} tabIndex={tab === key ? 0 : -1}
        onClick={() => setTab(key)} onKeyDown={event => {
          const index = tabs.findIndex(([value]) => value === key)
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
          if (next !== null) { event.preventDefault(); setTab(tabs[next][0]); document.getElementById(`settings-tab-${tabs[next][0]}`)?.focus() }
        }}><Icon size={19} />{label}</button>)}
    </div>
    <form id="settings-business" onSubmit={handleSubmit} noValidate>
<div id="settings-panel-general" role="tabpanel" aria-labelledby="settings-tab-general" hidden={tab !== 'general'}><div className="settings-columns"><div className="settings-fields"><Card title="Datos generales"><label className="block mb-4 text-sm"><input type="checkbox" checked={publicPageEnabled} onChange={e => setPublicPageEnabled(e.target.checked)} /> Publicar página del negocio</label>{!isSuperadmin && <p className="mb-4 text-sm text-muted">El nombre y los colores los configura el superadministrador.</p>}
          <div className="space-y-4">
            <Field label="Nombre" htmlFor="name" error={fieldErrors.name}>
              <input
                id="name" disabled={!isSuperadmin}
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
        </Card><Card title="Colores">{!isSuperadmin && <p className="text-sm text-muted mb-3">Los colores los gestiona el superadministrador de la plataforma.</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Color primario" htmlFor="primaryColor">
              <input
                id="primaryColor" disabled={!isSuperadmin}
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-16 cursor-pointer rounded-lg border border-border bg-white p-1"
              />
            </Field>

            <Field label="Color secundario" htmlFor="secondaryColor">
              <input
                id="secondaryColor" disabled={!isSuperadmin}
                type="color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="h-10 w-16 cursor-pointer rounded-lg border border-border bg-white p-1"
              />
            </Field>
          </div>
        </Card></div><div className="settings-preview-column"><SettingsPreview {...{ tab, name, description, logoUrl, coverUrl, primaryColor, secondaryColor, about, contactPhone, contactWhatsapp, contactEmail, addressLine, city }} /></div></div></div>
<div id="settings-panel-images" role="tabpanel" aria-labelledby="settings-tab-images" hidden={tab !== 'images'}><div className="settings-columns"><div className="settings-fields"><Card title="Imágenes">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ImageUploadField label="Logo" value={logoUrl} onChange={setLogoUrl} businessId={businessId} kind="logo" disabled={saving || imageUploading} onBusyChange={setImageUploading} />

            <ImageUploadField label="Portada" value={coverUrl} onChange={setCoverUrl} businessId={businessId} kind="cover" disabled={saving || imageUploading} onBusyChange={setImageUploading} />
          </div>
        </Card></div><div className="settings-preview-column"><SettingsPreview {...{ tab, name, description, logoUrl, coverUrl, primaryColor, secondaryColor, about, contactPhone, contactWhatsapp, contactEmail, addressLine, city }} /></div></div></div>
<div id="settings-panel-about" role="tabpanel" aria-labelledby="settings-tab-about" hidden={tab !== 'about'}><div className="settings-columns"><div className="settings-fields"><Card title="Página Nosotros">
          <p className="mb-4 text-sm text-muted">Personaliza la historia, misión y valores que se muestran en la página pública y en el panel del cliente. Los campos vacíos utilizan el texto inicial.</p>
          <div className="grid gap-4">
            {aboutFields.map(([key, label, max]) => <Field key={key} label={label} htmlFor={`about-${key}`}>
              {key === 'title' ? <input id={`about-${key}`} value={about[key]} maxLength={max} onChange={event => setAbout(previous => ({ ...previous, [key]: event.target.value }))} className={fieldControlClasses(false)} />
                : <textarea id={`about-${key}`} value={about[key]} rows={key === 'story' ? 6 : 3} maxLength={max} onChange={event => setAbout(previous => ({ ...previous, [key]: event.target.value }))} className={fieldControlClasses(false)} />}
            </Field>)}
          </div>
        </Card></div><div className="settings-preview-column"><SettingsPreview {...{ tab, name, description, logoUrl, coverUrl, primaryColor, secondaryColor, about, contactPhone, contactWhatsapp, contactEmail, addressLine, city }} /></div></div></div>
<div id="settings-panel-contact" role="tabpanel" aria-labelledby="settings-tab-contact" hidden={tab !== 'contact'}><div className="settings-columns"><div className="settings-fields"><Card title="Contacto">
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
        </Card><Card title="Ubicación">
          <p className="text-sm text-muted mb-4">Para mostrar el mapa, copia las coordenadas del local desde tu aplicación de mapas. No necesitas contratar una API.</p>
          <div className="grid sm:grid-cols-2 gap-4 mb-4"><Field label="Latitud del mapa" htmlFor="latitude"><input id="latitude" type="number" step="any" value={latitude} onChange={e => setLatitude(e.target.value)} className={fieldControlClasses(false)} /></Field><Field label="Longitud del mapa" htmlFor="longitude"><input id="longitude" type="number" step="any" value={longitude} onChange={e => setLongitude(e.target.value)} className={fieldControlClasses(false)} /></Field></div>
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
        </Card></div><div className="settings-preview-column"><SettingsPreview {...{ tab, name, description, logoUrl, coverUrl, primaryColor, secondaryColor, about, contactPhone, contactWhatsapp, contactEmail, addressLine, city }} /><Card title="Ubicación en el mapa">{tab === 'contact' && <BusinessMap business={{ name, location: { latitude: latitude === '' ? null : Number(latitude), longitude: longitude === '' ? null : Number(longitude), addressLine, city } }} />}</Card></div></div></div>
    </form>
    <div id="settings-panel-hours" role="tabpanel" aria-labelledby="settings-tab-hours" hidden={tab !== 'hours'}>
      <div className="settings-columns settings-hours-columns"><div>      <form id="settings-hours" onSubmit={handleHoursSubmit}>
        <Card
          title="Horario de atención"
          description="Define las franjas en las que tu negocio atiende cada día."
        >
          <WeeklyHoursEditor value={weeklyHours} onChange={setWeeklyHours} />

          <div className="mt-4 space-y-3">
            {hoursError && <Alert tone="error">{hoursError}</Alert>}
            {hoursSuccess && <Alert tone="success">{hoursSuccess}</Alert>}


          </div>
        </Card>
      </form></div><Card title="Zona horaria" description="Las horas de atención corresponden a la zona horaria del negocio.">
        <div className="settings-zone"><Clock3 size={19} />{timeZone}</div>
        <div className="settings-advice"><h3><Info size={18} /> Recomendaciones</h3><p>Evita superponer franjas de atención.</p><p>Deja tiempo entre citas para preparar tu espacio.</p><p>Mantén tus horarios actualizados para que tus clientes encuentren disponibilidad.</p></div>
      </Card></div>
    </div>
    <div className="settings-savebar"><div><p>Configuración del negocio</p><small>{tab === 'hours' ? 'Guarda el horario de atención.' : 'Guarda para aplicar los cambios en tu página pública.'}</small>
      {error && <Alert tone="error">{error}</Alert>}{success && <Alert tone="success">{success}</Alert>}</div>
      <Button type="submit" form={tab === 'hours' ? 'settings-hours' : 'settings-business'} disabled={saving || hoursSaving || imageUploading}><Save size={17} />{saving || hoursSaving ? 'Guardando...' : tab === 'hours' ? 'Guardar horario' : 'Guardar cambios'}</Button>
    </div>
  </div>
}

export default BusinessSettings
