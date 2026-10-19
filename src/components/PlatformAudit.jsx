import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { History } from 'lucide-react'
import { db } from '../firebase/config'
import DataList from './ui/DataList'
import Card from './ui/Card'
import Alert from './ui/Alert'
import Button from './ui/Button'
import { formatAppointmentDate } from '../lib/clientPresentation'

const actions = { superadmin_granted: 'Acceso de superadministrador otorgado', superadmin_revoked: 'Acceso de superadministrador retirado', platformCreate: 'Negocio creado', platformStatus: 'Estado del negocio', businessUpdate: 'Configuración actualizada', membershipUpdate: 'Permisos actualizados' }
const states = { pending: 'Pendiente', active: 'Activo', inactive: 'Desactivado', deleted: 'Archivado', admin: 'Administrador', professional: 'Profesional', client: 'Cliente' }
export default function PlatformAudit({ businesses, users }) {
  const [items, setItems] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [count, setCount] = useState(100), [action, setAction] = useState('')
  useEffect(() => onSnapshot(query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(count)), snapshot => {
    setItems(snapshot.docs.map(d => ({ ...d.data(), id: d.id }))); setError(''); setLoading(false)
  }, () => { setError('No se pudo cargar el historial. Comprueba los permisos y las reglas publicadas.'); setLoading(false) }), [count])
  const userName = id => users[id] ? `${users[id].firstName || ''} ${users[id].lastName || ''}`.trim() || users[id].email : id || 'Sin identificar'
  const businessName = id => businesses.find(b => b.id === id)?.name || id
  return <Card title="Historial de acciones" description="Registros guardados desde la plataforma. Las acciones anteriores a esta actualización pueden no tener detalle.">
    {error && <Alert tone="error">{error}</Alert>}
    <label className="audit-filter">Tipo de acción<select value={action} onChange={e => setAction(e.target.value)}><option value="">Todas las acciones</option>{Object.entries(actions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {loading ? <p role="status">Cargando historial…</p> : <DataList label="Historial de acciones" items={items.filter(i => !action || i.action === action)} searchText={i => `${businessName(i.businessId)} ${userName(i.actorUserId)} ${userName(i.targetUserId)} ${actions[i.action] || i.action}`}>
      {rows => <ul className="audit-list">{rows.map(item => <li key={item.id}><History size={21} aria-hidden="true" /><div><strong>{actions[item.action] || item.action}</strong><p>{businessName(item.businessId)} · {userName(item.actorUserId)}</p>
        {item.status && <p>Estado: {states[item.status] || item.status}</p>}
        {item.action === 'membershipUpdate' && <p>{userName(item.targetUserId)}: {states[item.beforeRole]} / {states[item.beforeStatus]} → {states[item.afterRole]} / {states[item.afterStatus]}</p>}
        {item.action === 'businessUpdate' && <p>{item.beforeName !== item.afterName ? `Nombre: ${item.beforeName} → ${item.afterName}. ` : ''}{JSON.stringify(item.beforeAppearance) !== JSON.stringify(item.afterAppearance) ? 'Colores actualizados.' : 'Datos del negocio guardados.'}</p>}
        <time>{formatAppointmentDate(item.createdAt)} · {formatAppointmentDate(item.createdAt, 'America/La_Paz', true)} (La Paz)</time></div></li>)}</ul>}
    </DataList>}
    {items.length >= count && <Button variant="secondary" onClick={() => setCount(c => c + 100)}>Cargar registros anteriores</Button>}
  </Card>
}
