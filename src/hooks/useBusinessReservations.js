import useReservationStates from './useReservationStates'
import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { useAuth } from '../context/auth-context'
import { db } from '../firebase/config'

export default function useBusinessReservations(range = null) {
  const { membership, currentUser } = useAuth()
  const businessId = membership?.businessId || ''
  const role = membership?.role || ''
  const uid = currentUser?.uid || ''
  const key = `${businessId}:${role}:${uid}`
  const rangeKey = range ? `${range.start}:${range.end}` : 'all'
  const [state, setState] = useState({})
  useEffect(() => {
    if (!businessId || !uid) return undefined
    const clauses = [where('businessId', '==', businessId), ...(role === 'professional' ? [where('professionalUserId', '==', uid)] : [])]
    const itemsKey = `${key}:${rangeKey}`
    const reservations = collection(db, 'reservations')
    const scopedQuery = query(reservations, ...clauses)
    const rangeQuery = range ? query(reservations, ...clauses, where('startAt', '>=', range.start), where('startAt', '<', range.end)) : scopedQuery
    const stops = []
    const receive = (snap, fallback = false) => {
      let value = snap.docs.map(item => ({ ...item.data(), id: item.id }))
      if (fallback && range) {
        const start = range.start.toMillis()
        const end = range.end.toMillis()
        value = value.filter(item => {
          const millis = item.startAt?.toMillis?.() ?? Date.parse(item.startAt)
          return Number.isFinite(millis) && millis >= start && millis < end
        })
      }
      setState(previous => ({ ...(previous.key === key ? previous : {}), key, items: value, itemsKey, itemsFallback: fallback, itemsError: '' }))
    }
    stops.push(onSnapshot(doc(db, 'businesses', businessId), snap => {
      const value = snap.exists() ? { ...snap.data(), id: snap.id } : null
      setState(previous => ({ ...(previous.key === key ? previous : {}), key, business: value, businessError: !value ? 'Negocio no disponible.' : '' }))
    }, () => setState(previous => ({ ...(previous.key === key ? previous : {}), key, businessError: 'No se pudieron cargar los datos. Recarga la página.' }))))
    let fallbackStarted = false
    stops.push(onSnapshot(rangeQuery, snap => receive(snap), error => {
      const missingIndex = error?.code === 'failed-precondition' && /index/i.test(error.message || '')
      if (range && missingIndex && !fallbackStarted) {
        fallbackStarted = true
        stops.push(onSnapshot(scopedQuery, snap => receive(snap, true), () => setState(previous => ({ ...(previous.key === key ? previous : {}), key, itemsKey, itemsError: 'No se pudieron cargar los datos. Recarga la página.' }))))
        return
      }
      setState(previous => ({ ...(previous.key === key ? previous : {}), key, itemsKey, itemsError: 'No se pudieron cargar los datos. Recarga la página.' }))
    }))
    return () => stops.forEach(stop => stop())
  }, [businessId, role, uid, key, range, rangeKey, range?.start, range?.end])
  const current = state.key === key ? state : {}
  const items = useReservationStates(current.itemsKey === `${key}:${rangeKey}` ? current.items || [] : [])
  const missingScope = !businessId || !uid
  return { business: current.business, items, loading: !missingScope && !('business' in current && current.itemsKey === `${key}:${rangeKey}`), rangeFallback: current.itemsKey === `${key}:${rangeKey}` && current.itemsFallback === true, error: missingScope ? 'Selecciona un negocio para consultar las reservas.' : current.businessError || (current.itemsKey === `${key}:${rangeKey}` ? current.itemsError : '') || '' }
}
