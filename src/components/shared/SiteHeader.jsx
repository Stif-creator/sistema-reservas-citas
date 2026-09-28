import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import BusinessBrand from './BusinessBrand'

export default function SiteHeader({ business, homeTo, links, children }) {
  const { pathname, hash } = useLocation()
  const [openAt, setOpenAt] = useState(null)
  const open = openAt === pathname
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [pathname, hash])
  return <header className="public-header site-header">
    <a className="site-skip" href="#contenido">Saltar al contenido</a>
    <div className="public-container header-inner">
      <BusinessBrand business={business} to={homeTo} />
      <button type="button" className="site-menu-toggle" aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={open} aria-controls="site-navigation" onClick={() => setOpenAt(open ? null : pathname)}>
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>
      <div id="site-navigation" className={`site-navigation ${open ? 'is-open' : ''}`}>
        <nav aria-label="Navegación principal" onClick={() => setOpenAt(null)}>
          {links.map((link) => link.to.includes('#')
            ? <Link key={link.to} to={link.to}>{link.label}</Link>
            : <NavLink key={link.to} to={link.to} end={link.end}>{link.label}</NavLink>)}
        </nav>
        <div className="header-actions" onClick={() => setOpenAt(null)}>{children}</div>
      </div>
    </div>
  </header>
}
