import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { Bell } from 'lucide-react'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'
import { dateMillis } from '../lib/clientPresentation'

export default function NotificationLink() {
  const { membership, currentUser } = useAuth()
  const [items, setItems] = useState([]), [now, setNow] = useState(Date.now), [error, setError] = useState(false)
  useEffect(() => {
    const stop = onSnapshot(query(collection(db,'notifications'), where('businessId','==',membership.businessId), where('recipientUserId','==',currentUser.uid)), snap => { setItems(snap.docs.map(d => d.data())); setError(false) }, () => setError(true))
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => { stop(); clearInterval(timer) }
  }, [membership.businessId, currentUser.uid])
  const count = items.filter(n => !n.read && dateMillis(n.visibleAt) <= now && (!n.expiresAt || dateMillis(n.expiresAt) > now)).length
  return <Link to={membership.role === 'client' ? '/cliente/avisos' : '/avisos'} className="inline-flex items-center gap-1 p-2" aria-label={error ? 'Avisos: no se pudo consultar el contador' : `Avisos: ${count} sin leer`}><Bell size={20} /><span aria-hidden="true">{error ? '!' : count > 0 ? count : ''}</span></Link>
}
