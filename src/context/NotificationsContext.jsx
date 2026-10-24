import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from './auth-context'
import { dateMillis } from '../lib/clientPresentation'
import { bookingRequest } from '../lib/bookingApi'
import { NotificationsContext } from './notifications-context'

export function NotificationsProvider({ children }) {
  const { membership, currentUser } = useAuth()
  const businessId = membership?.businessId
  const uid = currentUser?.uid
  const [now, setNow] = useState(() => Date.now())
  const [snapshot, setSnapshot] = useState({ key: '', items: [], error: '', loading: true })
  const [busy, setBusy] = useState(false)
  const [markingId, setMarkingId] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!businessId || !uid) return undefined
    const scopeKey = `${businessId}:${uid}`
    const source = query(collection(db, 'notifications'), where('businessId', '==', businessId), where('recipientUserId', '==', uid))
    const stop = onSnapshot(source, snapshot => {
      setSnapshot({ key: scopeKey, items: snapshot.docs.map(item => ({ ...item.data(), id: item.id })), error: '', loading: false })
      setNow(Date.now())
    }, () => {
      setSnapshot({ key: scopeKey, items: [], error: 'No se pudieron cargar los avisos de Firestore. Comprueba tu sesión y las reglas publicadas.', loading: false })
    })
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => { stop(); clearInterval(timer) }
  }, [businessId, uid, attempt])

  const current = snapshot.key === `${businessId}:${uid}`
  const visible = useMemo(() => (current ? snapshot.items : [])
    .filter(item => dateMillis(item.visibleAt) <= now && (!item.expiresAt || dateMillis(item.expiresAt) > now))
    .sort((a, b) => dateMillis(b.visibleAt) - dateMillis(a.visibleAt)), [current, snapshot.items, now])

  async function markRead(id) {
    setBusy(true)
    setMarkingId(id)
    try { await bookingRequest({ action: 'notificationRead', businessId, id }) }
    catch (failure) { setSnapshot(previous => ({ ...previous, key: `${businessId}:${uid}`, error: failure.message })) }
    finally { setBusy(false); setMarkingId('') }
  }

  async function markAllRead() {
    setBusy(true)
    setMarkingId('*')
    try { await bookingRequest({ action: 'notificationReadAll', businessId }) }
    catch (failure) { setSnapshot(previous => ({ ...previous, key: `${businessId}:${uid}`, error: failure.message })) }
    finally { setBusy(false); setMarkingId('') }
  }

  const value = { items: visible, now, loading: !current || snapshot.loading, busy, markingId, error: current ? snapshot.error : '', markRead, markAllRead,
    reload: () => { setSnapshot(previous => ({ ...previous, key: `${businessId}:${uid}`, loading: true, error: '' })); setAttempt(value => value + 1) } }
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}
