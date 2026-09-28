import { NavLink, Outlet } from 'react-router-dom'
import { CalendarDays, LogOut, UserRound } from 'lucide-react'
import { useClientBusiness } from '../../context/client-context'
import { useAuth } from '../../context/auth-context'

export default function ClientAccountLayout() {
  const { endSession } = useClientBusiness()
  const { userDoc } = useAuth()
  return <div className="public-container client-account">
    <aside className="client-sidebar">
      <p className="client-overline">MI CUENTA</p>
      <p className="client-sidebar-name">Hola, {userDoc.firstName}</p>
      <nav aria-label="Mi cuenta">
        <NavLink to="/cliente/reservas"><CalendarDays size={18} />Mis reservas</NavLink>
        <NavLink to="/cliente/perfil"><UserRound size={18} />Mi perfil</NavLink>
        <button onClick={endSession}><LogOut size={18} />Cerrar sesión</button>
      </nav>
    </aside>
    <div className="client-account-content"><Outlet /></div>
  </div>
}
