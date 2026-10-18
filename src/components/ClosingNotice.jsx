import { Link } from 'react-router-dom'
import { Clock3 } from 'lucide-react'

export default function ClosingNotice({ items }) {
  const count = items.filter(r => ['expired', 'awaiting_closure'].includes(r.displayStatus)).length
  if (!count) return null
  return <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-wrap items-center gap-3 text-amber-900">
    <Clock3 size={22} aria-hidden="true" /><p className="flex-1">Tienes {count} citas pendientes de cerrar. Confirma si se atendieron, marca inasistencia o acuerda otra fecha.</p>
    <Link className="font-semibold underline" to="/reservas?cierre=1">Revisar citas</Link>
  </div>
}
