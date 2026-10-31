import ProfessionalDashboard from '../components/ProfessionalDashboard'
import BusinessStats from '../components/BusinessStats'
import { useAuth } from '../context/auth-context'
import PlatformDashboard from './PlatformDashboard'
import PageHeader from '../components/ui/PageHeader'

function Dashboard() {
  const { userDoc, membership, isSuperadmin } = useAuth()
  if (!userDoc) return <p className="text-sm text-muted">Cargando datos del usuario...</p>
  if (isSuperadmin) return <PlatformDashboard />
  if (membership?.role === 'admin') return <BusinessStats userDoc={userDoc} />

  return <div><PageHeader title={`Hola, ${userDoc.firstName}`} description="Tu próxima cita, tu agenda y tus reservas en un solo lugar." /><ProfessionalDashboard /></div>
}

export default Dashboard
