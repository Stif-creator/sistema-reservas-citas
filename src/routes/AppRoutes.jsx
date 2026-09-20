import { Routes, Route } from 'react-router-dom'
import Home from '../pages/Home'
import Login from '../pages/Login'
import Register from '../pages/Register'
import Dashboard from '../pages/Dashboard'
import BusinessSettings from '../pages/BusinessSettings'
import Services from '../pages/Services'
import Professionals from '../pages/Professionals'
import ProtectedRoute from '../components/ProtectedRoute'
import AdminLayout from '../components/AdminLayout'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Layout compartido (sidebar + header) para cualquier usuario
          autenticado. El layout en sí no restringe rol: cada página
          exclusiva de administrador sigue envuelta en su propio
          ProtectedRoute con allowedRoles, exactamente como antes, solo
          que ahora anidado dentro del layout en vez de reemplazarlo. */}
      <Route
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route
          path="/negocio"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <BusinessSettings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/servicios"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Services />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profesionales"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Professionals />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  )
}

export default AppRoutes
