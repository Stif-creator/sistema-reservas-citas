import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getAuthErrorMessage } from '../firebase/authErrors'

function Login() {
  const { login, resetPassword } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResetPassword() {
    setError('')
    setInfo('')
    if (!email) {
      setError('Ingresa tu correo para enviarte el enlace de recuperación.')
      return
    }
    try {
      await resetPassword(email)
      setInfo('Te enviamos un correo para restablecer tu contraseña.')
    } catch (err) {
      setError(getAuthErrorMessage(err))
    }
  }

  return (
    <div>
      <h1>Login</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p style={{ color: 'red' }}>{error}</p>}
        {info && <p style={{ color: 'green' }}>{info}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Ingresando...' : 'Iniciar sesión'}
        </button>
      </form>

      <button type="button" onClick={handleResetPassword}>
        ¿Olvidaste tu contraseña?
      </button>

      <p>
        ¿No tienes cuenta? <Link to="/register">Regístrate</Link>
      </p>
    </div>
  )
}

export default Login
