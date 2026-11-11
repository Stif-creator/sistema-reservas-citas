import { useEffect, useRef, useState } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { Camera, Check, Eye, EyeOff, ImagePlus, KeyRound, Mail, Phone, Save, Shield, ShieldCheck, UserRound, X } from 'lucide-react'
import { useAuth } from '../context/auth-context'
import { useFeedback } from '../context/feedback-context'
import { db } from '../firebase/config'
import { safeImageUrl } from '../lib/brand'
import { uploadLocalImage } from '../lib/imageUpload'
import { isNativeImagePicker, pickNativeImage } from '../lib/nativeImagePicker'
import { confirmDiscard, markFormSaved, markFormSectionSaved } from '../lib/unsavedForms'
import useProfessionalProfile from '../hooks/useProfessionalProfile'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import { fieldControlClasses } from '../components/ui/fieldStyles'
import './account-security.css'
import './account-profile.css'

function initials(firstName = '', lastName = '') {
  return `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase() || '?'
}

function validPhone(value) {
  if (!value) return true
  const digits = value.replace(/\D/g, '')
  return /^[+0-9\s().-]+$/.test(value) && digits.length >= 8 && digits.length <= 15
}

function roleLabel(isSuperadmin, role) {
  return isSuperadmin ? 'Superadministrador' : role === 'admin' ? 'Administrador' : role === 'professional' ? 'Profesional' : 'Usuario'
}

function statusLabel(status) {
  return ({ active: 'Cuenta activa', pending: 'Cuenta pendiente', inactive: 'Cuenta inactiva', suspended: 'Cuenta suspendida' })[status] || 'Estado no disponible'
}

export default function AccountSecurity() {
  const { currentUser, userDoc, membership, isSuperadmin } = useAuth()
  const { confirm } = useFeedback()
  const [tab, setTab] = useState('personal')
  const [firstName, setFirstName] = useState(userDoc?.firstName || '')
  const [lastName, setLastName] = useState(userDoc?.lastName || '')
  const [phone, setPhone] = useState(userDoc?.phone || '')
  const [photoUrl, setPhotoUrl] = useState(userDoc?.photoUrl || null)
  const [professionalBio, setProfessionalBio] = useState('')
  const [professionalBioDirty, setProfessionalBioDirty] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [business, setBusiness] = useState({ id: '', name: '' })
  const [busy, setBusy] = useState(false)
  const [pickingPhoto, setPickingPhoto] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const profileFormRef = useRef(null)
  const professionalRole = isProfessional(membership)
  const { profile: professionalProfile, loading: professionalProfileLoading, error: professionalProfileError } = useProfessionalProfile(membership?.businessId, currentUser?.uid, professionalRole)

  useEffect(() => {
    if (professionalProfile && (!professionalBioDirty || professionalBio.trim() === (professionalProfile.bio || '').trim())) {
      setProfessionalBio(professionalProfile.bio || '')
      setProfessionalBioDirty(false)
    }
  }, [professionalProfile, professionalBioDirty, professionalBio])

  useEffect(() => {
    if (!professionalRole || !professionalProfile || professionalBioDirty || professionalBio !== (professionalProfile.bio || '')) return
    const frame = requestAnimationFrame(() => markFormSectionSaved(profileFormRef.current, selectedPhoto || removePhoto ? ['professionalBio'] : ['professionalBio', 'photoPreview']))
    return () => cancelAnimationFrame(frame)
  }, [professionalRole, professionalProfile, professionalBio, professionalBioDirty, selectedPhoto, removePhoto])

  useEffect(() => {
    let active = true
    if (!membership?.businessId || isSuperadmin) return undefined
    getDoc(doc(db, 'businesses', membership.businessId)).then(snapshot => {
      if (active) setBusiness({ id: membership.businessId, name: snapshot.exists() ? snapshot.data().name || '' : '' })
    }).catch(() => { if (active) setBusiness({ id: membership.businessId, name: '' }) })
    return () => { active = false }
  }, [membership?.businessId, isSuperadmin])

  useEffect(() => () => { if (selectedPhoto?.preview) URL.revokeObjectURL(selectedPhoto.preview) }, [selectedPhoto?.preview])

  const businessName = !isSuperadmin && business.id === membership?.businessId ? business.name : ''
  const name = `${firstName.trim()} ${lastName.trim()}`.trim() || 'Tu cuenta'
  const savedPhotoUrl = professionalRole ? professionalProfile?.photo?.url || '' : photoUrl
  const displayedPhoto = selectedPhoto?.preview || (removePhoto ? null : safeImageUrl(savedPhotoUrl))
  const role = roleLabel(isSuperadmin, membership?.role)
  const email = currentUser?.email || userDoc?.email || ''
  const changed = firstName.trim() !== (userDoc?.firstName || '') || lastName.trim() !== (userDoc?.lastName || '')
    || phone.trim() !== (userDoc?.phone || '') || Boolean(selectedPhoto) || removePhoto
    || (professionalRole && (!professionalBio.trim() || professionalBio.trim() !== (professionalProfile?.bio || '').trim()))

  function choosePhotoFile(file) {
    if (!file) return
    setMessage(''); setError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Elige una imagen JPG, PNG o WebP.'); return }
    if (!file.size || file.size > 2 * 1024 * 1024) { setError('La imagen debe pesar como máximo 2 MB.'); return }
    setSelectedPhoto({ file, preview: URL.createObjectURL(file) })
    setRemovePhoto(false)
  }

  function choosePhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    choosePhotoFile(file)
  }

  async function openPhotoPicker() {
    if (!isNativeImagePicker()) {
      fileRef.current?.click()
      return
    }
    setPickingPhoto(true)
    setMessage(''); setError('')
    try { choosePhotoFile(await pickNativeImage()) }
    catch (failure) { setError(failure.message || 'No se pudo abrir la galería.') }
    finally { setPickingPhoto(false) }
  }

  async function saveProfile(event) {
    event.preventDefault()
    if (busy || !currentUser?.uid) return
    setMessage(''); setError('')
    const cleanFirstName = firstName.trim().replace(/\s+/g, ' ')
    const cleanLastName = lastName.trim().replace(/\s+/g, ' ')
    const cleanPhone = phone.trim().replace(/\s+/g, ' ')
    if (!cleanFirstName || !cleanLastName) return setError('Ingresa tu nombre y apellido.')
    if (cleanFirstName.length > 100 || cleanLastName.length > 100) return setError('El nombre y el apellido deben tener como máximo 100 caracteres cada uno.')
    if (!validPhone(cleanPhone)) return setError('Ingresa un teléfono válido con entre 8 y 15 dígitos, o déjalo vacío.')
    if (professionalRole && professionalBio.trim().length === 0) return setError('Completa tu biografía profesional.')
    if (professionalRole && (professionalProfileLoading || !professionalProfile?.id)) return setError(professionalProfileError || 'No se pudo cargar tu perfil profesional. Recarga la página e inténtalo de nuevo.')
    const form = event.currentTarget
    setBusy(true)
    try {
      let nextPhoto = removePhoto ? null : savedPhotoUrl || null
      if (selectedPhoto) nextPhoto = await uploadLocalImage(selectedPhoto.file, isSuperadmin ? null : membership?.businessId, professionalRole ? 'professional' : 'profile')
      const batch = writeBatch(db)
      batch.update(doc(db, 'users', currentUser.uid), {
        firstName: cleanFirstName, lastName: cleanLastName, phone: cleanPhone,
        ...(!professionalRole && (selectedPhoto || removePhoto) ? { photoUrl: nextPhoto } : {}), updatedAt: serverTimestamp(),
      })
      if (professionalRole) {
        const profileUpdate = { bio: professionalBio.trim(), updatedAt: serverTimestamp() }
        if (selectedPhoto || removePhoto) profileUpdate.photo = { url: nextPhoto, publicId: nextPhoto === professionalProfile.photo?.url ? professionalProfile.photo?.publicId || null : null }
        batch.update(doc(db, 'professionals', professionalProfile.id), profileUpdate)
      }
      await batch.commit()
      setFirstName(cleanFirstName); setLastName(cleanLastName); setPhone(cleanPhone); setPhotoUrl(nextPhoto)
      setSelectedPhoto(null); setRemovePhoto(false)
      markFormSaved(form, true)
      setMessage(professionalRole ? 'Tu perfil profesional se actualizó correctamente.' : 'Tus datos personales se guardaron correctamente.')
    } catch (saveError) {
      setError(saveError.code === 'permission-denied'
        ? 'No tienes permiso para actualizar estos datos.'
        : saveError.message || 'No se pudieron guardar tus cambios. Comprueba tu conexión e inténtalo de nuevo.')
    } finally { setBusy(false) }
  }

  async function discardChanges(form) {
    if (busy || !await confirmDiscard(form, confirm)) return
    setFirstName(userDoc?.firstName || ''); setLastName(userDoc?.lastName || ''); setPhone(userDoc?.phone || '')
    if (professionalRole) { setProfessionalBio(professionalProfile?.bio || ''); setProfessionalBioDirty(false) }
    setSelectedPhoto(null); setRemovePhoto(false); setMessage(''); setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function switchTab(nextTab) {
    if (nextTab === tab || busy) return
    if (!await confirmDiscard(document, confirm)) return
    setTab(nextTab)
  }

  return <div className="account-page">
    <PageHeader title="Mi cuenta" description="Administra tus datos personales y la seguridad de tu cuenta." />
    <div className="account-tabs" role="tablist" aria-label="Secciones de Mi cuenta">
      <button id="account-personal-tab" type="button" role="tab" aria-selected={tab === 'personal'} aria-controls="account-personal" onClick={() => switchTab('personal')}><UserRound size={18} />Datos personales</button>
      <button id="account-security-tab" type="button" role="tab" aria-selected={tab === 'security'} aria-controls="account-security" onClick={() => switchTab('security')}><Shield size={18} />Seguridad</button>
    </div>
    {tab === 'personal' ? <section className="account-content-grid" id="account-personal" role="tabpanel" aria-labelledby="account-personal-tab">
      <Card className="account-profile-card" title={<span className="account-card-title"><UserRound size={20} />Datos personales</span>} description="Actualiza la información de tu perfil.">
        <form ref={profileFormRef} onSubmit={saveProfile} data-draft className="account-profile-form">
          <label className="account-profile-field">Nombre *<input name="firstName" autoComplete="given-name" maxLength={100} required className={fieldControlClasses(false)} value={firstName} disabled={busy} onChange={event => { setFirstName(event.target.value); setMessage(''); setError('') }} /></label>
          <label className="account-profile-field">Apellido *<input name="lastName" autoComplete="family-name" maxLength={100} required className={fieldControlClasses(false)} value={lastName} disabled={busy} onChange={event => { setLastName(event.target.value); setMessage(''); setError('') }} /></label>
          <label className="account-profile-field">Teléfono<input name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={30} className={fieldControlClasses(false)} value={phone} disabled={busy} onChange={event => { setPhone(event.target.value); setMessage(''); setError('') }} /></label>
          <label className="account-profile-field">Correo electrónico<input name="email" type="email" value={email} readOnly className={fieldControlClasses(false)} /><small>Se utiliza para iniciar sesión. El cambio requiere un flujo separado.</small></label>
          {professionalRole && <label className="account-profile-field account-professional-bio">Biografía profesional *<textarea name="professionalBio" required maxLength={1000} rows={5} className={fieldControlClasses(false)} value={professionalBio} disabled={busy || professionalProfileLoading || !professionalProfile?.id} onChange={event => { setProfessionalBio(event.target.value); setProfessionalBioDirty(true); setMessage(''); setError('') }} /><small>Obligatoria. Se muestra a los clientes y el administrador puede consultarla.</small></label>}
          <div className="account-photo-block">
            <label>Foto de perfil</label>
            <div className="account-photo-editor"><div className="account-avatar" aria-label="Vista previa del avatar">{displayedPhoto ? <img src={displayedPhoto} alt="Vista previa de tu foto de perfil" /> : <span>{initials(firstName, lastName)}</span>}</div>
              <div className="account-photo-actions"><input ref={fileRef} className="account-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} aria-label="Seleccionar foto de perfil" />
                <Button type="button" variant="secondary" disabled={busy || pickingPhoto} onClick={openPhotoPicker}><ImagePlus size={17} />{pickingPhoto ? 'Abriendo galería…' : selectedPhoto ? 'Elegir otra foto' : 'Subir foto de perfil'}</Button>
                <small>JPG, PNG o WebP. Máximo 2 MB.</small>
                {(displayedPhoto || savedPhotoUrl) && <Button type="button" variant="ghost" disabled={busy} onClick={() => { setSelectedPhoto(null); setRemovePhoto(true); setMessage(''); setError('') }}><X size={15} />Quitar foto</Button>}
                {selectedPhoto && <Button type="button" variant="ghost" disabled={busy} onClick={() => setSelectedPhoto(null)}><Camera size={15} />Descartar foto</Button>}
              </div>
            </div>
            <input type="hidden" name="photoPreview" value={displayedPhoto || ''} readOnly />
          </div>
          {professionalRole && <p className="account-photo-note">Tu foto y biografía pertenecen al mismo perfil profesional que consulta el administrador y ven los clientes.</p>}
          {error && <Alert tone="error">{error}</Alert>}{message && <Alert tone="success">{message}</Alert>}
          <div className="account-form-actions"><Button type="button" variant="secondary" disabled={busy || !changed} onClick={event => discardChanges(event.currentTarget.form)}>Cancelar</Button><Button type="submit" disabled={busy || !changed || (professionalRole && professionalProfileLoading)}><Save size={16} />{busy ? 'Guardando…' : 'Guardar cambios'}</Button></div>
        </form>
      </Card>
      <Card className="account-summary-card"><div className="account-summary-avatar">{displayedPhoto ? <img src={displayedPhoto} alt="" /> : <span>{initials(firstName, lastName)}</span>}</div><h2>{name}</h2><span className="account-role-badge">{role}</span><p className="account-summary-email"><Mail size={16} />{email || 'Correo no disponible'}</p>{phone && <p className="account-summary-email"><Phone size={16} />{phone}</p>}
        {!isSuperadmin && businessName && <p className="account-summary-business">{businessName}</p>}<span className={`account-status${userDoc?.status === 'active' ? ' active' : ''}`}>{statusLabel(userDoc?.status)}</span>
        <div className="account-summary-tip"><ShieldCheck size={20} /><div><strong>Actualización del perfil</strong><p>Los cambios se guardan en tu cuenta personal de MUST.</p></div></div>
      </Card>
    </section> : <section id="account-security" role="tabpanel" aria-labelledby="account-security-tab"><PasswordSecurity /></section>}
  </div>
}

function isProfessional(membership) { return membership?.role === 'professional' }

function passwordError(error) {
  if (error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential') return 'La contraseña actual no es correcta.'
  if (error?.code === 'auth/weak-password') return 'La nueva contraseña no cumple la política de seguridad de Firebase. Elige una contraseña más segura.'
  if (error?.code === 'auth/requires-recent-login') return 'Tu sesión necesita una nueva autenticación. Cierra sesión, vuelve a entrar e inténtalo otra vez.'
  if (error?.code === 'auth/network-request-failed') return 'No hay conexión con el servicio de autenticación. Comprueba tu conexión e inténtalo de nuevo.'
  return 'No se pudo cambiar la contraseña. Comprueba la contraseña actual y vuelve a intentarlo.'
}

function PasswordSecurity() {
  const { currentUser } = useAuth()
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [visible, setVisible] = useState({}), [successOpen, setSuccessOpen] = useState(false)
  async function save(event) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget, data = new FormData(form)
    setError('')
    if (data.get('password') !== data.get('confirm')) return setError('Las contraseñas nuevas no coinciden.')
    if (data.get('password') === data.get('current')) return setError('Elige una contraseña diferente de la actual.')
    setBusy(true)
    try {
      if (!currentUser?.email || !currentUser.providerData.some(provider => provider.providerId === 'password')) throw new Error('provider')
      await reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(currentUser.email, data.get('current')))
      await updatePassword(currentUser, data.get('password'))
      form.reset(); markFormSaved(form, true); setVisible({}); setSuccessOpen(true)
    } catch (saveError) { setError(saveError.message === 'provider' ? 'Esta cuenta no tiene un inicio de sesión con contraseña de correo electrónico. Usa el proveedor con el que registraste la cuenta.' : passwordError(saveError)) }
    finally { setBusy(false) }
  }
  return <div className="account-security-grid"><Card title={<span className="account-card-title"><Shield size={20} />Cambiar contraseña</span>} description="Firebase valida la contraseña nueva según la política configurada para tu proyecto."><form onSubmit={save} className="account-security-form" data-sensitive-form>
    {[['current', 'Contraseña actual', 'current-password'], ['password', 'Nueva contraseña', 'new-password'], ['confirm', 'Confirmar nueva contraseña', 'new-password']].map(([name, label, autocomplete]) => { const id = `password-${name}`; return <label key={name} htmlFor={id} className="account-security-field">{label}<span className="account-security-input"><KeyRound size={17} aria-hidden="true" /><input id={id} name={name} type={visible[name] ? 'text' : 'password'} autoComplete={autocomplete} required disabled={busy} className={fieldControlClasses(false)} aria-label={label} /><button type="button" className="account-security-eye" aria-label={`${visible[name] ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`} aria-pressed={Boolean(visible[name])} disabled={busy} onClick={() => setVisible(value => ({ ...value, [name]: !value[name] }))}>{visible[name] ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label> })}
    {error && <Alert tone="error">{error}</Alert>}<Button type="submit" disabled={busy || !currentUser}>{busy ? 'Actualizando contraseña…' : 'Cambiar contraseña'}</Button>
  </form></Card><div className="account-security-tips"><Card title={<span className="account-card-title"><ShieldCheck size={20} />Consejos de seguridad</span>}><ul>{['Utiliza una contraseña única para esta cuenta.', 'No compartas tu contraseña con otras personas.', 'Evita palabras comunes, nombres y datos fáciles de adivinar.', 'Usa las opciones adicionales de seguridad que ofrece tu proveedor de acceso.'].map(item => <li key={item}><Check size={18} aria-hidden="true" /><span>{item}</span></li>)}</ul></Card><aside className="account-security-protected"><ShieldCheck size={22} /><div><strong>Tu cuenta está protegida</strong><p>Tu contraseña se valida directamente con Firebase Authentication.</p></div></aside></div>{successOpen && <SuccessDialog onClose={() => setSuccessOpen(false)} />}</div>
}

function SuccessDialog({ onClose }) {
  const ref = useRef(null)
  useEffect(() => { const element = ref.current; element?.showModal(); return () => { if (element?.open) element.close() } }, [])
  return <dialog ref={ref} className="account-security-success-modal" aria-labelledby="password-success-title" aria-describedby="password-success-description" onCancel={event => { event.preventDefault(); onClose() }}><span className="account-security-success-icon"><ShieldCheck size={32} aria-hidden="true" /></span><h2 id="password-success-title">Contraseña actualizada</h2><p id="password-success-description">Tu contraseña se cambió correctamente. Usa la nueva contraseña la próxima vez que inicies sesión.</p><Button autoFocus onClick={onClose}>Entendido</Button></dialog>
}
