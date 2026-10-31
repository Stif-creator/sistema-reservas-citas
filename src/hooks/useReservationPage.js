import { useEffect, useMemo, useState } from 'react'
import { collection, getCountFromServer, limit, onSnapshot, orderBy, query, startAfter, Timestamp, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'
import useReservationStates from './useReservationStates'

const PAGE_SIZE = 20
const derivedStatuses = new Set(['pending', 'confirmed', 'expired', 'awaiting_closure', 'in_progress'])

function queryParts({ businessId, role, uid, range, status, serviceId, professionalId, closuresOnly, now }) {
  const clauses = [where('businessId', '==', businessId)]
  if (role === 'professional') clauses.push(where('professionalUserId', '==', uid))
  if (range?.start) clauses.push(where('startAt', '>=', range.start))
  if (range?.end) clauses.push(where('startAt', '<', range.end))
  if (serviceId) clauses.push(where('serviceId', '==', serviceId))
  if (professionalId && role === 'admin') clauses.push(where('professionalId', '==', professionalId))
  const nowValue = Timestamp.fromMillis(now)
  const ensureStartAtRange = () => { if (!range?.start) clauses.push(where('startAt', '>=', Timestamp.fromMillis(0))) }
  if (closuresOnly) {
    if (!status) { clauses.push(where('status', 'in', ['pending', 'confirmed'])); ensureStartAtRange(); clauses.push(where('endAt', '<=', nowValue)) }
    else if (status === 'expired') { clauses.push(where('status', '==', 'pending')); ensureStartAtRange(); clauses.push(where('endAt', '<=', nowValue)) }
    else if (status === 'awaiting_closure') { clauses.push(where('status', '==', 'confirmed')); ensureStartAtRange(); clauses.push(where('endAt', '<=', nowValue)) }
    else return { clauses: [], impossible: true }
  } else if (status === 'pending') { clauses.push(where('status', '==', 'pending')); ensureStartAtRange(); clauses.push(where('endAt', '>', nowValue)) }
  else if (status === 'confirmed') clauses.push(where('status', '==', 'confirmed'), where('startAt', '>', nowValue))
  else if (status === 'expired') { clauses.push(where('status', '==', 'pending')); ensureStartAtRange(); clauses.push(where('endAt', '<=', nowValue)) }
  else if (status === 'awaiting_closure') { clauses.push(where('status', '==', 'confirmed')); ensureStartAtRange(); clauses.push(where('endAt', '<=', nowValue)) }
  else if (status === 'in_progress') clauses.push(where('status', '==', 'confirmed'), where('startAt', '<=', nowValue), where('endAt', '>', nowValue))
  else if (status) clauses.push(where('status', '==', status))
  return { clauses, impossible: false }
}

const valueKey = value => value?.toMillis?.() ?? ''

export function useReservationCounts({ enabled = true } = {}) {
  const { membership, currentUser } = useAuth()
  const businessId = membership?.businessId || '', role = membership?.role || '', uid = currentUser?.uid || ''
  const key = `${businessId}:${role}:${uid}`
  const [state, setState] = useState({ key: '', values: null, error: '' })
  useEffect(() => {
    if (!enabled || !businessId || !uid) return undefined
    let active = true
    const base = [where('businessId', '==', businessId), ...(role === 'professional' ? [where('professionalUserId', '==', uid)] : [])]
    const count = clauses => getCountFromServer(query(collection(db, 'reservations'), ...clauses)).then(result => result.data().count)
    Promise.all([
      count(base), count([...base, where('status', '==', 'confirmed')]), count([...base, where('status', '==', 'completed')]),
      count([...base, where('status', '==', 'cancelled')]), count([...base, where('status', '==', 'no_show')]),
    ]).then(([total, confirmed, completed, cancelled, noShow]) => {
      if (active) setState({ key, values: { total, confirmed, completed, cancelled, noShow }, error: '' })
    }).catch(() => { if (active) setState({ key, values: null, error: 'No se pudieron consultar los totales de reservas.' }) })
    return () => { active = false }
  }, [enabled, businessId, role, uid, key])
  return { ...state, values: state.key === key ? state.values : null, loading: enabled && state.key !== key }
}

export default function useReservationPage({ enabled = true, range, status, serviceId, professionalId, sort, closuresOnly, cursor, now, pageSize = PAGE_SIZE }) {
  const { membership, currentUser } = useAuth()
  const businessId = membership?.businessId || '', role = membership?.role || '', uid = currentUser?.uid || ''
  const nowSensitive = closuresOnly || derivedStatuses.has(status)
  const filterNow = nowSensitive ? now : 0
  const filterKey = [businessId, role, uid, valueKey(range?.start), valueKey(range?.end), status, serviceId, professionalId, sort, closuresOnly, filterNow].join(':')
  const countKey = [businessId, role, uid, valueKey(range?.start), valueKey(range?.end), status, serviceId, professionalId, closuresOnly, filterNow].join(':')
  const pageKey = `${filterKey}:${cursor?.id || 'first'}`
  const [pageState, setPageState] = useState({ key: '', docs: [], nextCursor: null, hasNext: false, error: '' })
  const [countState, setCountState] = useState({ key: '', value: null, error: '' })
  const parts = useMemo(() => queryParts({ businessId, role, uid, range, status, serviceId, professionalId, closuresOnly, now: filterNow }), [businessId, role, uid, range, status, serviceId, professionalId, closuresOnly, filterNow])

  useEffect(() => {
    if (!enabled || !businessId || !uid) return undefined
    let active = true
    if (parts.impossible) return undefined
    getCountFromServer(query(collection(db, 'reservations'), ...parts.clauses)).then(result => {
      if (active) setCountState({ key: countKey, value: result.data().count, error: '' })
    }).catch(() => { if (active) setCountState({ key: countKey, value: null, error: 'No se pudo calcular el total para estos filtros.' }) })
    return () => { active = false }
  }, [enabled, businessId, uid, countKey, parts])

  useEffect(() => {
    if (!enabled || !businessId || !uid) return undefined
    let active = true
    if (parts.impossible) return undefined
    const temporalStatus = closuresOnly || ['pending', 'expired', 'awaiting_closure', 'in_progress'].includes(status)
    const constraints = [...parts.clauses, orderBy('startAt', sort === 'recent' ? 'desc' : 'asc'), ...(temporalStatus ? [orderBy('endAt', 'asc')] : []), ...(cursor ? [startAfter(cursor)] : []), limit(pageSize + 1)]
    const stop = onSnapshot(query(collection(db, 'reservations'), ...constraints), snapshot => {
      if (!active) return
      const visibleDocs = snapshot.docs.slice(0, pageSize)
      setPageState({ key: pageKey, docs: visibleDocs.map(document => ({ ...document.data(), id: document.id })), nextCursor: snapshot.docs.length > pageSize ? visibleDocs.at(-1) : null, hasNext: snapshot.docs.length > pageSize, error: '' })
    }, () => { if (active) setPageState({ key: pageKey, docs: [], nextCursor: null, hasNext: false, error: 'No se pudo cargar esta página de reservas.' }) })
    return () => { active = false; stop() }
  }, [enabled, businessId, uid, pageKey, parts, sort, cursor, pageSize, status, closuresOnly])

  const rawItems = pageState.key === pageKey ? pageState.docs : []
  const items = useReservationStates(rawItems)
  const impossible = parts.impossible === true
  return {
    items: impossible ? [] : items,
    loading: !impossible && enabled && Boolean(businessId && uid) && pageState.key !== pageKey,
    error: impossible ? '' : pageState.key === pageKey ? pageState.error : '',
    hasNext: !impossible && pageState.key === pageKey && pageState.hasNext,
    nextCursor: !impossible && pageState.key === pageKey ? pageState.nextCursor : null,
    totalFiltered: impossible ? 0 : countState.key === countKey ? countState.value : null,
    countLoading: !impossible && enabled && Boolean(businessId && uid) && countState.key !== countKey,
    countError: impossible ? '' : countState.key === countKey ? countState.error : '',
    pageSize,
  }
}
