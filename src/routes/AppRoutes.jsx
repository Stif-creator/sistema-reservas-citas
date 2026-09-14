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
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      {/* Rutas exclusivas de administrador: comparten un mismo
          ProtectedRoute + AdminLayout (ruta padre sin path propio, solo
          reparte <Outlet/>). Cada fase nueva solo agrega un <Route>
          hijo aquí, sin duplicar el wrapper. */}
      <Route
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/negocio" element={<BusinessSettings />} />
        <Route path="/servicios" element={<Services />} />
        <Route path="/profesionales" element={<Professionals />} />
      </Route>
    </Routes>
  )
}

export default AppRoutes
