import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getAuthErrorMessage } from '../firebase/authErrors'
import { AuthShell, usePublicBusiness } from '../components/public/PublicLayout'
import PasswordInput from '../components/public/PasswordInput'

export default function Login() {
  const { login, resetPassword } = useAuth()
  const { base } = usePublicBusiness()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  async function submit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      await login(email.trim(), password, remember)
      navigate('/dashboard')
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  async function reset() {
    setError('')
    setInfo('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Ingresa un correo válido para recuperar tu contraseña.')
      return
    }
    setBusy(true)
    try {
      await resetPassword(email.trim())
      setInfo('Si hay una cuenta asociada, recibirás un enlace para restablecer tu contraseña.')
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AuthShell>
      <div className="auth-heading">
        <span className="eyebrow">QUÉ BUENO VERTE DE NUEVO</span>
        <h1>Inicia sesión</h1>
        <p>Ingresa a tu cuenta para continuar.</p>
      </div>
      <form onSubmit={submit} className="public-form">
        <label htmlFor="email">
          Correo electrónico
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label htmlFor="password">
          Contraseña
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="Tu contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <div className="form-options">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Recordarme
          </label>
          <button className="text-link" type="button" onClick={reset} disabled={busy}>
            ¿Olvidaste tu contraseña?
          </button>
        </div>
        {error && (
          <p className="public-alert" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="public-info" role="status">
            {info}
          </p>
        )}
        <button className="public-button full" disabled={busy}>
          {busy ? 'Procesando…' : 'Iniciar sesión'}
          <ArrowRight size={17} />
        </button>
      </form>
      <p className="auth-switch">
        ¿No tienes una cuenta?{' '}
        <Link className="text-link" to={`${base}/registro`}>
          Regístrate aquí
        </Link>
      </p>
    </AuthShell>
  )
}
