import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import AdminLayout from './AdminLayout'
import SuperadminLayout from './SuperadminLayout'
import { NotificationsProvider } from '../context/NotificationsContext'

export default function PanelLayout() {
  const { membership, isSuperadmin } = useAuth()
  return membership?.role === 'client' ? <Navigate to="/cliente" replace /> : <NotificationsProvider>{isSuperadmin ? <SuperadminLayout /> : <AdminLayout />}</NotificationsProvider>
}
