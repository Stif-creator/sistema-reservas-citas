import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useAuth } from '../context/auth-context'
import useNotifications from '../hooks/useNotifications'

export default function NotificationLink() {
  const { membership } = useAuth()
  const { items, error } = useNotifications()
  const count = items.filter(n => !n.read).length
  return <Link to={membership.role === 'client' ? '/cliente/avisos' : '/avisos'} className="inline-flex items-center gap-1 p-2" aria-label={error ? 'Avisos: no se pudo consultar el contador' : `Avisos: ${count} sin leer`}><Bell size={20} /><span aria-hidden="true">{error ? '!' : count > 0 ? count : ''}</span></Link>
}
