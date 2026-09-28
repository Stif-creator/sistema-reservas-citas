import { useEffect, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { profileQuery } from '../lib/profiles'

export default function useProfessionalProfile(businessId, userId, enabled) {
  const [state, setState] = useState(null)
  const key = `${businessId}_${userId}`
  useEffect(() => {
    if (!enabled || !businessId || !userId) return
    return onSnapshot(profileQuery(db, 'professionals', businessId, userId), (snapshot) => {
      const item = snapshot.docs[0]
      setState({ key, profile: snapshot.size === 1 ? { ...item.data(), id: item.id } : null,
        error: snapshot.size !== 1 ? 'No se pudo identificar tu perfil profesional. Contacta al administrador.' : '' })
    }, () => setState({ key, profile: null, error: 'No se pudo cargar tu perfil profesional. Recarga la página.' }))
  }, [businessId, userId, enabled, key])
  if (!enabled) return { profile: null, loading: false, error: '' }
  return state?.key === key ? { ...state, loading: false } : { profile: null, loading: true, error: '' }
}
