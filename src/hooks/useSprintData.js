import { useCallback, useEffect, useState } from 'react'
import { bookingRequest } from '../lib/bookingApi'
import { useAuth } from '../context/auth-context'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'

export default function useSprintData(action = 'hub') {
  const { membership } = useAuth()
  const businessId = membership?.businessId
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  const [refreshing, setRefreshing] = useState(true)
  useEffect(() => {
    if (!businessId) return
    if (action === 'clients') {
      const result = {}, failures = {}
      const stops = ['clients', 'reservations'].map(name => onSnapshot(query(collection(db, name), where('businessId', '==', businessId)), snapshot => {
        result[name] = snapshot.docs.map(d => ({ ...d.data(), id: d.id }))
        delete failures[name]
        if (result.clients && result.reservations) { setData({ ...result }); setRefreshing(false) }
        setError(Object.values(failures)[0] || '')
      }, () => { failures[name] = 'No se pudieron consultar los clientes o su historial en Firestore. Comprueba tu sesión y las reglas publicadas.'; setError(failures[name]); setRefreshing(false) }))
      return () => stops.forEach(stop => stop())
    }
    let active = true, inFlight = false
    async function refresh() {
      if (inFlight) return
      inFlight = true; setRefreshing(true)
      try { const result = await bookingRequest({ action, businessId }); if (active) { setData(result); setError('') } }
      catch (e) { if (active) setError(e.message) }
      finally { inFlight = false; if (active) setRefreshing(false) }
    }
    refresh()
    const timer = setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [action, businessId, version])
  const mutate = useCallback(async input => {
    setBusy(true); setError('')
    try { await bookingRequest({ ...input, businessId }); setVersion(v => v + 1); return true }
    catch (e) { setError(e.message); return false }
    finally { setBusy(false) }
  }, [businessId])
  return { data, error, busy, mutate, refreshing, reload: () => { setRefreshing(true); setVersion(v => v + 1) } }
}
