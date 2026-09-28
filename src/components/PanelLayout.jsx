import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import AdminLayout from './AdminLayout'

export default function PanelLayout() {
  const { membership } = useAuth()
  return membership.role === 'client' ? <Navigate to="/cliente" replace /> : <AdminLayout />
}
