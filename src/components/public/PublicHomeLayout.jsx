import { Link, Outlet } from 'react-router-dom'
import { usePublicBusiness } from '../../context/PublicBusinessContext'
import { useAuth } from '../../context/auth-context'
import SiteHeader from '../shared/SiteHeader'
import SiteFooter from '../shared/SiteFooter'
import '../shared/site.css'

export default function PublicHomeLayout() {
  const { business, base } = usePublicBusiness()
  const { membership } = useAuth()
  const home = base || '/'
  const links = [
    { to: home, label: 'Inicio', end: true },
    { to: `${home}#servicios`, label: business ? 'Servicios' : 'Negocios' },
    { to: `${base}/nosotros`, label: 'Nosotros' },
    { to: `${base}/contacto`, label: 'Contacto' },
  ]
  return <>
    <SiteHeader business={business} homeTo={home} links={links}>
      {membership?.status === 'active' ? <Link className="public-button" to="/dashboard">Mi panel</Link> : <>
        <Link className="public-button secondary" to={`${base}/login`}>Iniciar sesión</Link>
        <Link className="public-button" to={`${base}/registro`}>Crear cuenta</Link>
      </>}
    </SiteHeader>
    <Outlet />
    <SiteFooter business={business} homeTo={home} contactTo={`${base}/contacto`} />
  </>
}
