import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { CalendarCheck, Clock3, CalendarX } from 'lucide-react'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'
import useSprintData from '../hooks/useSprintData'

export default function PendingWork({ items }) {
  const { membership } = useAuth()
  const { data: waiting, error: waitingError } = useSprintData('waitlist')
  const [blocks, setBlocks] = useState([]), [error, setError] = useState('')
  const admin = membership.role === 'admin'
  useEffect(() => {
    if (!admin) return
    return onSnapshot(query(collection(db, 'scheduleBlocks'), where('businessId', '==', membership.businessId)), snapshot => {
      setBlocks(snapshot.docs.map(d => d.data())); setError('')
    }, () => setError('No se pudieron consultar las solicitudes de bloqueo.'))
  }, [admin, membership.businessId])
  const entries = [
    { label: 'Por confirmar', count: items.filter(r => (r.displayStatus || r.status) === 'pending').length, to: '/reservas?estado=pending', icon: CalendarCheck },
    { label: 'Pendientes de cierre', count: items.filter(r => ['expired', 'awaiting_closure'].includes(r.displayStatus)).length, to: '/reservas?cierre=1', icon: Clock3 },
    { label: 'Lista de espera', count: Array.isArray(waiting) ? waiting.length : 0, to: '/lista-espera', icon: CalendarCheck },
    ...(admin ? [{ label: 'Solicitudes de bloqueo', count: blocks.filter(b => b.status === 'pending').length, to: '/bloqueos?pendientes=1', icon: CalendarX }] : []),
  ]
  return <section className="pending-work" aria-label="Pendientes de atención"><div><h2>Qué necesita tu atención</h2><p>Revisa y resuelve las tareas pendientes desde aquí.</p></div>
    {(error || waitingError) && <p role="alert">{error || `No se pudo cargar la lista de espera: ${waitingError}`}</p>}
    <div className="pending-work-grid">{entries.map(({ label, count, to, icon: Icon }) => <Link key={to} to={to} className={count ? 'has-pending' : ''}><Icon size={23} aria-hidden="true" /><span><strong>{count}</strong><span>{label}</span></span><span aria-hidden="true">→</span></Link>)}</div>
  </section>
}
