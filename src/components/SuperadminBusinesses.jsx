import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'

export default function SuperadminBusinesses() {
  const { isSuperadmin, membership, selectBusiness } = useAuth()
  const [businesses, setBusinesses] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!isSuperadmin) return
    return onSnapshot(collection(db, 'businesses'), snapshot => {
      setBusinesses(snapshot.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)))
      setError('')
    }, () => setError('No se pudieron cargar los negocios.'))
  }, [isSuperadmin])
  if (!isSuperadmin) return null
  return <div className="p-3 rounded-lg bg-indigo-50 mb-4">
    <label className="block text-sm font-semibold" htmlFor="platform-business">Superadministrador · Negocio</label>
    <select id="platform-business" className="w-full mt-2 rounded border p-2" value={membership.businessId || ''} onChange={e => selectBusiness(e.target.value)}>
      {!membership.businessId && <option value="">Selecciona un negocio</option>}
      {businesses.map(b => <option key={b.id} value={b.id}>{b.name || b.id}{b.status !== 'active' ? ' (inactivo)' : ''}</option>)}
    </select>
    {error && <p role="alert">{error}</p>}
  </div>
}
