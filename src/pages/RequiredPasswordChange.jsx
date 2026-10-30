import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { Eye, EyeOff, KeyRound, LogOut, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/auth-context'
import { useFeedback } from '../context/feedback-context'
import { completeRequiredPasswordChange } from '../lib/bookingApi'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import { fieldControlClasses } from '../components/ui/fieldStyles'

function getMessage(error) {
  if (['auth/wrong-password', 'auth/invalid-credential'].includes(error?.code)) return 'La contraseña actual no es correcta.'
  if (error?.code === 'auth/network-request-failed') return 'No hay conexión con Firebase Authentication. Comprueba tu conexión e inténtalo de nuevo.'
  if (error?.code?.endsWith('/failed-precondition')) return error.message || 'Vuelve a confirmar tu contraseña actual e inténtalo otra vez.'
  if (error?.code?.endsWith('/invalid-argument')) return error.message || 'La nueva contraseña no cumple los requisitos.'
  if (error?.message?.includes('contraseña')) return error.message
  return 'No se pudo completar el cambio. Si el intento anterior alcanzó a actualizar la contraseña, vuelve a intentarlo usando la nueva contraseña como contraseña actual.'
}

export default function RequiredPasswordChange() {
  const { currentUser, logout, reloadProfile } = useAuth()
  const { notify } = useFeedback()
  const navigate = useNavigate()
  const [values, setValues] = useState({ current: '', password: '', confirm: '' })
  const [visible, setVisible] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setError('')
    if (values.password.length < 12) return setError('La nueva contraseña debe tener al menos 12 caracteres.')
    if (values.password.length > 128) return setError('La nueva contraseña no puede superar 128 caracteres.')
    if (values.password !== values.confirm) return setError('Las contraseñas nuevas no coinciden.')
    if (values.password === values.current) return setError('Elige una contraseña diferente de la actual.')
    if (!currentUser?.email || !currentUser.providerData.some(item => item.providerId === 'password'))
      return setError('Esta cuenta no tiene inicio de sesión con contraseña de correo electrónico. Contacta al superadministrador.')

    setBusy(true)
    try {
      await reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(currentUser.email, values.current))
      await currentUser.getIdToken(true)
      await completeRequiredPasswordChange(values.password)
      await reloadProfile()
      setValues({ current: '', password: '', confirm: '' })
      setSuccess(true)
      notify({ title: 'Contraseña actualizada', message: 'Ya puedes comenzar a administrar tu negocio.', type: 'success' })
    } catch (cause) {
      setError(getMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    setBusy(true)
    try { await logout(); navigate('/login', { replace: true }) }
    catch { setError('No se pudo cerrar sesión. Inténtalo de nuevo.') }
    finally { setBusy(false) }
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 sm:grid sm:place-items-center">
    <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 bg-blue-50/70 px-6 py-7 sm:px-10">
        <div className="mb-4 inline-flex rounded-xl bg-blue-100 p-3 text-blue-700"><ShieldCheck size={26} /></div>
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-blue-700">Protección de tu cuenta</p>
        <h1 className="text-2xl font-bold sm:text-3xl">Por seguridad, cambia tu contraseña</h1>
        <p className="mt-3 max-w-2xl leading-6 text-slate-600">Tu cuenta fue creada con una contraseña inicial. Antes de comenzar a administrar tu negocio, debes establecer una contraseña personal.</p>
      </header>
      <form onSubmit={submit} className="grid gap-5 px-6 py-7 sm:px-10" data-sensitive-form>
        <div role="status" className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">Debes completar este cambio para acceder al Dashboard y a los módulos de tu negocio.</div>
        {(['current', 'password', 'confirm']).map((name, index) => {
          const label = ['Contraseña actual', 'Nueva contraseña', 'Confirmar nueva contraseña'][index]
          const autoComplete = index === 0 ? 'current-password' : 'new-password'
          return <label key={name} className="grid gap-2 text-sm font-medium" htmlFor={`required-password-${name}`}>
            {label}
            <span className="relative flex items-center">
              <KeyRound size={17} className="absolute left-3 text-slate-400" aria-hidden="true" />
              <input id={`required-password-${name}`} type={visible[name] ? 'text' : 'password'} autoComplete={autoComplete} required disabled={busy} maxLength={128} minLength={index > 0 ? 12 : undefined} value={values[name]} onChange={event => setValues(old => ({ ...old, [name]: event.target.value }))} className={`${fieldControlClasses(false)} w-full pl-10 pr-12`} />
              <button type="button" className="absolute right-3 text-slate-500" aria-label={`${visible[name] ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`} aria-pressed={Boolean(visible[name])} disabled={busy} onClick={() => setVisible(old => ({ ...old, [name]: !old[name] }))}>{visible[name] ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </span>
          </label>
        })}
        {error && <Alert tone="error" role="alert">{error}</Alert>}
        <div className="flex flex-col gap-3 pt-1 sm:flex-row">
          <Button type="submit" disabled={busy}>{busy ? 'Guardando contraseña…' : 'Guardar nueva contraseña'}</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={signOut}><LogOut size={17} />Cerrar sesión</Button>
        </div>
      </form>
    </section>
    {success && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="password-change-success-title" className="w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-xl"><div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-emerald-100 text-emerald-700"><ShieldCheck size={30} /></div><h2 id="password-change-success-title" className="text-xl font-bold">Contraseña actualizada</h2><p className="my-3 text-slate-600">Ya puedes comenzar a administrar tu negocio.</p><Button onClick={() => navigate('/dashboard', { replace: true })}>Ir al Dashboard</Button></section></div>}
  </main>
}
