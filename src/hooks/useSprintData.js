import { useCallback, useEffect, useState } from 'react'
import { bookingRequest } from '../lib/bookingApi'
import { useAuth } from '../context/auth-context'

export default function useSprintData(action = 'hub') {
  const { membership, isSuperadmin } = useAuth()
  const businessId = membership?.businessId
  const requestKey = `${action}:${businessId || (isSuperadmin ? 'platform' : '')}`
  const [dataState, setDataState] = useState({ key: '', value: null })
  const [errorState, setErrorState] = useState({ key: '', value: '' })
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  const [refreshing, setRefreshing] = useState(true)
  const data = dataState.key === requestKey ? dataState.value : null
  const error = errorState.key === requestKey ? errorState.value : ''
  useEffect(() => {
    if (!businessId && !(isSuperadmin && action === 'clients')) return
    let active = true, inFlight = false
    async function refresh() {
      if (inFlight) return
      inFlight = true; setRefreshing(true)
      try {
        const result = await bookingRequest({ action, ...(businessId ? { businessId } : {}) })
        if (active) { setDataState({ key: requestKey, value: result }); setErrorState({ key: requestKey, value: '' }) }
      }
      catch (e) { if (active) setErrorState({ key: requestKey, value: e.message }) }
      finally { inFlight = false; if (active) setRefreshing(false) }
    }
    refresh()
    const timer = setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [action, businessId, isSuperadmin, requestKey, version])
  const mutate = useCallback(async input => {
    setBusy(true); setErrorState({ key: requestKey, value: '' })
    try { await bookingRequest({ ...input, businessId }); setVersion(v => v + 1); return true }
    catch (e) { setErrorState({ key: requestKey, value: e.message }); return false }
    finally { setBusy(false) }
  }, [businessId, requestKey])
  return { data, error, busy, mutate, refreshing, reload: () => { setRefreshing(true); setVersion(v => v + 1) } }
}
