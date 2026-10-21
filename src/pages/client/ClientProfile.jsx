import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { useEffect, useRef, useState } from 'react'
import {
  Camera, Check, ImagePlus, KeyRound, Mail, Phone, Save, ShieldCheck, UserRound, X,
} from 'lucide-react'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/auth-context'
import { safeImageUrl } from '../../lib/brand'
import { uploadLocalImage } from '../../lib/imageUpload'
import './client-profile.css'

function initials(firstName = '', lastName = '') {
  return `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase() || '?'
}

function phoneIsValid(value) {
  const digits = value.replace(/\D/g, '')
  return /^\+?[0-9\s().-]+$/.test(value) && digits.length >= 8 && digits.length <= 15
}

function accountStatus(status) {
  return ({
    active: 'Cuenta activa',
    pending: 'Cuenta pendiente',
    inactive: 'Cuenta inactiva',
    suspended: 'Cuenta suspendida',
  })[status] || `Estado: ${status}`
}

export default function ClientProfile() {
  const authState = useAuth()
  return <ClientProfileContent key={authState.currentUser?.uid || ''} {...authState} />
}

function ClientProfileContent({ userDoc, resetPassword, currentUser, membership }) {
  const fileInput = useRef(null)
  const [firstName, setFirstName] = useState(userDoc.firstName || '')
  const [lastName, setLastName] = useState(userDoc.lastName || '')
  const [phone, setPhone] = useState(userDoc.phone || '')
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [profileError, setProfileError] = useState('')
  const [photoSelection, setPhotoSelection] = useState(null)
  const [photoOverride, setPhotoOverride] = useState(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoMessage, setPhotoMessage] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const fullName = `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim()
  const email = currentUser?.email || userDoc.email || ''
  const changed = firstName.trim() !== (userDoc.firstName || '')
    || lastName.trim() !== (userDoc.lastName || '')
    || phone.trim() !== (userDoc.phone || '')
  const currentPhoto = photoOverride?.previous === (userDoc.photoUrl || null)
    ? photoOverride.url : safeImageUrl(userDoc.photoUrl)
  const visiblePhoto = photoSelection?.preview || currentPhoto

  useEffect(() => () => {
    if (photoSelection?.preview) URL.revokeObjectURL(photoSelection.preview)
  }, [photoSelection?.preview])

  async function saveProfile(event) {
    event.preventDefault()
    setProfileMessage('')
    setProfileError('')
    const cleanFirstName = firstName.trim()
    const cleanLastName = lastName.trim()
    const cleanPhone = phone.trim()
    if (!cleanFirstName || !cleanLastName) {
      setProfileError('Ingresa tu nombre y apellido.')
      return
    }
    if (cleanFirstName.length > 100 || cleanLastName.length > 100) {
      setProfileError('El nombre y el apellido deben tener como máximo 100 caracteres cada uno.')
      return
    }
    if (!phoneIsValid(cleanPhone)) {
      setProfileError('Ingresa un teléfono válido con entre 8 y 15 dígitos.')
      return
    }

    setProfileBusy(true)
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        firstName: cleanFirstName,
        lastName: cleanLastName,
        phone: cleanPhone,
        updatedAt: serverTimestamp(),
      })
      setFirstName(cleanFirstName)
      setLastName(cleanLastName)
      setPhone(cleanPhone)
      setProfileMessage('Tus datos personales se guardaron correctamente.')
    } catch (error) {
      setProfileError(error.code === 'permission-denied'
        ? 'No tienes permiso para actualizar estos datos.'
        : 'No se pudieron guardar tus cambios. Comprueba tu conexión e inténtalo de nuevo.')
    } finally {
      setProfileBusy(false)
    }
  }

  function selectPhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setPhotoMessage('')
    setPhotoError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError('Elige una imagen JPG, PNG o WebP.')
      return
    }
    if (!file.size || file.size > 2 * 1024 * 1024) {
      setPhotoError('La imagen debe pesar como máximo 2 MB.')
      return
    }
    setPhotoSelection({ file, preview: URL.createObjectURL(file) })
  }

  async function savePhoto() {
    if (!photoSelection?.file || !membership?.businessId) return
    setPhotoBusy(true)
    setPhotoError('')
    setPhotoMessage('')
    try {
      const url = await uploadLocalImage(photoSelection.file, membership.businessId, 'profile')
      await updateDoc(doc(db, 'users', currentUser.uid), {
        photoUrl: url,
        updatedAt: serverTimestamp(),
      })
      setPhotoOverride({ previous: userDoc.photoUrl || null, url })
      setPhotoSelection(null)
      setPhotoMessage('Tu fotografía se guardó correctamente.')
    } catch (error) {
      setPhotoSelection(null)
      setPhotoError(error.message || 'No se pudo guardar la fotografía. Inténtalo de nuevo.')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function removePhoto() {
    setPhotoBusy(true)
    setPhotoError('')
    setPhotoMessage('')
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        photoUrl: null,
        updatedAt: serverTimestamp(),
      })
      setPhotoOverride({ previous: userDoc.photoUrl || null, url: null })
      setPhotoSelection(null)
      setPhotoMessage('Se quitó la fotografía de tu perfil.')
    } catch {
      setPhotoError('No se pudo quitar la fotografía. Inténtalo de nuevo.')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function sendPasswordLink() {
    setPasswordBusy(true)
    setPasswordMessage('')
    setPasswordError('')
    try {
      await resetPassword(email)
      setPasswordMessage('Firebase aceptó la solicitud. Si el correo corresponde a una cuenta, recibirás instrucciones según la configuración de correo.')
    } catch (error) {
      setPasswordError(error.code === 'auth/too-many-requests'
        ? 'Se realizaron demasiados intentos. Espera un momento antes de volver a probar.'
        : 'Firebase no pudo aceptar la solicitud. Comprueba tu conexión e inténtalo de nuevo.')
    } finally {
      setPasswordBusy(false)
    }
  }

  return <section className="client-profile-page">
    <header className="client-page-heading client-profile-heading">
      <div>
        <span className="client-overline">TU ESPACIO PERSONAL</span>
        <h1>Mi perfil</h1>
        <p>Mantén actualizada tu información para una mejor experiencia.</p>
      </div>
      <div className="client-profile-protected"><ShieldCheck size={20} aria-hidden="true" /><span><strong>Tu información está protegida</strong><small>Solo tú puedes gestionar tus datos personales.</small></span></div>
    </header>

    <section className="client-panel client-profile-summary" aria-label="Resumen del perfil">
      <div className="client-profile-avatar" aria-hidden="true">
        {visiblePhoto ? <img src={visiblePhoto} alt="" /> : initials(userDoc.firstName, userDoc.lastName)}
        <span><Camera size={15} /></span>
      </div>
      <div className="client-profile-summary-copy">
        <h2>{fullName || 'Tu perfil'}</h2>
        <div className="client-profile-contact"><span><Mail size={15} />{email}</span>{userDoc.phone && <span><Phone size={15} />{userDoc.phone}</span>}</div>
        <div className="client-profile-badges">
          {userDoc.status && <span className={userDoc.status === 'active' ? 'is-active' : ''}><Check size={13} />{accountStatus(userDoc.status)}</span>}
          <span><UserRound size={13} />Información personal</span>
        </div>
      </div>
      <div className="client-profile-photo-controls">
        <input ref={fileInput} className="client-profile-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} aria-label="Seleccionar una fotografía" />
        <button type="button" className="public-button secondary" disabled={photoBusy} onClick={() => fileInput.current?.click()}>
          <ImagePlus size={16} />Cambiar foto
        </button>
        <small>JPG, PNG o WebP · máximo 2 MB</small>
        {photoSelection && <div className="client-profile-photo-actions">
          <button type="button" className="public-button" disabled={photoBusy} onClick={savePhoto}>{photoBusy ? 'Guardando…' : 'Guardar foto'}</button>
          <button type="button" className="client-profile-text-button" disabled={photoBusy} onClick={() => { setPhotoSelection(null); setPhotoError(''); setPhotoMessage('') }}><X size={14} />Descartar</button>
        </div>}
        {!photoSelection && currentPhoto && <button type="button" className="client-profile-text-button client-profile-remove-photo" disabled={photoBusy} onClick={removePhoto}>{photoBusy ? 'Actualizando…' : 'Quitar imagen'}</button>}
        {photoBusy && <span className="client-profile-photo-status" role="status">Actualizando la fotografía…</span>}
        {photoMessage && <span className="client-profile-photo-success" role="status">{photoMessage}</span>}
        {photoError && <span className="client-profile-photo-error" role="alert">{photoError}</span>}
      </div>
    </section>

    <section className="client-panel client-profile-section">
      <header className="client-profile-section-heading">
        <span><UserRound size={19} /></span><div><h2>Información personal</h2><p>Actualiza tus datos personales.</p></div>
      </header>
      <form className="client-profile-form" onSubmit={saveProfile}>
        <label className="client-profile-field client-profile-name-field">Nombre completo
          <input type="text" autoComplete="name" maxLength={201} value={`${firstName}${lastName ? ` ${lastName}` : ''}`} onChange={event => {
            const parts = event.target.value.trimStart().split(/\s+/)
            setFirstName(parts.shift() || '')
            setLastName(parts.join(' '))
            setProfileMessage('')
            setProfileError('')
          }} required />
        </label>
        <label className="client-profile-field">Correo electrónico
          <input type="email" autoComplete="email" value={email} readOnly aria-describedby="client-profile-email-help" />
          <small id="client-profile-email-help">El correo es de solo lectura para mantener sincronizada tu cuenta de Firebase Authentication.</small>
        </label>
        <label className="client-profile-field">Teléfono
          <input type="tel" autoComplete="tel" inputMode="tel" maxLength={30} value={phone} onChange={event => { setPhone(event.target.value); setProfileMessage(''); setProfileError('') }} required aria-describedby="client-profile-phone-help" />
          <small id="client-profile-phone-help">Incluye el código de país si corresponde.</small>
        </label>
        <div className="client-profile-form-footer">
          <p><ShieldCheck size={16} />Estos datos se utilizan para comunicarnos contigo sobre tus citas y avisos.</p>
          <button type="submit" className="public-button" disabled={profileBusy || !changed}><Save size={16} />{profileBusy ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
        {profileMessage && <p className="client-profile-inline-success" role="status"><Check size={15} />{profileMessage}</p>}
        {profileError && <p className="client-profile-inline-error" role="alert">{profileError}</p>}
      </form>
    </section>

    <section className="client-panel client-profile-section client-profile-security">
      <header className="client-profile-section-heading">
        <span><KeyRound size={19} /></span><div><h2>Seguridad</h2><p>Mantén tu cuenta segura.</p></div>
      </header>
      <div className="client-profile-security-row">
        <span className="client-profile-security-icon"><KeyRound size={20} /></span>
        <div><h3>Contraseña de acceso</h3><p>Solicita un enlace para cambiarla de forma segura desde tu correo.</p></div>
        <button type="button" className="public-button secondary" disabled={passwordBusy || !!passwordMessage || !email} onClick={sendPasswordLink}><Mail size={16} />{passwordBusy ? 'Solicitando…' : passwordMessage ? 'Solicitud aceptada' : 'Enviar enlace de cambio'}</button>
      </div>
      {passwordMessage && <p className="client-profile-inline-success" role="status"><Check size={15} />{passwordMessage}</p>}
      {passwordError && <p className="client-profile-inline-error" role="alert">{passwordError}</p>}
    </section>
  </section>
}
