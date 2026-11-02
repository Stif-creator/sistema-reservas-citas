import useReservationStates from './useReservationStates'
import { useEffect, useState } from 'react'
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, startAfter, Timestamp, where } from 'firebase/firestore'
import { useAuth } from '../context/auth-context'
import { db } from '../firebase/config'

const PAGE_SIZE = 500
const DAY_MS = 86400000

async function readPages(source) {
  const values = []
  let cursor = null
  while (true) {
    const page = await getDocs(query(source, ...(cursor ? [startAfter(cursor)] : []), limit(PAGE_SIZE)))
    values.push(...page.docs.map(item => ({ ...item.data(), id: item.id })))
    if (page.size < PAGE_SIZE) return values
    cursor = page.docs.at(-1)
  }
}

export default function useBusinessReservations(range = null, { includeItems = true } = {}) {
  const { membership, currentUser } = useAuth()
  const businessId = membership?.businessId || ''
  const role = membership?.role || ''
  const uid = currentUser?.uid || ''
  const key = `${businessId}:${role}:${uid}`
  const [dashboardWindow] = useState(() => {
    const now = Date.now()
    return { start: Timestamp.fromMillis(now - 30 * DAY_MS), end: Timestamp.fromMillis(now + 366 * DAY_MS) }
  })
  const queryRange = range || dashboardWindow
  const rangeKey = `${queryRange.start.toMillis()}:${queryRange.end.toMillis()}`
  const [state, setState] = useState({})

  useEffect(() => {
    if (!businessId || !uid) return undefined
    const itemsKey = `${key}:${rangeKey}`
    const stops = [onSnapshot(doc(db, 'businesses', businessId), snap => {
      const value = snap.exists() ? { ...snap.data(), id: snap.id } : null
      setState(previous => ({ ...(previous.key === key ? previous : {}), key, business: value, businessError: !value ? 'Negocio no disponible.' : '' }))
    }, () => setState(previous => ({ ...(previous.key === key ? previous : {}), key, businessError: 'No se pudieron cargar los datos. Recarga la página.' })))]
    if (!includeItems) return () => stops.forEach(stop => stop())

    let active = true, inFlight = false
    const clauses = [where('businessId', '==', businessId),
      ...(role === 'professional' ? [where('professionalUserId', '==', uid)] : []),
      where('startAt', '>=', queryRange.start), where('startAt', '<', queryRange.end)]
    const source = query(collection(db, 'reservations'), ...clauses, orderBy('startAt', 'asc'))
    async function refresh() {
      if (!active || inFlight) return
      inFlight = true
      try {
        const items = await readPages(source)
        if (active) setState(previous => ({ ...(previous.key === key ? previous : {}), key, items, itemsKey, itemsError: '' }))
      } catch {
        if (active) setState(previous => ({ ...(previous.key === key ? previous : {}), key, itemsKey, itemsError: 'No se pudieron cargar los datos. Recarga la página.' }))
      } finally { inFlight = false }
    }
    refresh()
    const timer = setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); stops.forEach(stop => stop()) }
  }, [businessId, role, uid, key, includeItems, queryRange, rangeKey])

  const current = state.key === key ? state : {}
  const items = useReservationStates(includeItems && current.itemsKey === `${key}:${rangeKey}` ? current.items || [] : [])
  const missingScope = !businessId || !uid
  return { business: current.business, items, loading: !missingScope && (!('business' in current) || (includeItems && current.itemsKey !== `${key}:${rangeKey}`)), rangeFallback: false, error: missingScope ? 'Selecciona un negocio para consultar las reservas.' : current.businessError || (includeItems && current.itemsKey === `${key}:${rangeKey}` ? current.itemsError : '') || '' }
}
