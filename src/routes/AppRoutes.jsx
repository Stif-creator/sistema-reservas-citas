import { Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import ProtectedRoute from '../components/ProtectedRoute'
import AdminLayout from '../components/AdminLayout'
import PublicLayout from '../components/public/PublicLayout'

const Home = lazy(() => import('../pages/Home'))
const Login = lazy(() => import('../pages/Login'))
const Register = lazy(() => import('../pages/Register'))
const Dashboard = lazy(() => import('../pages/Dashboard'))
const BusinessSettings = lazy(() => import('../pages/BusinessSettings'))
const Services = lazy(() => import('../pages/Services'))
const Professionals = lazy(() => import('../pages/Professionals'))
const ScheduleBlocks = lazy(() => import('../pages/ScheduleBlocks'))

function AppRoutes() {
  return (
    <Suspense
      fallback={
        <p className="p-8 text-sm text-muted" role="status">
          Cargando página…
        </p>
      }
    >
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/registro" element={<Register />} />
          <Route path="/crear-negocio" element={<Register owner />} />
        </Route>
        <Route path="/b/:businessId" element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="login" element={<Login />} />
          <Route path="registro" element={<Register />} />
        </Route>
        <Route
          path="*"
          element={
            <div className="p-10">
              <h1>Página no encontrada</h1>
              <a href="/">Volver al inicio</a>
            </div>
          }
        />

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
          <Route
            path="/bloqueos"
            element={
              <ProtectedRoute allowedRoles={['admin', 'professional']}>
                <ScheduleBlocks />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default AppRoutes
