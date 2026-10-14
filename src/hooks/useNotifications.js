import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'
import { dateMillis } from '../lib/clientPresentation'
import { bookingRequest } from '../lib/bookingApi'

export default function useNotifications() {
  const { membership, currentUser } = useAuth()
  const businessId = membership.businessId, uid = currentUser.uid
  const [items, setItems] = useState([]), [now, setNow] = useState(Date.now), [error, setError] = useState('')
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const stop = onSnapshot(query(collection(db,'notifications'), where('businessId','==',businessId), where('recipientUserId','==',uid)), snapshot => {
      setItems(snapshot.docs.map(d => ({ ...d.data(), id:d.id }))); setNow(Date.now()); setError(''); setLoading(false)
    }, () => { setError('No se pudieron cargar los avisos de Firestore. Comprueba tu sesión y las reglas publicadas.'); setLoading(false) })
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => { stop(); clearInterval(timer) }
  }, [businessId, uid, attempt])
  async function markRead(id) {
    setBusy(true); setError('')
    try { await bookingRequest({ action:'notificationRead', businessId, id }) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  const visible = items.filter(n => dateMillis(n.visibleAt) <= now && (!n.expiresAt || dateMillis(n.expiresAt) > now)).sort((a,b) => dateMillis(b.visibleAt) - dateMillis(a.visibleAt))
  return { items:visible, loading, busy, error, markRead, reload:() => { setLoading(true); setAttempt(v => v + 1) } }
}
