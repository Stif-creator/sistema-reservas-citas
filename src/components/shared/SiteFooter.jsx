import { Link } from 'react-router-dom'
import BusinessBrand from './BusinessBrand'

export default function SiteFooter({ business, homeTo = '/', contactTo = '/contacto' }) {
  return <footer className="public-container public-footer site-footer">
    <BusinessBrand business={business} to={homeTo} />
    <span>Tu tiempo, bien acompañado.</span>
    {business ? <Link to={contactTo}>Contáctanos</Link>
      : !business && <Link to="/crear-negocio">¿Tienes un negocio?</Link>}
  </footer>
}
