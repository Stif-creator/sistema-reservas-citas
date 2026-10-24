import { useContext } from 'react'
import { NotificationsContext } from '../context/notifications-context'

export default function useNotifications() {
  const value = useContext(NotificationsContext)
  if (!value) throw new Error('useNotifications debe usarse dentro de NotificationsProvider.')
  return value
}
