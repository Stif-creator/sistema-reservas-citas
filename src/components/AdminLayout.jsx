import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'

// Enlaces de la barra de administración. Las próximas fases (categorías,
// profesionales, horarios) solo necesitan agregar una entrada aquí.
const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/negocio', label: 'Configuración del negocio' },
  { to: '/servicios', label: 'Servicios' },
  { to: '/profesionales', label: 'Profesionales' },
]

function AdminLayout() {
  const { membership, logout } = useAuth()
  const navigate = useNavigate()
  const [businessName, setBusinessName] = useState('')

  useEffect(() => {
    async function fetchBusinessName() {
      if (!membership?.businessId) return
      const snap = await getDoc(doc(db, 'businesses', membership.businessId))
      setBusinessName(snap.exists() ? snap.data().name : '')
    }
    fetchBusinessName()
  }, [membership])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div>
      <header>
        <h1>{businessName || 'Cargando negocio...'}</h1>
        <nav>
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} style={{ marginRight: 12 }}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </header>

      <hr />

      <main>
        <Outlet />
      </main>
    </div>
  )
}

export default AdminLayout
