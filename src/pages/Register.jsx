import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import { getAuthErrorMessage } from '../firebase/authErrors'

const ROLES = [
  { value: 'client', label: 'Cliente' },
  { value: 'professional', label: 'Profesional' },
  { value: 'admin', label: 'Administrador' },
]

function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('client')
  const [businessName, setBusinessName] = useState('')
  const [businessId, setBusinessId] = useState('')
  const [businesses, setBusinesses] = useState([])
  const [businessesLoading, setBusinessesLoading] = useState(true)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function fetchBusinesses() {
      try {
        const q = query(
          collection(db, 'businesses'),
          where('status', '==', 'active'),
          where('settings.publicPageEnabled', '==', true)
        )
        const snap = await getDocs(q)
        setBusinesses(snap.docs.map((d) => ({ id: d.id, name: d.data().name })))
      } catch (err) {
        console.error('Error al cargar negocios', err)
      } finally {
        setBusinessesLoading(false)
      }
    }
    fetchBusinesses()
  }, [])

  // Limpia el mensaje de error de un campo en cuanto el usuario vuelve a
  // escribir en él (detalle de UX; las reglas solo se vuelven a evaluar
  // por completo en el siguiente intento de envío, ver comentario en
  // handleSubmit).
  function clearFieldError(key) {
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev))
  }

  function validate() {
    const errors = {}
    const hasLetter = /\p{L}/u

    if (!firstName.trim()) {
      errors.firstName = 'El nombre es obligatorio.'
    } else if (!hasLetter.test(firstName)) {
      errors.firstName = 'El nombre debe contener al menos una letra.'
    }

    if (!lastName.trim()) {
      errors.lastName = 'El apellido es obligatorio.'
    } else if (!hasLetter.test(lastName)) {
      errors.lastName = 'El apellido debe contener al menos una letra.'
    }

    if (!email.trim()) {
      errors.email = 'El email es obligatorio.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Ingresa un email válido.'
    }

    if (!password) {
      errors.password = 'La contraseña es obligatoria.'
    } else if (password.length < 6) {
      errors.password = 'La contraseña debe tener al menos 6 caracteres.'
    }

    if (!phone.trim()) {
      errors.phone = 'El teléfono es obligatorio.'
    } else if (!/^\+?\d{8,}$/.test(phone.trim())) {
      errors.phone = 'Ingresa un teléfono válido: solo dígitos (puede empezar con "+"), mínimo 8 dígitos.'
    }

    if (role === 'admin') {
      if (!businessName.trim()) {
        errors.businessName = 'El nombre del negocio es obligatorio.'
      }
    } else if (!businessId) {
      errors.businessId = 'Selecciona un negocio.'
    }

    return errors
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    // Validamos solo al enviar (no en tiempo real, no deshabilitamos el
    // botón mientras se escribe): una única función validate() que
    // corre una vez por intento de envío es más simple de mantener que
    // sincronizar un estado "¿es válido?" con cada tecla, y para un
    // formulario de este tamaño no hace falta más.
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }

    setSubmitting(true)
    try {
      await register({
        firstName,
        lastName,
        email,
        password,
        phone,
        role,
        businessId,
        businessName,
      })
      navigate('/dashboard')
    } catch (err) {
      // Los errores de Firebase Auth (ej. auth/email-already-in-use)
      // traen un `.code`; los errores de rollback que arma register()
      // en AuthContext son un Error normal con el mensaje ya listo.
      setError(err.code ? getAuthErrorMessage(err) : err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h1>Register</h1>
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="firstName">Nombre</label>
          <input
            id="firstName"
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value)
              clearFieldError('firstName')
            }}
          />
          {fieldErrors.firstName && <p style={{ color: 'red' }}>{fieldErrors.firstName}</p>}
        </div>

        <div>
          <label htmlFor="lastName">Apellido</label>
          <input
            id="lastName"
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value)
              clearFieldError('lastName')
            }}
          />
          {fieldErrors.lastName && <p style={{ color: 'red' }}>{fieldErrors.lastName}</p>}
        </div>

        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              clearFieldError('email')
            }}
          />
          {fieldErrors.email && <p style={{ color: 'red' }}>{fieldErrors.email}</p>}
        </div>

        <div>
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              clearFieldError('password')
            }}
          />
          {fieldErrors.password && <p style={{ color: 'red' }}>{fieldErrors.password}</p>}
        </div>

        <div>
          <label htmlFor="phone">Teléfono</label>
          <input
            id="phone"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value)
              clearFieldError('phone')
            }}
          />
          {fieldErrors.phone && <p style={{ color: 'red' }}>{fieldErrors.phone}</p>}
        </div>

        <div>
          <label htmlFor="role">Rol</label>
          <select
            id="role"
            value={role}
            onChange={(e) => {
              setRole(e.target.value)
              setFieldErrors((prev) => ({ ...prev, businessName: '', businessId: '' }))
            }}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {role === 'admin' ? (
          <div>
            <label htmlFor="businessName">Nombre del negocio</label>
            <input
              id="businessName"
              value={businessName}
              onChange={(e) => {
                setBusinessName(e.target.value)
                clearFieldError('businessName')
              }}
            />
            {fieldErrors.businessName && <p style={{ color: 'red' }}>{fieldErrors.businessName}</p>}
          </div>
        ) : (
          <div>
            <label htmlFor="businessId">Negocio</label>
            <select
              id="businessId"
              value={businessId}
              onChange={(e) => {
                setBusinessId(e.target.value)
                clearFieldError('businessId')
              }}
            >
              <option value="" disabled>
                {businessesLoading ? 'Cargando negocios...' : 'Selecciona un negocio'}
              </option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {fieldErrors.businessId && <p style={{ color: 'red' }}>{fieldErrors.businessId}</p>}
          </div>
        )}

        {error && <p style={{ color: 'red' }}>{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creando cuenta...' : 'Registrarse'}
        </button>
      </form>

      <p>
        ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
      </p>
    </div>
  )
}

export default Register
