import { markFormSaved } from '../lib/unsavedForms'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useEffect, useRef, useState } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { useAuth } from '../context/auth-context'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import { fieldControlClasses } from '../components/ui/fieldStyles'
import { CheckCircle2, Eye, EyeOff, KeyRound, Shield, ShieldCheck } from 'lucide-react'
import { useFeedback } from '../context/feedback-context'
import './account-security.css'

function passwordError(error) {
  if (error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential') return 'La contraseña actual no es correcta.'
  if (error?.code === 'auth/weak-password') return 'La nueva contraseña no cumple la política de seguridad de Firebase. Elige una contraseña más segura.'
  if (error?.code === 'auth/requires-recent-login') return 'Tu sesión necesita una nueva autenticación. Cierra sesión, vuelve a entrar e inténtalo otra vez.'
  if (error?.code === 'auth/network-request-failed') return 'No hay conexión con el servicio de autenticación. Comprueba tu conexión e inténtalo de nuevo.'
  if (error?.code === 'permission-denied') return 'Firebase no autorizó actualizar los datos de tu cuenta. La contraseña ya se actualizó; vuelve a cargar la página.'
  return 'No se pudo cambiar la contraseña. Comprueba la contraseña actual y vuelve a intentarlo.'
}

export default function AccountSecurity() {
  const { currentUser } = useAuth()
  const { notify } = useFeedback()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState({})
  const [successOpen, setSuccessOpen] = useState(false)

  async function save(event) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const data = new FormData(form)
    setError('')
    if (data.get('password') !== data.get('confirm')) return setError('Las contraseñas nuevas no coinciden.')
    if (data.get('password') === data.get('current')) return setError('Elige una contraseña diferente de la actual.')
    setBusy(true)
    try {
      if (!currentUser?.email || !currentUser.providerData.some(provider => provider.providerId === 'password')) {
        setError('Esta cuenta no tiene un inicio de sesión con contraseña de correo electrónico. Usa el proveedor con el que registraste la cuenta.')
        return
      }
      await reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(currentUser.email, data.get('current')))
      await updatePassword(currentUser, data.get('password'))
      try { await updateDoc(doc(db, 'users', currentUser.uid), { mustChangePassword: false }) }
      catch (profileError) {
        console.error('La contraseña se cambió, pero no se pudo actualizar el indicador de cuenta.', profileError?.code)
        notify({ title: 'Contraseña actualizada', message: 'El cambio de contraseña se completó. Recarga la página para sincronizar el estado de la cuenta.', type: 'warning' })
      }
      form.reset()
      markFormSaved(event.target, true)
      setVisible({})
      setSuccessOpen(true)
    } catch (saveError) {
      setError(passwordError(saveError))
    } finally { setBusy(false) }
  }
  return <div className="account-security-page"><PageHeader title="Seguridad de mi cuenta" description="Mantén tu cuenta segura con una contraseña fuerte." />
    <div className="account-security-grid"><Card title={<span className="account-security-card-title"><Shield size={20} />Cambiar contraseña</span>} description="Firebase valida la contraseña nueva según la política configurada para tu proyecto."><form onSubmit={save} className="account-security-form" data-sensitive-form>
      {[['current', 'Contraseña actual', 'current-password'], ['password', 'Nueva contraseña', 'new-password'], ['confirm', 'Confirmar nueva contraseña', 'new-password']].map(([name, label, autocomplete]) => { const id = `password-${name}`; return <label key={name} htmlFor={id} className="account-security-field">{label}<span className="account-security-input"><KeyRound size={17} aria-hidden="true" /><input id={id} name={name} type={visible[name] ? 'text' : 'password'} autoComplete={autocomplete} required disabled={busy} className={fieldControlClasses(false)} aria-label={label} /><button type="button" className="account-security-eye" aria-label={`${visible[name] ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`} aria-pressed={Boolean(visible[name])} disabled={busy} onClick={() => setVisible(value => ({ ...value, [name]: !value[name] }))}>{visible[name] ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label> })}
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" disabled={busy || !currentUser}>{busy ? 'Actualizando contraseña…' : 'Cambiar contraseña'}</Button>
    </form></Card>
    <div className="account-security-tips"><Card title={<span className="account-security-card-title"><ShieldCheck size={20} />Consejos de seguridad</span>}><ul>{['Utiliza una contraseña única para esta cuenta.', 'No compartas tu contraseña con otras personas.', 'Evita palabras comunes, nombres y datos fáciles de adivinar.', 'Usa las opciones adicionales de seguridad que ofrece tu proveedor de acceso.'].map(item => <li key={item}><CheckCircle2 size={18} aria-hidden="true" /><span>{item}</span></li>)}</ul></Card><aside className="account-security-protected"><ShieldCheck size={22} /><div><strong>Tu cuenta está protegida</strong><p>Tu contraseña se valida directamente con Firebase Authentication.</p></div></aside></div></div>
    {successOpen && <SuccessDialog onClose={() => setSuccessOpen(false)} />}
  </div>
}

function SuccessDialog({ onClose }) {
  const ref = useRef(null)
  useEffect(() => { const element = ref.current; element?.showModal(); return () => { if (element?.open) element.close() } }, [])
  return <dialog ref={ref} className="account-security-success-modal" aria-labelledby="password-success-title" aria-describedby="password-success-description" onCancel={event => { event.preventDefault(); onClose() }}><span className="account-security-success-icon"><CheckCircle2 size={32} aria-hidden="true" /></span><h2 id="password-success-title">Contraseña actualizada</h2><p id="password-success-description">Tu contraseña se cambió correctamente. Usa la nueva contraseña la próxima vez que inicies sesión.</p><Button autoFocus onClick={onClose}>Entendido</Button></dialog>
}
