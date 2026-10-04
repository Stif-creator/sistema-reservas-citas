import { useEffect, useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { UserRound } from 'lucide-react'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/auth-context'
import { ClientContext } from '../../context/client-context'
import { brandVariables } from '../../lib/brand'
import SiteHeader from '../shared/SiteHeader'
import SiteFooter from '../shared/SiteFooter'
import '../public/public.css'
import '../shared/site.css'
import './client.css'

const links = [
  { to: '/cliente', label: 'Inicio', end: true },
  { to: '/cliente/servicios', label: 'Servicios' },
  { to: '/cliente/nosotros', label: 'Nosotros' },
  { to: '/cliente/contacto', label: 'Contacto' },
]

export default function ClientLayout() {
  const { membership } = useAuth()
  return <ClientWorkspace key={`${membership.businessId}:${membership.userId}`} businessId={membership.businessId} />
}

function ClientWorkspace({ businessId }) {
  const { userDoc, logout } = useAuth()
  const navigate = useNavigate()
  const [business, setBusiness] = useState(null)
  const [businessReady, setBusinessReady] = useState(false)
  const [businessError, setBusinessError] = useState('')
  const [catalog, setCatalog] = useState({ services: [], categories: [], ready: {}, errors: {} })
  const [sessionError, setSessionError] = useState('')
  useEffect(() => onSnapshot(doc(db, 'businesses', businessId), (snap) => {
    const data = snap.data()
    setBusiness(snap.exists() && data.status === 'active' ? { ...data, id: snap.id } : null)
    setBusinessError(snap.exists() && data.status === 'active' ? '' : 'Este negocio no está disponible.')
    setBusinessReady(true)
  }, () => { setBusinessError('No pudimos cargar el negocio. Recarga la página para volver a intentarlo.'); setBusinessReady(true) }), [businessId])

  useEffect(() => {
    const sources = {
      services: query(collection(db, 'services'), where('businessId', '==', businessId), where('isActive', '==', true), where('isPublic', '==', true)),
      categories: query(collection(db, 'categories'), where('businessId', '==', businessId)),
    }
    const stops = Object.entries(sources).map(([key, source]) => onSnapshot(source, (snap) => {
      setCatalog(previous => ({ ...previous, [key]: snap.docs.map(item => ({ ...item.data(), id: item.id })),
        ready: { ...previous.ready, [key]: true }, errors: { ...previous.errors, [key]: '' } }))
    }, () => setCatalog(previous => ({ ...previous, [key]: [], ready: { ...previous.ready, [key]: true },
      errors: { ...previous.errors, [key]: 'No pudimos cargar el catálogo. Recarga la página para volver a intentarlo.' } }))))
    return () => stops.forEach(stop => stop())
  }, [businessId])

  async function endSession() {
    try { await logout(); navigate('/login', { replace: true }) }
    catch { setSessionError('No pudimos cerrar tu sesión. Inténtalo de nuevo.') }
  }
  const value = { business, services: catalog.services, categories: catalog.categories,
    catalogLoading: !catalog.ready.services || !catalog.ready.categories,
    catalogError: catalog.errors.services || catalog.errors.categories || '', endSession }
  return <ClientContext.Provider value={value}>
    <div className="public-site client-site" style={brandVariables(business?.appearance)}>
      <SiteHeader business={business} homeTo="/cliente" links={links}>
        <Link className="client-user-link" to="/cliente/perfil"><UserRound size={17} />{userDoc.firstName}</Link>
        <Link className="public-button" to="/cliente/reservas">Mis reservas</Link>
      </SiteHeader>
      <main id="contenido" className="client-main" tabIndex={-1}>
        {sessionError && <p className="public-alert public-container" role="alert">{sessionError}</p>}
        {!businessReady ? <p className="client-loading" role="status">Cargando tu negocio…</p>
          : businessError ? <div className="client-empty" role="alert"><h1>{businessError}</h1><button className="public-button secondary" onClick={() => window.location.reload()}>Reintentar</button><button className="public-button secondary" onClick={endSession}>Cerrar sesión</button></div>
          : <Outlet />}
      </main>
      <SiteFooter business={business} homeTo="/cliente" contactTo="/cliente/contacto" />
    </div>
  </ClientContext.Provider>
}
