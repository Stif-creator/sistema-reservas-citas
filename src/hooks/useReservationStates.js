import { useEffect, useMemo, useState } from 'react'
import { reservationDisplayStatus } from '../lib/clientPresentation'

export default function useReservationStates(items) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const refresh = () => setNow(Date.now())
    const timer = setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])
  return useMemo(() => items.map(item => ({ ...item, displayStatus: reservationDisplayStatus(item, now) })), [items, now])
}
