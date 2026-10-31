import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'
import { reservationDisplayStatus } from '../lib/clientPresentation'

export default function useReservationById(reservationId) {
  const { membership, currentUser } = useAuth()
  const businessId = membership?.businessId || '', role = membership?.role || '', uid = currentUser?.uid || ''
  const key = `${businessId}:${role}:${uid}:${reservationId || ''}`
  const [state, setState] = useState({ key: '', item: null, loading: false, error: '' })
  useEffect(() => {
    if (!businessId || !uid || !reservationId) return undefined
    let active = true
    getDoc(doc(db, 'reservations', reservationId)).then(snapshot => {
      if (!active) return
      if (!snapshot.exists()) { setState({ key, item: null, loading: false, error: 'Reserva no disponible.' }); return }
      const value = { ...snapshot.data(), id: snapshot.id }
      if (value.businessId !== businessId || (role === 'professional' && value.professionalUserId !== uid)) {
        setState({ key, item: null, loading: false, error: 'Reserva no disponible.' }); return
      }
      setState({ key, item: { ...value, displayStatus: reservationDisplayStatus(value) }, loading: false, error: '' })
    }).catch(() => { if (active) setState({ key, item: null, loading: false, error: 'Reserva no disponible.' }) })
    return () => { active = false }
  }, [businessId, role, uid, reservationId, key])
  const current = state.key === key ? state : {}
  return { item: current.item || null, loading: Boolean(reservationId) && (current.loading ?? true), error: current.error || '' }
}
