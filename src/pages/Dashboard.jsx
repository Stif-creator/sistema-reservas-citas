import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import { Building2, Settings, ShieldCheck } from 'lucide-react'

function Dashboard() {
  const { userDoc, membership } = useAuth()
  const [business, setBusiness] = useState(null)

  useEffect(() => {
    async function fetchBusiness() {
      if (!membership?.businessId) return
      const snap = await getDoc(doc(db, 'businesses', membership.businessId))
      setBusiness(snap.exists() ? snap.data() : null)
    }
    fetchBusiness()
  }, [membership])

  if (!userDoc) {
    return <p className="text-sm text-muted">Cargando datos del usuario...</p>
  }

  return (
    <div>
      <PageHeader
        title={`Hola, ${userDoc.firstName}`}
        description="Este es el resumen de tu cuenta y tu negocio."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

export default Dashboard
