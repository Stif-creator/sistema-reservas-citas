import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { useAuth } from '../context/auth-context'
import { db } from '../firebase/config'
import useReservationStates from './useReservationStates'

export default function useAgendaReservations({ businessId, range, professionalId = '' }) {
  const { membership, currentUser } = useAuth()
  const role = membership?.role || ''
  const uid = currentUser?.uid || ''
  const key = [businessId, role, uid, range?.startMs, range?.endMs, professionalId].join(':')
  const [state, setState] = useState({ key: '', docs: [], error: '' })

  useEffect(() => {
    if (!businessId || !uid || !range) return undefined
    const clauses = [
      where('businessId', '==', businessId),
      ...(role === 'professional' ? [where('professionalUserId', '==', uid)] : []),
      ...(role === 'admin' && professionalId ? [where('professionalId', '==', professionalId)] : []),
      where('startAt', '>=', Timestamp.fromMillis(range.startMs)),
      where('startAt', '<', Timestamp.fromMillis(range.endMs)),
    ]
    let active = true
    const stop = onSnapshot(query(collection(db, 'reservations'), ...clauses, orderBy('startAt', 'asc')), snapshot => {
      if (active) setState({ key, docs: snapshot.docs.map(item => ({ ...item.data(), id: item.id })), error: '' })
    }, () => {
      if (active) setState({ key, docs: [], error: 'No se pudieron cargar las citas de este período.' })
    })
    return () => { active = false; stop() }
  }, [businessId, role, uid, range, range?.startMs, range?.endMs, professionalId, key])

  const rawItems = state.key === key ? state.docs : []
  const items = useReservationStates(rawItems)
  return useMemo(() => ({
    items,
    loading: Boolean(businessId && uid && range && state.key !== key),
    error: state.key === key ? state.error : '',
  }), [items, businessId, uid, range, state.key, state.error, key])
}
