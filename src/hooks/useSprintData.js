import { useCallback, useEffect, useState } from 'react'
import { bookingRequest } from '../lib/bookingApi'
import { useAuth } from '../context/auth-context'

export default function useSprintData(action = 'hub') {
  const { membership } = useAuth()
  const businessId = membership?.businessId
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!businessId) return
    let active = true
    async function refresh() {
      try { const result = await bookingRequest({ action, businessId }); if (active) { setData(result); setError('') } }
      catch (e) { if (active) setError(e.message) }
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
  return { data, error, busy, mutate, reload: () => setVersion(v => v + 1) }
}
