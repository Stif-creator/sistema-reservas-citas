import { confirmDiscard } from '../lib/unsavedForms'
import { useEffect, useState } from 'react'
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'
import { useFeedback } from '../context/feedback-context'

export default function SuperadminBusinesses() {
  const { isSuperadmin, userDoc, membership, selectBusiness } = useAuth()
  const { confirm } = useFeedback()
  const [businesses, setBusinesses] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!isSuperadmin) {
      let active = true
      Promise.all((userDoc?.businessIds || []).map(id => getDoc(doc(db, 'businesses', id)).then(d => d.exists() ? { ...d.data(), id: d.id } : null).catch(() => null))).then(rows => { if (active) setBusinesses(rows.filter(Boolean)) })
      return () => { active = false }
    }
    return onSnapshot(collection(db, 'businesses'), snapshot => {
      setBusinesses(snapshot.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)))
      setError('')
    }, () => setError('No se pudieron cargar los negocios.'))
  }, [isSuperadmin, userDoc?.businessIds])
  if (!isSuperadmin && businesses.length < 2) return null
  return <div className="p-3 rounded-lg bg-indigo-50 mb-4">
    <label className="block text-sm font-semibold" htmlFor="platform-business">{isSuperadmin ? 'Superadministrador · Negocio' : 'Seleccionar negocio'}</label>
    <select id="platform-business" className="w-full mt-2 rounded border p-2" value={membership.businessId || ''} onChange={async e => { const nextBusinessId = e.currentTarget.value; if (await confirmDiscard(document, confirm)) selectBusiness(nextBusinessId) }}>
      {!membership.businessId && <option value="">Selecciona un negocio</option>}
      {businesses.filter(b => b.status !== 'deleted' || b.id === membership.businessId).map(b => <option key={b.id} value={b.id}>{b.name || b.id}{b.status !== 'active' ? ' (inactivo)' : ''}</option>)}
    </select>
    {error && <p role="alert">{error}</p>}
  </div>
}
