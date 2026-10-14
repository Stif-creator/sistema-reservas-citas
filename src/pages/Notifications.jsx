import { Link } from 'react-router-dom'
import useSprintData from '../hooks/useSprintData'
import { useAuth } from '../context/auth-context'
import '../components/booking/booking.css'

export default function Notifications() {
  const { membership } = useAuth()
  const { data, error, busy, mutate, reload } = useSprintData()
  const base = membership.role === 'client' ? '/cliente' : ''
  return <section className="booking-scope space-y-4"><h1>Avisos y recordatorios</h1><p>Los cambios de tus citas y recordatorios aparecen aquí. Se actualizan cada minuto mientras la página está abierta.</p><button className="booking-button secondary" onClick={reload}>Actualizar avisos</button>
    {error && <p role="alert">{error}</p>}{!data && !error && <p role="status">Cargando avisos…</p>}
    {data?.notifications.length === 0 && <p>No tienes avisos por ahora.</p>}
    {data?.notifications.map(n => <article key={n.id} className="booking-panel"><h2>{n.title} {!n.read && <small>· Nuevo</small>}</h2><p>{n.message}</p><div className="flex gap-4 flex-wrap"><Link to={`${base}/reservas/${encodeURIComponent(n.reservationId)}`}>Ver cita</Link>{!n.read && <button disabled={busy} onClick={() => mutate({ action: 'notificationRead', id: n.id })}>Marcar como leído</button>}</div></article>)}
  </section>
}
