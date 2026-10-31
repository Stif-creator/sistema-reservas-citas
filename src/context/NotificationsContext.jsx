import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from './auth-context'
import { dateMillis } from '../lib/clientPresentation'
import { bookingRequest } from '../lib/bookingApi'
import { NotificationsContext } from './notifications-context'

export function NotificationsProvider({ children }) {
  const { membership, currentUser, isSuperadmin } = useAuth()
  const businessId = membership?.businessId
  const uid = currentUser?.uid
  const [now, setNow] = useState(() => Date.now())
  const [snapshot, setSnapshot] = useState({ key: '', items: [], error: '', loading: true })
  const [busy, setBusy] = useState(false)
  const [markingId, setMarkingId] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if ((!businessId && !isSuperadmin) || !uid) return undefined
    const scopeKey = `${isSuperadmin ? 'platform' : businessId}:${uid}`
    const source = isSuperadmin
      ? query(collection(db, 'notifications'), where('recipientUserId', '==', uid), where('type', '==', 'platform'))
      : query(collection(db, 'notifications'), where('businessId', '==', businessId), where('recipientUserId', '==', uid))
    const stop = onSnapshot(source, snapshot => {
      const items = snapshot.docs.map(item => ({ ...item.data(), id: item.id }))
      setSnapshot({ key: scopeKey, items, error: '', loading: false })
      setNow(Date.now())
    }, () => {
      setSnapshot({ key: scopeKey, items: [], error: 'No se pudieron cargar los avisos de Firestore. Comprueba tu sesión y las reglas publicadas.', loading: false })
    })
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => { stop(); clearInterval(timer) }
  }, [businessId, uid, isSuperadmin, attempt])

  const scopeKey = `${isSuperadmin ? 'platform' : businessId}:${uid}`
  const current = snapshot.key === scopeKey
  const visible = useMemo(() => (current ? snapshot.items : [])
    .filter(item => item.invalidated !== true)
    .filter(item => dateMillis(item.visibleAt) <= now && (!item.expiresAt || dateMillis(item.expiresAt) > now))
    .sort((a, b) => dateMillis(b.visibleAt) - dateMillis(a.visibleAt)), [current, snapshot.items, now])

  async function markRead(id) {
    setBusy(true)
    setMarkingId(id)
    try { await bookingRequest({ action: 'notificationRead', ...(isSuperadmin ? {} : { businessId }), id }) }
    catch (failure) { setSnapshot(previous => ({ ...previous, key: scopeKey, error: failure.message })) }
    finally { setBusy(false); setMarkingId('') }
  }

  async function markAllRead() {
    setBusy(true)
    setMarkingId('*')
    try { await bookingRequest({ action: 'notificationReadAll', ...(isSuperadmin ? {} : { businessId }) }) }
    catch (failure) { setSnapshot(previous => ({ ...previous, key: scopeKey, error: failure.message })) }
    finally { setBusy(false); setMarkingId('') }
  }

  const value = { items: visible, now, loading: !current || snapshot.loading, busy, markingId, error: current ? snapshot.error : '', markRead, markAllRead,
    reload: () => { setSnapshot(previous => ({ ...previous, key: scopeKey, loading: true, error: '' })); setAttempt(value => value + 1) } }
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}
