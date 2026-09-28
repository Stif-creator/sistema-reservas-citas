import { useState } from 'react'
import { KeyRound, Mail, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../context/auth-context'
import { safeImageUrl } from '../../lib/brand'

export default function ClientProfile() {
  const { userDoc, resetPassword } = useAuth()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const photo = safeImageUrl(userDoc.photoUrl)
  async function reset() {
    setBusy(true); setMessage(''); setError('')
    try { await resetPassword(userDoc.email); setMessage('Te enviamos un enlace para restablecer tu contraseña. Revisa tu correo.') }
    catch { setError('No pudimos enviar el enlace. Inténtalo de nuevo más tarde.') }
    finally { setBusy(false) }
  }
  return <>
    <div className="client-page-heading"><div><span className="client-overline">TU ESPACIO PERSONAL</span><h1>Mi perfil</h1><p>Consulta los datos asociados a tu cuenta.</p></div></div>
    <section className="client-panel client-profile-panel">
      <div className="client-profile-avatar">{photo ? <img src={photo} alt="" /> : `${userDoc.firstName?.[0] || ''}${userDoc.lastName?.[0] || ''}`}</div>
      <div className="client-profile-data"><h2>Información personal</h2><dl className="client-profile-fields">
        <div><dt>Nombre completo</dt><dd>{userDoc.firstName} {userDoc.lastName}</dd></div>
        <div><dt>Correo electrónico</dt><dd>{userDoc.email}</dd></div>
        <div><dt>Teléfono</dt><dd>{userDoc.phone || 'Sin teléfono registrado'}</dd></div>
      </dl><p className="client-profile-note"><ShieldCheck size={16} />Esta información pertenece a tu cuenta personal.</p></div>
    </section>
    <section className="client-security"><h2>Seguridad</h2><div className="client-panel"><KeyRound size={24} /><div><h3>Contraseña de acceso</h3><p>Recibe un enlace en tu correo para cambiarla de forma segura.</p></div><button className="public-button secondary" disabled={busy || !!message} onClick={reset}><Mail size={16} />{busy ? 'Enviando…' : message ? 'Enlace enviado' : 'Cambiar contraseña'}</button></div>
      {message && <p className="public-info" role="status">{message}</p>}{error && <p className="public-alert" role="alert">{error}</p>}
    </section>
  </>
}
