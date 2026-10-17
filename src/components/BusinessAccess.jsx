import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'
import Alert from './ui/Alert'

export default function BusinessAccess({ children }) {
  const { membership, isSuperadmin } = useAuth()
  const [state, setState] = useState(null)
  const id = membership.businessId
  useEffect(() => {
    if (isSuperadmin) return
    return onSnapshot(doc(db, 'businesses', id), snapshot => setState({ id, active: snapshot.data()?.status === 'active' }), () => setState({ id, active: false }))
  }, [id, isSuperadmin])
  if (isSuperadmin) return children
  if (state?.id !== id) return <p role="status">Comprobando negocio…</p>
  if (!state.active) return <Alert tone="error">Este negocio está desactivado, archivado o no está disponible. Contacta al superadministrador o selecciona otro negocio en el menú.</Alert>
  return children
}
