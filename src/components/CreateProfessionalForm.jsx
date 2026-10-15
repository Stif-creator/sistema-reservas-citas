import { generatePassword } from '../lib/password'
import { useState } from 'react'
import { createProfessionalAccount } from '../lib/userAdministration'
import { getAuthErrorMessage } from '../firebase/authErrors'
import Card from './ui/Card'
import Field from './ui/Field'
import { fieldControlClasses } from './ui/fieldStyles'
import Button from './ui/Button'
import Alert from './ui/Alert'

const empty = { firstName: '', lastName: '', email: '', phone: '', password: '', confirm: '' }

export default function CreateProfessionalForm({ businessId }) {
  const [form, setForm] = useState(() => { const password = generatePassword(); return { ...empty, password, confirm: password } })
  const [credential, setCredential] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  async function submit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setCredential(null)
    if (!form.firstName.trim() || !form.lastName.trim()) return setError('Completa el nombre y el apellido.')
    if (!/^\+?\d{8,}$/.test(form.phone.trim())) return setError('Ingresa un teléfono válido con al menos 8 dígitos.')
    if (form.password !== form.confirm) return setError('Las contraseñas no coinciden.')
    setBusy(true)
    try {
      await createProfessionalAccount(businessId, form)
      setCredential({ email: form.email, password: form.password })
      const password = generatePassword()
      setForm({ ...empty, password, confirm: password })
      setSuccess('Profesional registrado y activo. Usa Editar para asignar sus servicios y horarios.')
    } catch (err) {
      setError(err.code?.startsWith('auth/') ? getAuthErrorMessage(err) : err.message || 'No se pudo registrar al profesional.')
    } finally { setBusy(false) }
  }
  return (
    <Card title="Registrar profesional" className="mb-6">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ['firstName', 'Nombre del profesional', 'text'], ['lastName', 'Apellido del profesional', 'text'],
            ['email', 'Correo del profesional', 'email'], ['phone', 'Teléfono del profesional', 'tel'],
            ['password', 'Contraseña inicial', 'password'], ['confirm', 'Confirmar contraseña inicial', 'password'],
          ].map(([key, label, type]) => (
            <Field key={key} label={label} htmlFor={`new-${key}`}>
              <input id={`new-${key}`} type={type} required minLength={type === 'password' ? 6 : undefined}
                autoComplete={type === 'password' ? 'new-password' : 'off'} disabled={busy}
                className={fieldControlClasses(false)} value={form[key]}
                onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
            </Field>
          ))}
        </div>
        <p className="text-sm text-muted">El profesional podrá ingresar con este correo y contraseña. Puede restablecerla desde el inicio de sesión.</p>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => { const password = generatePassword(); setForm({ ...form, password, confirm: password }) }}>Generar otra contraseña</Button>
        {credential && <Alert tone="success"><p>Cuenta creada: {credential.email}</p><p>Contraseña inicial: <code className="select-all">{credential.password}</code></p><p>Compártela directamente con el profesional. Puede cambiarla usando Recuperar contraseña al iniciar sesión.</p><Button type="button" variant="secondary" onClick={() => setCredential(null)}>Ocultar credenciales</Button></Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        {success && <Alert tone="success">{success}</Alert>}
        <Button type="submit" disabled={busy}>{busy ? 'Registrando…' : 'Registrar profesional'}</Button>
      </form>
    </Card>
  )
}
