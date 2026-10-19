import { markFormSaved } from '../lib/unsavedForms'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useState } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { useAuth } from '../context/auth-context'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import { fieldControlClasses } from '../components/ui/fieldStyles'

export default function AccountSecurity() {
  const { currentUser } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function save(event) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setError(''); setMessage('')
    if (data.get('password') !== data.get('confirm')) return setError('Las contraseñas nuevas no coinciden.')
    if (data.get('password') === data.get('current')) return setError('Elige una contraseña diferente de la actual.')
    setBusy(true)
    try {
      await reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(currentUser.email, data.get('current')))
      await updatePassword(currentUser, data.get('password'))
      await updateDoc(doc(db, 'users', currentUser.uid), { mustChangePassword: false })
      form.reset()
      markFormSaved(event.target, true)
      setMessage('Contraseña actualizada. Usa la nueva contraseña al iniciar sesión.')
    } catch {
      setError('No se pudo cambiar la contraseña. Comprueba tu contraseña actual, la conexión y vuelve a intentarlo.')
    } finally { setBusy(false) }
  }
  return <div className="space-y-6"><PageHeader title="Seguridad de mi cuenta" description="Cambia tu contraseña de acceso." /><Card title="Cambiar contraseña"><form onSubmit={save} className="space-y-4 max-w-lg">
    {[['current', 'Contraseña actual', 'current-password'], ['password', 'Nueva contraseña', 'new-password'], ['confirm', 'Confirmar nueva contraseña', 'new-password']].map(([name, label, autocomplete]) => <label key={name} className="block text-sm font-medium">{label}<input name={name} type="password" autoComplete={autocomplete} required minLength={name === 'current' ? 1 : 8} disabled={busy} className={fieldControlClasses(false)} /></label>)}
    <p className="text-sm text-muted">Usa al menos 8 caracteres para la nueva contraseña.</p>
    {error && <Alert tone="error">{error}</Alert>}{message && <Alert tone="success">{message}</Alert>}
    <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Cambiar contraseña'}</Button>
  </form></Card></div>
}
