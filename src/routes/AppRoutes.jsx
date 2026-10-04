import { Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import ProtectedRoute from '../components/ProtectedRoute'
import PanelLayout from '../components/PanelLayout'
import PublicLayout from '../components/public/PublicLayout'
import PublicHomeLayout from '../components/public/PublicHomeLayout'

const Home = lazy(() => import('../pages/Home'))
const Login = lazy(() => import('../pages/Login'))
const Register = lazy(() => import('../pages/Register'))
const Dashboard = lazy(() => import('../pages/Dashboard'))
const BusinessSettings = lazy(() => import('../pages/BusinessSettings'))
const Services = lazy(() => import('../pages/Services'))
const Professionals = lazy(() => import('../pages/Professionals'))
const ScheduleBlocks = lazy(() => import('../pages/ScheduleBlocks'))
const Users = lazy(() => import('../pages/Users'))
const Availability = lazy(() => import('../pages/Availability'))
const ClientLayout = lazy(() => import('../components/client/ClientLayout'))
const ClientAccountLayout = lazy(() => import('../components/client/ClientAccountLayout'))
const ClientHome = lazy(() => import('../pages/client/ClientHome'))
const ClientServices = lazy(() => import('../pages/client/ClientServices'))
const ClientServiceDetail = lazy(() => import('../pages/client/ClientServiceDetail'))
const ClientReservations = lazy(() => import('../pages/client/ClientReservations'))
const ClientReservationDetail = lazy(() => import('../pages/client/ClientReservationDetail'))
const ClientProfile = lazy(() => import('../pages/client/ClientProfile'))
const ClientBooking = lazy(() => import('../pages/client/ClientBooking'))
const Reservations = lazy(() => import('../pages/Reservations'))
const Agenda = lazy(() => import('../pages/Agenda'))

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
          <Route element={<PublicHomeLayout />}><Route path="/" element={<Home />} /></Route>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/registro" element={<Register />} />
          <Route path="/crear-negocio" element={<Register owner />} />
        </Route>
        <Route path="/b/:businessId" element={<PublicLayout />}>
          <Route element={<PublicHomeLayout />}><Route index element={<Home />} /></Route>
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

        <Route path="/cliente" element={<ProtectedRoute allowedRoles={['client']}><ClientLayout /></ProtectedRoute>}>
          <Route index element={<ClientHome />} />
          <Route path="servicios" element={<ClientServices />} />
          <Route path="servicios/:serviceId" element={<ClientServiceDetail />} />
          <Route path="reservar" element={<ClientBooking />} />
          <Route path="reserva-exitosa/:reservationId" element={<ClientBooking receipt />} />
          <Route path="reservas/:reservationId/reprogramar" element={<ClientBooking reschedule />} />
          <Route element={<ClientAccountLayout />}>
            <Route path="reservas" element={<ClientReservations />} />
            <Route path="reservas/:reservationId" element={<ClientReservationDetail />} />
            <Route path="perfil" element={<ClientProfile />} />
          </Route>
        </Route>

        {/* Los clientes usan su propio layout; las rutas internas mantienen
          además la autorización específica de administradores y profesionales. */}
        <Route
          element={
            <ProtectedRoute>
              <PanelLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/reservas" element={<ProtectedRoute allowedRoles={['admin', 'professional']}><Reservations /></ProtectedRoute>} />
          <Route path="/reservas/nueva" element={<ProtectedRoute allowedRoles={['admin']}><Reservations manual /></ProtectedRoute>} />
          <Route path="/reservas/:reservationId" element={<ProtectedRoute allowedRoles={['admin', 'professional']}><Reservations detail /></ProtectedRoute>} />
          <Route path="/agenda" element={<ProtectedRoute allowedRoles={['admin']}><Agenda /></ProtectedRoute>} />
          <Route path="/usuarios" element={<ProtectedRoute allowedRoles={['admin']}><Users /></ProtectedRoute>} />
          <Route path="/disponibilidad" element={<ProtectedRoute allowedRoles={['admin', 'professional']}><Availability /></ProtectedRoute>} />
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
