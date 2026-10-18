import useReservationStates from './useReservationStates'
import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useAuth } from '../context/auth-context'
import { db } from '../firebase/config'

export default function useClientReservations() {
  const { membership, currentUser } = useAuth()
  const businessId = membership.businessId
  const uid = currentUser.uid
  const key = `${businessId}:${uid}`
  const [state, setState] = useState(null)
  useEffect(() => onSnapshot(query(collection(db, 'reservations'), where('businessId', '==', businessId), where('clientUserId', '==', uid)),
    snapshot => setState({ key, items: snapshot.docs.map(item => ({ ...item.data(), id: item.id })), error: '' }),
    () => setState({ key, items: [], error: 'No pudimos cargar tus reservas. Recarga la página para volver a intentarlo.' })), [businessId, uid, key])
  const items = useReservationStates(state?.key === key ? state.items : [])
  return state?.key === key ? { ...state, items, loading: false } : { items: [], error: '', loading: true }
}
