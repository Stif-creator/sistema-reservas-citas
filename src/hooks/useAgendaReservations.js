import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, limit, orderBy, query, startAfter, Timestamp, where } from 'firebase/firestore'
import { useAuth } from '../context/auth-context'
import { db } from '../firebase/config'
import useReservationStates from './useReservationStates'

const PAGE_SIZE = 500

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
      where('endAt', '>', Timestamp.fromMillis(range.startMs - 86400000)),
      where('startAt', '<', Timestamp.fromMillis(range.endMs + 86400000)),
    ]
    let active = true
    readPages(query(collection(db, 'reservations'), ...clauses, orderBy('endAt', 'asc'))).then(docs => {
      if (active) setState({ key, docs, error: '' })
    }).catch(() => {
      if (active) setState({ key, docs: [], error: 'No se pudieron cargar las citas de este período.' })
    })
    return () => { active = false }
  }, [businessId, role, uid, range, range?.startMs, range?.endMs, professionalId, key])

  const rawItems = state.key === key ? state.docs : []
  const items = useReservationStates(rawItems)
  return useMemo(() => ({
    items,
    loading: Boolean(businessId && uid && range && state.key !== key),
    error: state.key === key ? state.error : '',
  }), [items, businessId, uid, range, state.key, state.error, key])
}
