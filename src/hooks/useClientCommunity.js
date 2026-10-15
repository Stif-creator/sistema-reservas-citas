import { useEffect, useRef, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { bookingRequest } from '../lib/bookingApi'

export default function useClientCommunity(businessId, userId) {
  const [favorites, setFavorites] = useState([])
  const [favoriteReady, setFavoriteReady] = useState(false)
  const [favoriteError, setFavoriteError] = useState('')
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const lock = useRef(false)
  const [data, setData] = useState({ professionals: [], reviews: [] })
  const [communityLoading, setLoading] = useState(true)
  const [communityError, setError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => onSnapshot(query(collection(db, 'favorites'), where('businessId', '==', businessId), where('userId', '==', userId)), snap => {
    setFavorites(snap.docs.map(d => ({ ...d.data(), id: d.id }))); setFavoriteReady(true); setFavoriteError('')
  }, () => { setFavoriteReady(false); setFavoriteError('No pudimos cargar tus favoritos. Recarga la página para reintentar.') }), [businessId, userId])
  useEffect(() => {
    let active = true, pending = false
    async function refresh() {
      if (pending) return
      pending = true
      try {
        const result = await bookingRequest({ action: 'options', businessId })
        if (active) { setData({ professionals: result.professionals || [], reviews: result.reviews || [] }); setError('') }
      } catch (error) { if (active) setError(error.message) }
      finally { pending = false; if (active) setLoading(false) }
    }
    refresh()
    const timer = setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [businessId, version])
  async function toggleFavorite(service) {
    if (lock.current || !favoriteReady) return
    lock.current = true; setFavoriteBusy(true); setFavoriteError('')
    const enabled = !favorites.some(f => f.kind === 'service' && f.targetId === service.id)
    try {
      await bookingRequest({ action: 'favorite', businessId, kind: 'service', targetId: service.id, enabled })
      setFavorites(previous => enabled ? [...previous.filter(f => f.kind !== 'service' || f.targetId !== service.id), { kind: 'service', targetId: service.id, name: service.name }]
        : previous.filter(f => f.kind !== 'service' || f.targetId !== service.id))
    } catch (error) { setFavoriteError(error.message) }
    finally { lock.current = false; setFavoriteBusy(false) }
  }
  return { ...data, favorites, favoriteReady, favoriteError, favoriteBusy, toggleFavorite, communityLoading, communityError, reloadCommunity: () => setVersion(v => v + 1) }
}
