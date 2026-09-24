import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import {
  Bell,
  Calendar,
  CalendarCheck,
  CalendarX,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Scissors,
  Search,
  Settings,
  Users,
  X,
} from 'lucide-react'

// Enlaces de la barra de administración. Las próximas fases (categorías,
// profesionales, horarios) solo necesitan agregar una entrada aquí.
const GENERAL_LINKS = [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }]

const COMING_SOON_LINKS = [
  { label: 'Reservas', icon: CalendarCheck },
  { label: 'Calendario', icon: Calendar },
]

// Cada link declara qué roles pueden verlo: Bloqueos es el único de esta
// sección visible también para profesionales, el resto sigue siendo
// exclusivo de admin.
const BUSINESS_LINKS = [
  { to: '/servicios', label: 'Servicios', icon: Scissors, roles: ['admin'] },
  {
    to: '/profesionales',
    label: 'Profesionales',
    icon: Users,
    roles: ['admin'],
  },
  {
    to: '/bloqueos',
    label: 'Bloqueos',
    icon: CalendarX,
    roles: ['admin', 'professional'],
  },
  { to: '/negocio', label: 'Configuración', icon: Settings, roles: ['admin'] },
]

const navLinkClasses = ({ isActive }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-indigo-50 text-primary' : 'text-muted hover:bg-slate-50 hover:text-ink'
  }`

function initialsFor(text) {
  return (text || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('')
}

function AdminLayout() {
  const { membership, userDoc, logout } = useAuth()
  const navigate = useNavigate()
  const [businessName, setBusinessName] = useState('')
  const [layoutError, setLayoutError] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef(null)

  const userName = userDoc ? `${userDoc.firstName} ${userDoc.lastName}` : ''
  const visibleBusinessLinks = BUSINESS_LINKS.filter((link) =>
    link.roles.includes(membership?.role)
  )

  useEffect(() => {
    let active = true
    async function fetchBusinessName() {
      if (!membership?.businessId) return
      try {
        const snap = await getDoc(doc(db, 'businesses', membership.businessId))
        if (active) setBusinessName(snap.exists() ? snap.data().name : 'Negocio no disponible')
      } catch {
        if (active)
          setLayoutError('No se pudo cargar el negocio. Recarga la página para reintentar.')
      }
    }
    fetchBusinessName()
    return () => {
      active = false
    }
  }, [membership])

  useEffect(() => {
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleLogout() {
    try {
      await logout()
      navigate('/login')
    } catch {
      setLayoutError('No se pudo cerrar la sesión. Inténtalo de nuevo.')
    }
  }

  const sidebarContent = (
    <>
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-white">
          {initialsFor(businessName) || '…'}
        </div>
        <span className="truncate text-sm font-semibold text-ink">
          {businessName || 'Cargando negocio...'}
        </span>
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          className="ml-auto rounded-lg p-1.5 text-muted hover:bg-slate-100 lg:hidden"
          aria-label="Cerrar menú"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        <div>
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            General
          </p>
          <div className="space-y-1">
            {GENERAL_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={navLinkClasses}
                onClick={() => setMobileNavOpen(false)}
              >
                <link.icon size={18} />
                {link.label}
              </NavLink>
            ))}
            {COMING_SOON_LINKS.map((link) => (
              <div
                key={link.label}
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted opacity-50"
              >
                <link.icon size={18} />
                {link.label}
                <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Próximamente
                </span>
              </div>
            ))}
          </div>
        </div>

        {visibleBusinessLinks.length > 0 && (
          <div>
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Negocio
            </p>
            <div className="space-y-1">
              {visibleBusinessLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={navLinkClasses}
                  onClick={() => setMobileNavOpen(false)}
                >
                  <link.icon size={18} />
                  {link.label}
                </NavLink>
              ))}
            </div>
          </div>
        )}
      </nav>

      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-primary">
            {initialsFor(userName) || '…'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{userName || 'Cargando...'}</p>
            <p className="truncate text-xs capitalize text-muted">
              {membership?.role ?? 'Sin rol'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Cerrar sesión"
            className="rounded-lg p-2 text-muted transition-colors hover:bg-slate-100 hover:text-error"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar: fijo en escritorio, off-canvas en móvil */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface transition-transform duration-200 lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-30 bg-ink/30 lg:hidden"
        />
      )}

      <div className="flex min-h-screen flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="rounded-lg p-2 text-muted hover:bg-slate-100 lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu size={20} />
          </button>

          <div className="relative hidden w-full max-w-sm sm:block">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="text"
              placeholder="Buscar..."
              className="w-full rounded-lg border border-border bg-slate-50 py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-primary focus:bg-white focus:outline-none"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg p-2 text-muted hover:bg-slate-100 hover:text-ink"
              aria-label="Notificaciones"
            >
              <Bell size={20} />
            </button>

            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2 text-sm hover:bg-slate-100"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-primary">
                  {initialsFor(userName) || '…'}
                </div>
                <span className="hidden max-w-[10rem] truncate font-medium text-ink sm:inline">
                  {userName || 'Cargando...'}
                </span>
                <ChevronDown size={16} className="text-muted" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-border bg-surface py-1 shadow-card">
                  <div className="border-b border-border px-3 py-2">
                    <p className="truncate text-sm font-medium text-ink">{userName}</p>
                    <p className="truncate text-xs capitalize text-muted">
                      {membership?.role ?? 'Sin rol'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-error hover:bg-red-50"
                  >
                    <LogOut size={16} />
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {layoutError && (
            <p role="alert" className="mb-4 text-error">
              {layoutError}
            </p>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AdminLayout
