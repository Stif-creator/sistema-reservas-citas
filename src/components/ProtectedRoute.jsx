import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function ProtectedRoute({ children, allowedRoles }) {
  const { currentUser, userDoc, membership, loading, authError, reloadProfile, logout } = useAuth()

  if (loading) {
    return <p>Cargando...</p>
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />
  }

  if (
    authError ||
    !userDoc ||
    !membership ||
    userDoc.status !== 'active' ||
    membership.status !== 'active'
  ) {
    const message =
      authError ||
      (membership?.status === 'pending'
        ? 'Tu solicitud está pendiente de aprobación por el administrador del negocio.'
        : 'Tu cuenta o membresía no está activa. Contacta al administrador del negocio.')
    return (
      <main className="mx-auto max-w-lg space-y-5 p-8">
        <h1 className="text-xl font-semibold">Estado de tu cuenta</h1>
        <p role="alert">{message}</p>
        <div className="flex gap-5">
          <button onClick={reloadProfile} className="text-primary underline">
            Volver a comprobar
          </button>
          <button onClick={() => logout().catch(() => {})} className="text-primary underline">
            Cerrar sesión
          </button>
        </div>
      </main>
    )
  }

  if (allowedRoles && !allowedRoles.includes(membership?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

export default ProtectedRoute
