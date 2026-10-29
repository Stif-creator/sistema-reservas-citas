import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import { useFeedback } from '../context/feedback-context'
import { confirmDiscard } from '../lib/unsavedForms'
import NotificationLink from './NotificationLink'
import { ListSearchContext } from '../context/list-search-context'
import { Activity, Bell, Building2, ChartNoAxesCombined, Headset, LayoutDashboard, LogOut, Menu, Search, ShieldCheck, Users, X, CalendarCheck, ClipboardList } from 'lucide-react'
import './superadmin.css'

const groups = [
  { label: 'General', links: [
    ['/dashboard', 'Dashboard global', LayoutDashboard],
    ['/plataforma/negocios', 'Negocios', Building2],
    ['/plataforma/solicitudes', 'Solicitudes de negocios', ClipboardList],
    ['/plataforma/administradores', 'Administradores', Users],
    ['/plataforma/estadisticas', 'Estadísticas y reportes', ChartNoAxesCombined],
  ] },
  { label: 'Supervisión', links: [
    ['/plataforma/actividad', 'Actividad de negocios', Activity],
    ['/plataforma/seguridad', 'Seguridad y auditoría', ShieldCheck],
    ['/avisos', 'Avisos de plataforma', Bell],
    ['/plataforma/soporte', 'Soporte técnico', Headset],
  ] },
  { label: 'Cuenta', links: [['/seguridad', 'Mi seguridad', ShieldCheck]] },
]

const initials = user => `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || 'SA'

export default function SuperadminLayout() {
  const { userDoc, logout } = useAuth()
  const { confirm } = useFeedback()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [search, setSearch] = useState('')
  const name = [userDoc?.firstName, userDoc?.lastName].filter(Boolean).join(' ') || 'Superadministrador'
  async function signOut() {
    if (!await confirmDiscard(document, confirm)) return
    await logout()
    navigate('/login')
  }
  const sidebar = <>
    <Link className="superadmin-brand" to="/dashboard" onClick={() => setMobileOpen(false)}><span className="superadmin-brand-mark"><CalendarCheck size={22} /></span><span><strong>CitasPro</strong><small>Superadministración</small></span><X className="superadmin-close" size={19} aria-hidden="true" /></Link>
    <nav className="superadmin-nav" aria-label="Navegación del superadministrador">{groups.map(group => <section key={group.label}><h2>{group.label}</h2>{group.links.map(([to, label, Icon]) => <NavLink key={to} end={to === '/dashboard' || to === '/avisos' || to === '/seguridad'} to={to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `superadmin-nav-link${isActive ? ' active' : ''}`}><Icon size={18} /><span>{label}</span></NavLink>)}</section>)}</nav>
    <div className="superadmin-profile"><span className="superadmin-avatar">{initials(userDoc)}</span><span className="superadmin-profile-copy"><strong>{name}</strong><small>CitasPro</small></span><button type="button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={signOut}><LogOut size={18} /></button></div>
  </>
  return <div className="superadmin-shell">
    <aside className={`superadmin-sidebar${mobileOpen ? ' open' : ''}`}>{sidebar}</aside>
    {mobileOpen && <button className="superadmin-scrim" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} />}
    <div className="superadmin-main">
      <header className="superadmin-topbar"><button type="button" className="superadmin-menu-button" aria-label="Abrir menú" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><label className="superadmin-search"><Search size={17} /><input type="search" placeholder="Buscar negocios, administradores o información…" value={search} onChange={event => setSearch(event.target.value)} aria-label="Buscar en esta página" /></label><div className="superadmin-user"><NotificationLink /><span className="superadmin-avatar">{initials(userDoc)}</span><span><strong>{name}</strong><small>Superadministrador</small></span></div></header>
      <main className="superadmin-content"><ListSearchContext.Provider value={search}><Outlet context={{ search }} /></ListSearchContext.Provider></main>
    </div>
  </div>
}
