import { CalendarDays } from 'lucide-react'
import { Link } from 'react-router-dom'
import { safeImageUrl } from '../../lib/brand'

export default function BusinessBrand({ business, to = '/' }) {
  const logo = safeImageUrl(business?.logo?.url)
  return <Link to={to} className="public-brand">
    {logo ? <img src={logo} alt="" /> : <span className="brand-mark"><CalendarDays size={25} /></span>}
    <span><strong>{business?.name || 'CitasPro'}</strong><small>Tu tiempo, nuestra prioridad</small></span>
  </Link>
}
