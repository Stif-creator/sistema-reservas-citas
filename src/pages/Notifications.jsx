import DataList from '../components/ui/DataList'
import { Link } from 'react-router-dom'
import useNotifications from '../hooks/useNotifications'
import { useAuth } from '../context/auth-context'
import '../components/booking/booking.css'

export default function Notifications() {
  const { membership } = useAuth()
  const { items, error, busy, markRead, reload, loading } = useNotifications()
  const base = membership.role === 'client' ? '/cliente' : ''
  return <section className="booking-scope space-y-4"><h1>Avisos y recordatorios</h1><p>Los cambios de tus citas y recordatorios aparecen aquí. Se actualizan en tiempo real; los recordatorios aparecen con la anticipación configurada.</p><button className="booking-button secondary" disabled={loading || busy} onClick={reload}>{loading ? 'Conectando con el servidor…' : 'Actualizar avisos'}</button>
    {error && <p role="alert">{error}</p>}{loading && !error && <p role="status">Cargando avisos…</p>}
    {!loading && !error && items.length === 0 && <p>No tienes avisos por ahora.</p>}
    <DataList label="Avisos" items={items || []} searchText={n => `${n.title} ${n.message} ${n.read ? "Leído" : "Nuevo"}`}>{rows => <>{rows.map(n => <article key={n.id} className="booking-panel"><h2>{n.title} {!n.read && <small>· Nuevo</small>}</h2><p>{n.message}</p><div className="flex gap-4 flex-wrap"><Link to={`${base}/reservas/${encodeURIComponent(n.reservationId)}`}>Ver cita</Link>{!n.read && <button disabled={busy} onClick={() => markRead(n.id)}>Marcar como leído</button>}</div></article>)}</>}</DataList>
  </section>
}
