import { createContext, useContext, useEffect, useState } from 'react'
import { Link, Outlet, useParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { CalendarDays, ArrowLeft } from 'lucide-react'
import { db } from '../../firebase/config'
import { brandVariables, safeImageUrl } from '../../lib/brand'
import './public.css'

const PublicContext = createContext(null)
export const usePublicBusiness = () => useContext(PublicContext)

export function Brand() {
  const { business, base } = usePublicBusiness()
  const logo = safeImageUrl(business?.logo?.url)
  return (
    <Link to={base || '/'} className="public-brand">
      {logo ? (
        <img src={logo} alt="" />
      ) : (
        <span className="brand-mark">
          <CalendarDays size={25} />
        </span>
      )}
      <span>
        <strong>{business?.name || 'CitasPro'}</strong>
        <small>Tu tiempo, nuestra prioridad</small>
      </span>
    </Link>
  )
}

export function AuthShell({ children, register = false }) {
  const { business, base } = usePublicBusiness()
  const cover = safeImageUrl(business?.cover?.url)
  return (
    <main className="auth-page">
      <Link className="back-link" to={base || '/'}>
        <ArrowLeft size={16} /> Volver al inicio
      </Link>
      <div className="auth-card">
        <section className="auth-form">
          <Brand />
          {children}
        </section>
        <aside
          className={`auth-aside ${cover ? 'has-cover' : ''}`}
          style={
            cover
              ? {
                  backgroundImage: `linear-gradient(0deg,rgba(8,24,44,.88),rgba(8,24,44,.12)),url("${cover}")`,
                }
              : undefined
          }
        >
          <div className="calendar-art">
            <CalendarDays size={86} strokeWidth={1.4} />
            <span>✓</span>
          </div>
          <h2>
            {register
              ? 'Únete a una experiencia más simple'
              : 'Más tiempo para lo que realmente importa'}
          </h2>
          <div className="short-line" />
          <p>
            {register
              ? 'Conoce nuestros servicios y encuentra tu próximo momento para ti.'
              : 'Tus servicios favoritos, en un solo lugar. Organiza tu día y disfruta de lo que más te gusta.'}
          </p>
          <ul>
            <li>✓ Una cuenta para comenzar</li>
            <li>✓ Servicios de tu negocio favorito</li>
            <li>✓ Una experiencia a tu medida</li>
          </ul>
        </aside>
      </div>
      <p className="public-footnote">Hecho para aprovechar mejor tu tiempo.</p>
    </main>
  )
}

export default function PublicLayout() {
  const { businessId } = useParams()
  const [state, setState] = useState({ id: null, business: null, error: '' })
  useEffect(() => {
    if (!businessId) return
    return onSnapshot(
      doc(db, 'businesses', businessId),
      (snap) => {
        const data = snap.data()
        const available =
          snap.exists() && data.status === 'active' && data.settings?.publicPageEnabled === true
        setState({
          id: businessId,
          business: available ? { ...data, id: snap.id } : null,
          error: available ? '' : 'Esta página no está disponible.',
        })
      },
      () =>
        setState({
          id: businessId,
          business: null,
          error: 'No pudimos cargar el negocio. Comprueba tu conexión e inténtalo de nuevo.',
        })
    )
  }, [businessId])
  const business = businessId && state.id === businessId ? state.business : null
  const base = businessId ? `/b/${encodeURIComponent(businessId)}` : ''
  return (
    <PublicContext.Provider value={{ business, businessId, base }}>
      <div className="public-site" style={brandVariables(business?.appearance)}>
        {businessId && state.id !== businessId ? (
          <div className="public-message" role="status">
            Cargando negocio…
          </div>
        ) : businessId && state.error ? (
          <div className="public-message" role="alert">
            <h1>{state.error}</h1>
            <button className="public-button" onClick={() => window.location.reload()}>
              Reintentar
            </button>
            <Link to="/">Ir al inicio</Link>
          </div>
        ) : (
          <Outlet key={businessId || 'platform'} />
        )}
      </div>
    </PublicContext.Provider>
  )
}
