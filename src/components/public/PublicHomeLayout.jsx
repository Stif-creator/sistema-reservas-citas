import { Link, Outlet } from 'react-router-dom'
import { usePublicBusiness } from '../../context/PublicBusinessContext'
import { useAuth } from '../../context/auth-context'
import SiteHeader from '../shared/SiteHeader'
import SiteFooter from '../shared/SiteFooter'
import '../shared/site.css'

export default function PublicHomeLayout() {
  const { business, businessId, base } = usePublicBusiness()
  const { membership } = useAuth()
  const platformMode = !businessId
  const home = base || '/'
  const links = platformMode ? [
    { to: '/', label: 'Inicio', end: true },
    { to: '/negocios', label: 'Negocios' },
    { to: '/nosotros', label: 'Nosotros' },
    { to: '/contacto', label: 'Contacto' },
  ] : [
    { to: home, label: 'Inicio', end: true },
    { to: `${home}#servicios`, label: 'Servicios' },
    { to: `${home}#profesionales`, label: 'Profesionales' },
    { to: `${home}#promociones`, label: 'Promociones' },
    { to: `${home}#opiniones`, label: 'Opiniones' },
    { to: `${base}/reservar`, label: 'Reservar' },
    { to: `${base}/nosotros`, label: 'Nosotros' },
    { to: `${base}/contacto`, label: 'Contacto' },
  ]
  return <div className={businessId ? 'business-public-shell' : 'platform-public-shell'}>
    <SiteHeader business={business} homeTo={home} links={links} platformMode={platformMode} businessMode={!!businessId}>
      {platformMode && <Link className="public-button platform-header-explore" to="/negocios">Explorar negocios</Link>}
      {membership?.status === 'active' ? <Link className="public-button" to="/dashboard">Mi panel</Link> : <>
        <Link className="public-button secondary" to={`${base}/login`}>Iniciar sesión</Link>
        <Link className="public-button" to={`${base}/registro`}>Crear cuenta</Link>
      </>}
    </SiteHeader>
    <Outlet />
    <SiteFooter business={business} homeTo={home} contactTo={`${base}/contacto`} platformMode={platformMode} />
  </div>
}
