import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'

function Dashboard() {
  const { userDoc, membership, logout } = useAuth()
  const navigate = useNavigate()
  const [business, setBusiness] = useState(null)

  useEffect(() => {
    async function fetchBusiness() {
      if (!membership?.businessId) return
      const snap = await getDoc(doc(db, 'businesses', membership.businessId))
      setBusiness(snap.exists() ? snap.data() : null)
    }
    fetchBusiness()
  }, [membership])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  if (!userDoc) {
    return <p>Cargando datos del usuario...</p>
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <p>
        Nombre: {userDoc.firstName} {userDoc.lastName}
      </p>
      <p>Rol: {membership?.role ?? 'Sin rol asignado'}</p>
      <p>Negocio: {business?.name ?? 'Cargando...'}</p>
      {membership?.role === 'admin' && (
        <p>
          <Link to="/negocio">Configuración del negocio</Link>
        </p>
      )}
      <button type="button" onClick={handleLogout}>
        Cerrar sesión
      </button>
    </div>
  )
}

export default Dashboard
