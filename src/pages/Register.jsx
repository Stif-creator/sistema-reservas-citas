import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { ArrowRight } from 'lucide-react'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import { getAuthErrorMessage } from '../firebase/authErrors'
import { AuthShell, usePublicBusiness } from '../components/public/PublicLayout'
import PasswordInput from '../components/public/PasswordInput'

export default function Register({ owner = false }) {
  const { register } = useAuth()
  const { business, businessId, base } = usePublicBusiness()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirm: '',
    phone: '',
    businessName: '',
    businessId: '',
  })
  const [role, setRole] = useState('client')
  const [businesses, setBusinesses] = useState([])
  const [error, setError] = useState('')
  const [listError, setListError] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (businessId || owner) return
    let active = true
    getDocs(
      query(
        collection(db, 'businesses'),
        where('status', '==', 'active'),
        where('settings.publicPageEnabled', '==', true)
      )
    )
      .then((snap) => {
        if (active) setBusinesses(snap.docs.map((d) => ({ id: d.id, name: d.data().name })))
      })
      .catch(() => {
        if (active)
          setListError('No pudimos cargar los negocios. Recarga la página para reintentar.')
      })
    return () => {
      active = false
    }
  }, [businessId, owner])
  function change(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: '' }))
  }
  async function submit(e) {
    e.preventDefault()
    setError('')
    const next = {}
    for (const key of ['firstName', 'lastName'])
      if (!/\p{L}/u.test(form[key].trim())) next[key] = 'Ingresa un nombre válido.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      next.email = 'Ingresa un correo válido.'
    if (form.password.length < 6) next.password = 'Usa al menos 6 caracteres.'
    if (form.confirm !== form.password) next.confirm = 'Las contraseñas no coinciden.'
    if (!/^\+?\d{8,}$/.test(form.phone.trim()))
      next.phone = 'Ingresa al menos 8 dígitos; puedes incluir + al inicio.'
    if (owner && !form.businessName.trim()) next.businessName = 'Ingresa el nombre de tu negocio.'
    if (!owner && !businessId && !form.businessId) next.businessId = 'Selecciona un negocio.'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      await register({
        ...form,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        businessName: form.businessName.trim(),
        businessId: businessId || form.businessId,
        role: owner ? 'admin' : role,
      })
      navigate('/dashboard')
    } catch (err) {
      setError(err.code ? getAuthErrorMessage(err) : err.message)
    } finally {
      setBusy(false)
    }
  }
  function field(key, label, type = 'text', placeholder = '', autoComplete) {
    const props = {
      id: key,
      value: form[key],
      onChange: (e) => change(key, e.target.value),
      placeholder,
      autoComplete,
      'aria-invalid': !!errors[key],
      'aria-describedby': errors[key] ? `${key}-error` : undefined,
    }
    return (
      <label htmlFor={key}>
        {label}
        {type === 'password' ? <PasswordInput {...props} /> : <input {...props} type={type} />}
        {errors[key] && (
          <small id={`${key}-error`} className="field-error">
            {errors[key]}
          </small>
        )}
      </label>
    )
  }
  return (
    <AuthShell register>
      <div className="auth-heading">
        <span className="eyebrow">UN NUEVO COMIENZO</span>
        <h1>{owner ? 'Crea tu negocio' : 'Crea tu cuenta'}</h1>
        <p>
          {owner
            ? 'Dale a tu negocio un espacio propio.'
            : business
              ? `Forma parte de ${business.name}.`
              : 'Encuentra tu negocio y comienza.'}
        </p>
      </div>
      <form className="public-form" onSubmit={submit} noValidate>
        <div className="form-grid">
          {field('firstName', 'Nombre', 'text', 'Tu nombre', 'given-name')}
          {field('lastName', 'Apellido', 'text', 'Tu apellido', 'family-name')}
        </div>
        {field('email', 'Correo electrónico', 'email', 'tu@correo.com', 'email')}
        {field('phone', 'Teléfono', 'tel', '+59170000000', 'tel')}
        <div className="form-grid">
          {field('password', 'Contraseña', 'password', 'Mínimo 6 caracteres', 'new-password')}
          {field(
            'confirm',
            'Confirmar contraseña',
            'password',
            'Repite tu contraseña',
            'new-password'
          )}
        </div>
        {owner ? (
          field(
            'businessName',
            'Nombre del negocio',
            'text',
            'El nombre de tu negocio',
            'organization'
          )
        ) : (
          <>
            {!businessId && (
              <label htmlFor="businessId">
                Negocio
                <select
                  id="businessId"
                  value={form.businessId}
                  onChange={(e) => change('businessId', e.target.value)}
                >
                  <option value="">Selecciona un negocio</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                {errors.businessId && <small className="field-error">{errors.businessId}</small>}
              </label>
            )}
            <label htmlFor="role">
              Quiero registrarme como
              <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="client">Cliente</option>
                <option value="professional">Profesional (requiere aprobación)</option>
              </select>
            </label>
            {role === 'professional' && (
              <p className="form-hint">El administrador deberá aprobar tu acceso al negocio.</p>
            )}
          </>
        )}
        {listError && (
          <p role="alert" className="public-alert">
            {listError}
          </p>
        )}
        {error && (
          <p role="alert" className="public-alert">
            {error}
          </p>
        )}
        <button className="public-button full" disabled={busy}>
          {busy ? 'Creando cuenta…' : owner ? 'Crear mi negocio' : 'Crear cuenta'}
          <ArrowRight size={17} />
        </button>
      </form>
      <p className="auth-switch">
        ¿Ya tienes cuenta?{' '}
        <Link className="text-link" to={`${base}/login`}>
          Inicia sesión
        </Link>
      </p>
      {!owner && !business && (
        <p className="public-footnote">
          ¿Eres dueño?{' '}
          <Link className="text-link" to="/crear-negocio">
            Crea tu negocio
          </Link>
        </p>
      )}
    </AuthShell>
  )
}
