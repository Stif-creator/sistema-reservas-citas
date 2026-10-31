import { markFormSaved, markFormSectionSaved } from '../lib/unsavedForms'
import { updateBusinessWithAudit } from '../lib/audit'
import SettingsPreview from '../components/SettingsPreview'
import LocationPickerMap from '../components/LocationPickerMap'
import { Building2, Image, Clock3, FileText, Phone, ExternalLink, Save, Info, MapPin, Palette, ShieldCheck, ArrowLeft } from 'lucide-react'
import './business-settings.css'
import { Link, useParams } from 'react-router-dom'
import PlatformBusinessAdministration from '../components/PlatformBusinessAdministration'
import ImageUploadField from '../components/ImageUploadField'
import { useEffect, useState } from 'react'
import { doc, getDoc, serverTimestamp } from 'firebase/firestore'
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
import { useFeedback } from '../context/feedback-context'

const PHONE_REGEX = /^\+?\d{8,}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function HexColorControl({ id, label, value, onChange, disabled }) {
  const [draft, setDraft] = useState(value)
  const valid = /^#[\da-f]{6}$/i.test(draft)
  return <Field label={label} htmlFor={id} error={!valid ? 'Usa un color hexadecimal como #6A44FF.' : undefined}>
    <div className="settings-color-input"><input id={id} type="color" value={valid ? draft : '#ffffff'} disabled={disabled} onChange={event => { setDraft(event.target.value); onChange(event.target.value) }} aria-label={`Selector ${label}`} /><input type="text" value={draft} disabled={disabled} maxLength={7} pattern="#[0-9a-fA-F]{6}" onChange={event => { setDraft(event.target.value); if (/^#[\da-f]{6}$/i.test(event.target.value)) onChange(event.target.value) }} aria-label={`Codigo hexadecimal ${id}`} aria-invalid={!valid} /></div>
  </Field>
}

function BusinessSettings({ platform = false }) {
  const { businessId: routeBusinessId } = useParams()
  const { membership } = useAuth()
  const businessId = platform ? routeBusinessId : membership?.businessId
  return <BusinessSettingsForm key={businessId} businessId={businessId} platform={platform} />
}

function BusinessSettingsForm({ businessId, platform }) {
  const { isSuperadmin } = useAuth()
  const { notify } = useFeedback()
  const [business, setBusiness] = useState(null)
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
  const [accentColor, setAccentColor] = useState('#d97706')
  const [surfaceColor, setSurfaceColor] = useState('#f4f6f8')
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
  const [savingLocation, setSavingLocation] = useState(false)

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
          setBusiness({ ...data, id: snap.id })
          setTimeZone(data.settings?.timezone || 'America/La_Paz')
          setPublicPageEnabled(data.settings?.publicPageEnabled === true)
          setName(data.name ?? '')
          setDescription(data.description ?? '')
          setAbout(Object.fromEntries(Object.entries(defaultAbout).map(([key, fallback]) => [key, data.about?.[key] ?? fallback])))
          setLogoUrl(data.logo?.url ?? '')
          setCoverUrl(data.cover?.url ?? '')
          setPrimaryColor(data.appearance?.primaryColor ?? '#1672ed')
          setSecondaryColor(data.appearance?.secondaryColor ?? '#eaf3ff')
          setAccentColor(data.appearance?.accentColor ?? '#d97706')
          setSurfaceColor(data.appearance?.surfaceColor ?? '#f4f6f8')
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

    if (!name.trim() || name.trim().length > 120) {
      errors.name = 'Ingresa un nombre de entre 1 y 120 caracteres.'
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
    if (imageUploading || saving || savingLocation || hoursSaving) return
    setError('')
    setSuccess('')
    if (isSuperadmin && e.currentTarget.querySelector('[aria-invalid="true"]')) {
      setError('Corrige los colores hexadecimales antes de guardar.')
      return
    }

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
      await updateBusinessWithAudit(businessId, {
        ...(isSuperadmin ? { name: name.trim() } : {}),
        description,
        ...(isSuperadmin ? { 'settings.publicPageEnabled': publicPageEnabled } : {}),
        about: Object.fromEntries(aboutFields.map(([key, , max]) => [key, about[key].trim().slice(0, max)])),
        logo: { url: logoUrl.trim() },
        cover: { url: coverUrl.trim() },
        ...(isSuperadmin ? { appearance: { primaryColor, secondaryColor, accentColor, surfaceColor } } : {}),
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
      markFormSaved(e.target, false); setSuccess('Cambios guardados.')
    } catch (err) {
      console.error('Error al guardar el negocio', err)
      setError('No se pudieron guardar los cambios. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function handleHoursSubmit(e) {
    e.preventDefault()
    if (saving || savingLocation || hoursSaving || imageUploading) return
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
      await updateBusinessWithAudit(businessId, {
        weeklyHours,
        updatedAt: serverTimestamp(),
      })
      markFormSaved(e.target, false); setHoursSuccess('Horario guardado.')
    } catch (err) {
      console.error('Error al guardar el horario del negocio', err)
      setHoursError('No se pudo guardar el horario. Intenta de nuevo.')
    } finally {
      setHoursSaving(false)
    }
  }

  async function handleLocationSave() {
    if (savingLocation || saving || hoursSaving || !businessId) return
    if ((latitude === '') !== (longitude === '') || (latitude !== '' && (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude)) || Math.abs(Number(latitude)) > 85 || Math.abs(Number(longitude)) > 180))) {
      setTab('contact')
      setError('Selecciona una ubicación válida en el mapa antes de guardar.')
      return
    }
    setSavingLocation(true)
    setError('')
    try {
      const location = { latitude: latitude === '' ? null : Number(latitude), longitude: longitude === '' ? null : Number(longitude), addressLine: addressLine.trim(), city: city.trim(), stateRegion: stateRegion.trim(), countryCode: countryCode.trim() }
      await updateBusinessWithAudit(businessId, { location })
      const form = document.querySelector('#settings-panel-contact')?.closest('form')
      if (form) markFormSectionSaved(form, ['latitude', 'longitude', 'addressLine', 'city', 'stateRegion', 'countryCode'])
      setSuccess('Ubicación guardada.')
      notify({ title: 'Ubicación guardada', message: 'La dirección y las coordenadas del negocio se actualizaron.', type: 'success' })
    } catch (saveError) {
      console.error('Error al guardar la ubicación del negocio', saveError)
      setError('No se pudo guardar la ubicación. Los datos guardados anteriormente se conservan.')
      notify({ title: 'No se pudo guardar la ubicación', message: 'Comprueba tu conexión y los permisos del negocio antes de volver a intentarlo.', type: 'error' })
    } finally { setSavingLocation(false) }
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

  const tabs = [['general', 'Datos generales', Building2], ['appearance', 'Apariencia', Palette], ['images', 'Imágenes', Image], ['about', 'Página nosotros', FileText], ['contact', 'Contacto', Phone], ['hours', 'Horarios', Clock3], ...(platform ? [['administration', 'Administración', ShieldCheck]] : [])]
  const backTo = platform ? `/plataforma/negocios/${encodeURIComponent(businessId)}` : '/dashboard'
  return <div className="settings-page">
    {platform && <Link className="platform-back-link mb-4" to={backTo}><ArrowLeft size={15} />Volver al negocio</Link>}
    <PageHeader title={platform ? `Editar negocio: ${business?.name || name}` : 'Configuración'} description="Personaliza la información del negocio y su página pública."
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
    <fieldset disabled={saving || savingLocation || hoursSaving || imageUploading}>
<div id="settings-panel-general" role="tabpanel" aria-labelledby="settings-tab-general" hidden={tab !== 'general'}><div className="settings-columns"><div className="settings-fields"><Card title="Datos generales">{!isSuperadmin && <p className="mb-4 text-sm text-muted">La publicación de la página la controla el superadministrador.</p>}
          <div className="space-y-4">
            <Field label="Nombre" htmlFor="name" error={fieldErrors.name}>
              <input
                id="name" maxLength={120} disabled={!isSuperadmin}
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
        </Card></div><div className="settings-preview-column"><SettingsPreview {...{ tab, name, description, logoUrl, coverUrl, primaryColor, secondaryColor, accentColor, surfaceColor, about, contactPhone, contactWhatsapp, contactEmail, addressLine, city, stateRegion, countryCode, weeklyHours, timeZone }} published={publicPageEnabled} /></div></div></div>
<div id="settings-panel-appearance" role="tabpanel" aria-labelledby="settings-tab-appearance" hidden={tab !== 'appearance'}><div className="settings-columns"><div className="settings-fields"><Card title="Identidad visual">{!isSuperadmin && <p className="text-sm text-muted mb-3">Los colores de tu negocio son administrados por la plataforma.</p>}{isSuperadmin && <label className="settings-publish-control"><input type="checkbox" checked={publicPageEnabled} onChange={e => setPublicPageEnabled(e.target.checked)} /> Publica tu pagina para los clientes <span>{publicPageEnabled ? "Publicada" : "No publicada"}</span></label>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <HexColorControl key={`${primaryColor}`} id="primaryColor" label="Color primario" value={primaryColor} onChange={setPrimaryColor} disabled={!isSuperadmin} />
            <HexColorControl key={`${secondaryColor}`} id="secondaryColor" label="Color secundario" value={secondaryColor} onChange={setSecondaryColor} disabled={!isSuperadmin} />
            <HexColorControl key={`${accentColor}`} id="accentColor" label="Color de acento" value={accentColor} onChange={setAccentColor} disabled={!isSuperadmin} />
            <HexColorControl key={`${surfaceColor}`} id="surfaceColor" label="Color de superficie" value={surfaceColor} onChange={setSurfaceColor} disabled={!isSuperadmin} />
          </div>
          {isSuperadmin && <Button type="button" variant="secondary" className="mt-4" onClick={() => { setPrimaryColor('#1672ed'); setSecondaryColor('#eaf3ff'); setAccentColor('#d97706'); setSurfaceColor('#f4f6f8') }}>Restablecer colores predeterminados</Button>}
          <p className="mt-3 text-xs text-muted">El acento destaca detalles y la superficie colorea la vista previa. El texto se ajusta automáticamente para mantener el contraste.</p>
        </Card></div><div className="settings-preview-column"><SettingsPreview {...{ tab, name, description, logoUrl, coverUrl, primaryColor, secondaryColor, accentColor, surfaceColor, about, contactPhone, contactWhatsapp, contactEmail, addressLine, city, stateRegion, countryCode, weeklyHours, timeZone }} published={publicPageEnabled} /></div></div></div>
<div id="settings-panel-images" role="tabpanel" aria-labelledby="settings-tab-images" hidden={tab !== 'images'}><div className="settings-columns"><div className="settings-fields"><Card title="Imágenes">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ImageUploadField label="Logo" value={logoUrl} onChange={setLogoUrl} businessId={businessId} kind="logo" disabled={saving || imageUploading} onBusyChange={setImageUploading} />

            <ImageUploadField label="Portada" value={coverUrl} onChange={setCoverUrl} businessId={businessId} kind="cover" disabled={saving || imageUploading} onBusyChange={setImageUploading} />
          </div>
        </Card></div><div className="settings-preview-column"><SettingsPreview {...{ tab, name, description, logoUrl, coverUrl, primaryColor, secondaryColor, accentColor, surfaceColor, about, contactPhone, contactWhatsapp, contactEmail, addressLine, city, stateRegion, countryCode, weeklyHours, timeZone }} published={publicPageEnabled} /></div></div></div>
<div id="settings-panel-about" role="tabpanel" aria-labelledby="settings-tab-about" hidden={tab !== 'about'}><div className="settings-columns"><div className="settings-fields"><Card title="Página Nosotros">
          <p className="mb-4 text-sm text-muted">El administrador del negocio y el superadministrador pueden personalizar estos textos. Escribe valores propios de tu actividad, uno por línea; no hay textos específicos de un rubro. La visión es opcional y se muestra en Nosotros del cliente cuando tiene contenido.</p>
          <div className="settings-about-fields">
            {aboutFields.filter(([key]) => !['mission', 'vision'].includes(key)).map(([key, label, max]) => <Field key={key} label={label} htmlFor={`about-${key}`}
              hint={key === 'values' ? 'Escribe un valor en cada linea.' : key === 'story' ? 'Cuenta brevemente la historia de tu negocio.' : key === 'title' ? 'Un titulo claro que represente tu negocio.' : undefined}>
              {key === 'title' ? <input id={`about-${key}`} value={about[key]} maxLength={max} onChange={event => setAbout(previous => ({ ...previous, [key]: event.target.value }))} className={fieldControlClasses(false)} />
                : <textarea id={`about-${key}`} value={about[key]} rows={key === 'story' ? 5 : 4} maxLength={max} onChange={event => setAbout(previous => ({ ...previous, [key]: event.target.value }))} className={fieldControlClasses(false)} />}
            </Field>)}
            <div className="settings-about-pair">{aboutFields.filter(([key]) => ['mission', 'vision'].includes(key)).map(([key, label, max]) => <Field key={key} label={label} htmlFor={`about-${key}`} hint={key === 'mission' ? 'El proposito principal de tu negocio.' : 'La direccion que quieres seguir.'}>
              <textarea id={`about-${key}`} value={about[key]} rows={4} maxLength={max} onChange={event => setAbout(previous => ({ ...previous, [key]: event.target.value }))} className={fieldControlClasses(false)} />
            </Field>)}</div>
          </div>
        </Card></div><div className="settings-preview-column"><SettingsPreview {...{ tab, name, description, logoUrl, coverUrl, primaryColor, secondaryColor, accentColor, surfaceColor, about, contactPhone, contactWhatsapp, contactEmail, addressLine, city, stateRegion, countryCode, weeklyHours, timeZone }} published={publicPageEnabled} /></div></div></div>
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
          <p className="text-sm text-muted mb-4">Haz clic en el mapa para colocar el marcador, o arrástralo para ajustar la ubicación. No se activa la geolocalización de tu dispositivo.</p>
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

            <Field label="País (código ISO)" htmlFor="countryCode">
              <input
                id="countryCode"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className={fieldControlClasses(false)}
              />
            </Field>
          </div>
          <div className="mt-5"><LocationPickerMap latitude={latitude} longitude={longitude} onChange={(lat, lon) => { setLatitude(String(lat)); setLongitude(String(lon)) }} /></div>
          <div className="mt-5 flex justify-end"><Button type="button" disabled={savingLocation || saving || imageUploading} onClick={handleLocationSave}><MapPin size={16} />{savingLocation ? 'Guardando ubicación…' : 'Guardar ubicación'}</Button></div>
        </Card></div><div className="settings-preview-column"><SettingsPreview {...{ tab, name, description, logoUrl, coverUrl, primaryColor, secondaryColor, accentColor, surfaceColor, about, contactPhone, contactWhatsapp, contactEmail, addressLine, city, stateRegion, countryCode, weeklyHours, timeZone }} published={publicPageEnabled} /></div></div></div>
    </fieldset></form>
    <div id="settings-panel-hours" role="tabpanel" aria-labelledby="settings-tab-hours" hidden={tab !== 'hours'}>
      <div className="settings-columns settings-hours-columns"><div>      <form id="settings-hours" onSubmit={handleHoursSubmit}>
        <Card
          title="Horario de atención"
          description="Define las franjas en las que tu negocio atiende cada día."
        >
          <fieldset disabled={hoursSaving || saving || savingLocation || imageUploading}><WeeklyHoursEditor value={weeklyHours} onChange={setWeeklyHours} /></fieldset>

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
    {platform && <div id="settings-panel-administration" role="tabpanel" aria-labelledby="settings-tab-administration" hidden={tab !== 'administration'}>{tab === 'administration' && <PlatformBusinessAdministration business={business} onStatusChange={status => setBusiness(previous => ({ ...previous, status }))} />}</div>}
    <div className="settings-savebar"><div><p>Configuración del negocio</p><small>{tab === 'hours' ? 'Guarda el horario semanal.' : tab === 'contact' ? 'Guardar cambios aplica los datos del negocio; Guardar ubicacion guarda solo direccion y marcador.' : tab === 'appearance' ? 'Guarda identidad visual y publicacion.' : tab === 'images' ? 'La imagen se carga al seleccionarla; guarda para aplicarla al negocio.' : tab === 'about' ? 'Guarda los textos de Nosotros.' : 'Guarda los datos generales del negocio.'}</small>
      {error && <Alert tone="error">{error}</Alert>}{success && <Alert tone="success">{success}</Alert>}</div>
      <Link className="settings-public-link" to={backTo}>Cancelar</Link>
      {tab !== 'administration' && <Button type="submit" form={tab === 'hours' ? 'settings-hours' : 'settings-business'} disabled={saving || savingLocation || hoursSaving || imageUploading}><Save size={17} />{saving || hoursSaving ? 'Guardando...' : tab === 'hours' ? 'Guardar horario' : 'Guardar cambios'}</Button>}
    </div>
  </div>
}

export default BusinessSettings
