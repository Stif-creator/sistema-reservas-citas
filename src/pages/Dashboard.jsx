import ProfessionalDashboard from '../components/ProfessionalDashboard'
import BusinessStats from '../components/BusinessStats'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'
import useSprintData from '../hooks/useSprintData'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import { ArrowRight, Building2, Settings, ShieldCheck, Users } from 'lucide-react'

function Dashboard() {
  const { userDoc, membership, isSuperadmin } = useAuth()
  const [business, setBusiness] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function fetchBusiness() {
      if (!membership?.businessId) return
      try {
        const snap = await getDoc(doc(db, 'businesses', membership.businessId))
        if (active) {
          setBusiness(snap.exists() ? snap.data() : null)
          setError(snap.exists() ? '' : 'El negocio no está disponible.')
        }
      } catch {
        if (active) setError('No se pudo cargar el negocio. Recarga la página para reintentar.')
      }
    }
    fetchBusiness()
    return () => {
      active = false
    }
  }, [membership])

  if (!userDoc) {
    return <p className="text-sm text-muted">Cargando datos del usuario...</p>
  }

  if (isSuperadmin && !membership?.businessId) return <PlatformDashboard userDoc={userDoc} />

  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 text-error">
          {error}
        </p>
      )}
      <PageHeader
        title={`Hola, ${userDoc.firstName}`}
        description={membership?.role === 'professional' ? 'Tu próxima cita, tu agenda y tus reservas en un solo lugar.' : 'Este es el resumen de tu cuenta y tu negocio.'}
      />

      <div hidden={membership?.role === 'professional'} className="dashboard-account grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-primary">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Usuario</p>
              <p className="text-sm font-semibold text-ink">
                {userDoc.firstName} {userDoc.lastName}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-primary">
              <Settings size={20} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Rol</p>
              <p className="text-sm font-semibold capitalize text-ink">
                {membership?.role ?? 'Sin rol asignado'}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-primary">
              <Building2 size={20} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Negocio</p>
              <p className="text-sm font-semibold text-ink">{business?.name ?? 'Cargando...'}</p>
            </div>
          </div>
        </Card>
      </div>

      {membership?.role === 'professional' && <ProfessionalDashboard />}
      {membership?.role === 'admin' && <BusinessStats />}
      {membership?.role === 'admin' && (
        <p className="mt-6 text-sm text-muted">
          <Link to="/negocio" className="font-medium text-primary hover:text-primary-hover">
            Ir a Configuración del negocio →
          </Link>
        </p>
      )}
    </div>
  )
}

function PlatformDashboard({ userDoc }) {
  const { data, error } = useSprintData('clients')
  return <div>
    <PageHeader title={`Hola, ${userDoc.firstName || 'superadministrador'}`} description="Resumen general de la plataforma CitasPro." />
    {error && <p role="alert" className="mb-4 text-error">{error}</p>}
    {!error && !data && <p role="status">Cargando resumen de la plataforma…</p>}
    {data?.summaryOnly && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-primary"><Building2 size={20} /></span><div><p className="text-xs font-medium uppercase tracking-wide text-muted">Negocios registrados</p><p className="text-2xl font-semibold text-ink">{Number.isFinite(data.totalBusinesses) ? data.totalBusinesses : 0}</p></div></div></Card>
      <Card><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-primary"><Users size={20} /></span><div><p className="text-xs font-medium uppercase tracking-wide text-muted">Clientes registrados</p><p className="text-2xl font-semibold text-ink">{Number.isFinite(data.totalClients) ? data.totalClients : 0}</p></div></div></Card>
    </div>}
    {data && !data.summaryOnly && <p role="status" className="text-sm text-muted">Selecciona un negocio en el menú para consultar su actividad.</p>}
    <Link className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-hover" to="/plataforma/negocios">Gestionar negocios <ArrowRight size={16} /></Link>
  </div>
}

export default Dashboard
