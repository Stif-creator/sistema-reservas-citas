import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import useBusinessReservations from '../hooks/useBusinessReservations'
import { dateMillis, formatAppointmentDate, reservationStatuses } from '../lib/clientPresentation'
import { dayKey } from '../lib/calendarDates'
import Card from './ui/Card'
import Alert from './ui/Alert'
import DataList from './ui/DataList'

export default function ProfessionalDashboard() {
  const { items, business, loading, error } = useBusinessReservations()
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [])
  if (error) return <Alert tone="error">{error}</Alert>
  if (loading) return <p role="status">Cargando tus citas…</p>
  const zone = business?.settings?.timezone || 'America/La_Paz'
  const active = items.filter(r => ['pending', 'confirmed'].includes(r.status))
  const upcoming = active.filter(r => dateMillis(r.endAt || r.startAt) > now).sort((a,b) => dateMillis(a.startAt)-dateMillis(b.startAt))
  return <section className="space-y-5 mt-6"><div className="grid sm:grid-cols-3 gap-4">
    {[['Mis citas de hoy', active.filter(r => dayKey(dateMillis(r.startAt), zone) === dayKey(now, zone)).length], ['Próximas citas', upcoming.length], ['Pendientes de confirmar', upcoming.filter(r => r.status === 'pending').length]].map(([label, value]) => <Card key={label} title={label}><strong className="text-3xl text-primary">{value}</strong></Card>)}
  </div><div className="flex gap-4"><Link className="text-primary" to="/agenda">Mi agenda</Link><Link className="text-primary" to="/reservas">Todas mis reservas</Link><Link className="text-primary" to="/disponibilidad">Mis horarios</Link></div>
    <Card title="Mis próximas reservas"><DataList label="Mis próximas reservas" items={upcoming} searchText={r => `${r.clientName} ${r.serviceName} ${reservationStatuses[r.status]}`}>
      {rows => <div className="space-y-3">{rows.map(r => <Link className="block rounded-xl border p-4 hover:bg-indigo-50" key={r.id} to={`/reservas/${encodeURIComponent(r.id)}`}><strong>{r.clientName} · {r.serviceName}</strong><p>{formatAppointmentDate(r.startAt, zone)} · {formatAppointmentDate(r.startAt, zone, true)} · {reservationStatuses[r.status]}</p></Link>)}</div>}
    </DataList></Card><p className="text-sm text-muted">Solo aparecen las reservas que tienes asignadas. Desde el detalle puedes gestionar sus estados según los permisos del profesional.</p>
  </section>
}
