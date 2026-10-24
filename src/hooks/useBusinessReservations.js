import useReservationStates from './useReservationStates'
import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { useAuth } from '../context/auth-context'
import { db } from '../firebase/config'

export default function useBusinessReservations(range = null) {
  const { membership, currentUser } = useAuth()
  const businessId = membership.businessId
  const role = membership.role
  const uid = currentUser.uid
  const key = `${businessId}:${role}:${uid}`
  const rangeKey = range ? `${range.start}:${range.end}` : 'all'
  const [state, setState] = useState({})
  useEffect(() => {
    const clauses = [where('businessId', '==', businessId), ...(role === 'professional' ? [where('professionalUserId', '==', uid)] : [])]
    if (range) clauses.push(where('startAt', '>=', range.start), where('startAt', '<', range.end))
    const itemsKey = `${key}:${rangeKey}`
    const sources = { business: doc(db, 'businesses', businessId), items: query(collection(db, 'reservations'), ...clauses) }
    const stops = Object.entries(sources).map(([name, source]) => onSnapshot(source, snap => {
      const value = name === 'items' ? snap.docs.map(item => ({ ...item.data(), id: item.id })) : snap.exists() ? { ...snap.data(), id: snap.id } : null
      setState(previous => ({ ...(previous.key === key ? previous : {}), key, [name]: value, ...(name === 'items' ? { itemsKey } : {}), [`${name}Error`]: name === 'business' && !value ? 'Negocio no disponible.' : '' }))
    }, () => setState(previous => ({ ...(previous.key === key ? previous : {}), key, ...(name === 'items' ? { itemsKey } : {}), [`${name}Error`]: 'No se pudieron cargar los datos. Recarga la página.' }))))
    return () => stops.forEach(stop => stop())
  }, [businessId, role, uid, key, range, rangeKey, range?.start, range?.end])
  const current = state.key === key ? state : {}
  const items = useReservationStates(current.itemsKey === `${key}:${rangeKey}` ? current.items || [] : [])
  return { business: current.business, items, loading: !('business' in current && current.itemsKey === `${key}:${rangeKey}`), error: current.businessError || (current.itemsKey === `${key}:${rangeKey}` ? current.itemsError : '') || '' }
}
