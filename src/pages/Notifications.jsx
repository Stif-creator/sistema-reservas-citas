import { Bell, CheckCheck, ArrowUpRight } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import DataList from '../components/ui/DataList'
import Alert from '../components/ui/Alert'
import { Link } from 'react-router-dom'
import useNotifications from '../hooks/useNotifications'
import { useAuth } from '../context/auth-context'
import '../components/booking/booking.css'

export default function Notifications() {
  const { membership } = useAuth()
  const { items, error, busy, markRead, reload, loading } = useNotifications()
  const base = membership.role === 'client' ? '/cliente' : ''
  return <section className="booking-scope space-y-4"><PageHeader title="Avisos y recordatorios" description="Sigue los cambios de tus citas y los recordatorios en un solo lugar." /><button className="booking-button secondary" disabled={loading || busy} onClick={reload}>{loading ? 'Conectando con el servidor…' : 'Actualizar avisos'}</button>
    {error && <Alert tone="error">{error}</Alert>}{loading && !error && <p role="status" className="panel-loading">Cargando avisos…</p>}
    {!loading && !error && items.length === 0 && <div className="panel-empty"><Bell size={28} aria-hidden="true" /><div><h2>No tienes avisos por ahora.</h2><p>Aquí aparecerán los cambios y recordatorios de tus citas.</p></div></div>}
    {items.length > 0 && <DataList label="Avisos" items={items || []} searchText={n => `${n.title} ${n.message} ${n.read ? "Leído" : "Nuevo"}`}>{rows => <>{rows.map(n => <article key={n.id} className={`booking-panel admin-notification ${n.read ? "is-read" : "is-new"}`}><span className="admin-notification-icon"><Bell size={21} aria-hidden="true" /></span><h2>{n.title} {!n.read && <small>· Nuevo</small>}</h2><p>{n.message}</p><div className="flex gap-4 flex-wrap"><Link to={n.blockId ? '/bloqueos' : `${base}/reservas/${encodeURIComponent(n.reservationId)}`} className="booking-button secondary"><ArrowUpRight size={15} />{n.blockId ? 'Ver bloqueo' : 'Ver cita'}</Link>{!n.read && <button className="booking-button secondary" disabled={busy} onClick={() => markRead(n.id)}><CheckCheck size={15} />Marcar como leído</button>}</div></article>)}</>}</DataList>}
  </section>
}
