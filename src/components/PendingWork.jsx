import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { CalendarCheck, Clock3, CalendarX } from 'lucide-react'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'
import useSprintData from '../hooks/useSprintData'

export default function PendingWork({ items }) {
  const { membership } = useAuth()
  const { data: waiting, error: waitingError, refreshing: waitingLoading } = useSprintData('waitlist')
  const [blocks, setBlocks] = useState([]), [blocksReady, setBlocksReady] = useState(false), [error, setError] = useState('')
  const admin = membership.role === 'admin'
  useEffect(() => {
    if (!admin) return undefined
    return onSnapshot(query(collection(db, 'scheduleBlocks'), where('businessId', '==', membership.businessId)), snapshot => {
      setBlocks(snapshot.docs.map(document => document.data())); setBlocksReady(true); setError('')
    }, () => { setBlocksReady(true); setError('No se pudieron consultar las solicitudes de bloqueo.') })
  }, [admin, membership.businessId])
  const entries = [
    { label: 'Por confirmar', count: items.filter(item => (item.displayStatus || item.status) === 'pending').length, ready: true, to: '/reservas?estado=pending', icon: CalendarCheck },
    { label: 'Pendientes de cierre', count: items.filter(item => ['expired', 'awaiting_closure'].includes(item.displayStatus)).length, ready: true, to: '/reservas?cierre=1', icon: Clock3 },
    { label: 'Lista de espera', count: Array.isArray(waiting) ? waiting.length : 0, ready: !waitingLoading && !waitingError, to: '/lista-espera', icon: CalendarCheck },
    ...(admin ? [{ label: 'Solicitudes de bloqueo', count: blocks.filter(block => block.status === 'pending').length, ready: blocksReady && !error, to: '/bloqueos?pendientes=1', icon: CalendarX }] : []),
  ]
  const allClear = !error && !waitingError && entries.every(entry => entry.ready && entry.count === 0)
  return <section className={`pending-work${allClear ? ' all-clear' : ''}`} aria-label="Pendientes de atención"><div className="pending-work-heading"><div><h2>Qué necesita tu atención</h2><p>Revisa y resuelve las tareas pendientes desde aquí.</p></div>{allClear && <span className="pending-work-clear">Todo al día</span>}</div>
    {(error || waitingError) && <p role="alert">{error || `No se pudo cargar la lista de espera: ${waitingError}`}</p>}
    <div className="pending-work-grid">{entries.map(({ label, count, ready, to, icon: Icon }) => <Link key={to} to={to} className={`pending-work-item${count ? ' has-pending' : ''}`}><Icon size={21} aria-hidden="true" /><span><strong>{ready ? count : '…'}</strong><span>{label}</span></span><span className="pending-work-arrow" aria-hidden="true">→</span></Link>)}</div>
  </section>
}
