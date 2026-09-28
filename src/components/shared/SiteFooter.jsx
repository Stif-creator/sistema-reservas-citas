import { Link } from 'react-router-dom'
import BusinessBrand from './BusinessBrand'

export default function SiteFooter({ business, homeTo = '/' }) {
  return <footer className="public-container public-footer site-footer">
    <BusinessBrand business={business} to={homeTo} />
    <span>Tu tiempo, bien acompañado.</span>
    {business?.contact?.email ? <a href={`mailto:${business.contact.email}`}>Contáctanos</a>
      : !business && <Link to="/crear-negocio">¿Tienes un negocio?</Link>}
  </footer>
}
