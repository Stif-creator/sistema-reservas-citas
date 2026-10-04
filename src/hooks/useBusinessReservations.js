import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { useAuth } from '../context/auth-context'
import { db } from '../firebase/config'

export default function useBusinessReservations() {
  const { membership, currentUser } = useAuth()
  const businessId = membership.businessId
  const role = membership.role
  const uid = currentUser.uid
  const key = `${businessId}:${role}:${uid}`
  const [state, setState] = useState({})
  useEffect(() => {
    const sources = { business: doc(db, 'businesses', businessId),
      items: query(collection(db, 'reservations'), where('businessId', '==', businessId), ...(role === 'professional' ? [where('professionalUserId', '==', uid)] : [])) }
    const stops = Object.entries(sources).map(([name, source]) => onSnapshot(source, snap => {
      const value = name === 'items' ? snap.docs.map(item => ({ ...item.data(), id: item.id })) : snap.exists() ? { ...snap.data(), id: snap.id } : null
      setState(previous => ({ ...(previous.key === key ? previous : {}), key, [name]: value, [`${name}Error`]: name === 'business' && !value ? 'Negocio no disponible.' : '' }))
    }, () => setState(previous => ({ ...(previous.key === key ? previous : {}), key, [`${name}Error`]: 'No se pudieron cargar los datos. Recarga la página.' }))))
    return () => stops.forEach(stop => stop())
  }, [businessId, role, uid, key])
  const current = state.key === key ? state : {}
  return { business: current.business, items: current.items || [], loading: !('business' in current && 'items' in current), error: current.businessError || current.itemsError || '' }
}
