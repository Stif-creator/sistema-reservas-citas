import PendingWork from './PendingWork'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { CalendarDays, Clock, CalendarCheck, ArrowRight, UserRound } from 'lucide-react'
import useBusinessReservations from '../hooks/useBusinessReservations'
import { dateMillis, formatAppointmentDate, reservationStatuses } from '../lib/clientPresentation'
import { dayKey } from '../lib/calendarDates'
import { countdown } from '../lib/countdown'
import Card from './ui/Card'
import Alert from './ui/Alert'
import DataList from './ui/DataList'
import AdminSummary from './ui/AdminSummary'
import Badge from './ui/Badge'

export default function ProfessionalDashboard() {
  const { items, business, loading, error } = useBusinessReservations()
  const [now, setNow] = useState(Date.now)
  const [selected, setSelected] = useState(null)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [])
  if (error) return <Alert tone="error">{error}</Alert>
  if (loading) return <p role="status">Cargando tus citas...</p>
  const zone = business?.settings?.timezone || 'America/La_Paz'
  const active = items.filter(r => ['pending', 'confirmed'].includes(r.status))
  const upcoming = active.filter(r => dateMillis(r.endAt || r.startAt) > now).sort((a,b) => dateMillis(a.startAt)-dateMillis(b.startAt))
  const next = upcoming[0]
  const detail = upcoming.find(r => r.id === selected) || next
  return <section className="space-y-6 mt-6"><PendingWork items={items} />
    <AdminSummary items={[
      {label:'Mis citas de hoy',value:active.filter(r => dayKey(dateMillis(r.startAt), zone) === dayKey(now, zone)).length,icon:CalendarDays},
      {label:'Próximas citas',value:upcoming.length,icon:CalendarCheck,tone:'blue'},
      {label:'Pendientes de confirmar',value:upcoming.filter(r => r.status === 'pending').length,icon:Clock,tone:'green'},
    ]} />
    {next && <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-white p-6 flex flex-wrap items-center justify-between gap-5"><div><p className="text-sm font-semibold text-primary mb-2">Tu próxima cita</p><strong className="text-3xl">{formatAppointmentDate(next.startAt,zone,true)}</strong><p className="text-sm text-muted mt-2">{formatAppointmentDate(next.startAt,zone)} · {countdown(dateMillis(next.startAt),now)}</p></div><div><p className="font-semibold">{next.clientName}</p><p className="text-sm text-muted">{next.serviceName}</p></div><Link className="inline-flex items-center gap-2 bg-primary rounded-lg text-white px-5 py-3 text-sm" to={`/reservas/${encodeURIComponent(next.id)}`}>Ver reserva<ArrowRight size={18} /></Link></div>}
    <div className="flex flex-wrap gap-3">{[['/agenda','Mi agenda',CalendarDays],['/reservas','Todas mis reservas',CalendarCheck],['/disponibilidad','Mis horarios',Clock]].map(([to,label,Icon]) => <Link key={to} className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm text-primary" to={to}><Icon size={17} />{label}</Link>)}</div>
    <div className="grid xl:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)] gap-6 items-start">
      <Card title="Mis próximas reservas"><DataList label="Mis próximas reservas" items={upcoming} searchText={r => `${r.clientName} ${r.serviceName} ${reservationStatuses[r.displayStatus || r.status]}`}>
        {rows => <div className="space-y-3">{rows.map(r => <div className={`flex flex-wrap items-center gap-4 rounded-xl border p-4 ${detail?.id === r.id ? 'border-indigo-200 bg-indigo-50/60' : ''}`} key={r.id}><span className="text-primary font-semibold">{formatAppointmentDate(r.startAt,zone,true)}</span><Link className="flex-1 min-w-0" to={`/reservas/${encodeURIComponent(r.id)}`}><strong className="block">{r.clientName} · {r.serviceName}</strong><span className="text-xs text-muted">{formatAppointmentDate(r.startAt,zone)}</span></Link><button type="button" className="rounded-lg border px-3 py-2 text-sm text-primary" onClick={() => setSelected(r.id)} aria-label={`Resumen de ${r.clientName}`}>Resumen</button></div>)}</div>}
      </DataList></Card>
      <Card title="Detalle de la cita">{detail ? <div className="space-y-5"><div className="flex items-center gap-3"><span className="rounded-full bg-indigo-50 text-primary p-3"><UserRound size={24} /></span><div><p className="font-semibold">{detail.clientName}</p><Badge tone="primary">{reservationStatuses[detail.displayStatus || detail.status]}</Badge></div></div><dl className="space-y-4 text-sm">{[['Servicio',detail.serviceName],['Fecha',formatAppointmentDate(detail.startAt,zone)],['Horario',formatAppointmentDate(detail.startAt,zone,true)],['Profesional',detail.professionalName]].map(([label,value]) => <div key={label}><dt className="text-muted">{label}</dt><dd className="mt-1 font-medium">{value || 'Por confirmar'}</dd></div>)}</dl><Link className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm text-white" to={`/reservas/${encodeURIComponent(detail.id)}`}>Gestionar reserva<ArrowRight size={16} /></Link></div> : <p className="text-sm text-muted">No tienes citas próximas. Tu agenda está al día.</p>}</Card>
    </div>
  </section>
}
