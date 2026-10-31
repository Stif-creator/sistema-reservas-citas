import { markFormSaved } from '../lib/unsavedForms'
import DataList from '../components/ui/DataList'
import AdminSummary from '../components/ui/AdminSummary'
import PersonAvatar from '../components/ui/PersonAvatar'
import { Users as UsersIcon, UserRound, ShieldCheck, LockKeyhole, Save } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../context/auth-context'
import useSprintData from '../hooks/useSprintData'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import { fieldControlClasses } from '../components/ui/fieldStyles'
import { useFeedback } from '../context/feedback-context'

const roles = { admin: 'Administrador', professional: 'Profesional', client: 'Cliente' }

function UserRow({ member, currentUserId, save, busy }) {
  const [draft, setDraft] = useState(null)
  const role = draft?.role ?? member.role
  const status = draft?.status ?? member.status
  const protectedAccount = member.owner || member.userId === currentUserId
  const platformManaged = member.role === 'admin'
  const unavailable = !member.profileAvailable
  const locked = protectedAccount || platformManaged || unavailable
  const roleEditable = !locked
  const changed = role !== member.role || status !== member.status
  const roleLabel = roles[member.role] || 'Rol no reconocido'
  return (
    <tr data-draft className="border-b border-border">
      <td className="p-3"><div className="admin-person"><PersonAvatar name={member.name || ''} tone={member.role === 'client' ? 'green' : member.role === 'professional' ? 'blue' : 'purple'} /><div><p className="font-medium">{member.name || 'Sin nombre'}</p><p className="text-xs text-muted">{member.email || '—'}</p></div></div></td>
      <td className="p-3">{roleEditable
        ? <select aria-label={`Rol de ${member.name || member.userId}`} value={role} disabled={busy}
          className={fieldControlClasses(false)} onChange={event => setDraft({ role: event.target.value, status })}>
          {Object.entries(roles).filter(([value]) => value !== 'admin').map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        : <span>{roleLabel}</span>}</td>
      <td className="p-3">
        {member.status === 'pending' && <p className="mb-1 text-xs text-muted">Pendiente de aprobación</p>}
        <select aria-label={`Estado de ${member.name || member.userId}`} value={status} disabled={locked || busy}
          className={fieldControlClasses(false)} onChange={event => setDraft({ role, status: event.target.value })}>
          <option value="active">Activo</option><option value="inactive">Inactivo</option><option value="pending" disabled>Pendiente de aprobación</option>
        </select>
      </td>
      <td className="p-3">{protectedAccount ? <span className="admin-protected"><LockKeyhole size={13} />Cuenta protegida</span>
        : platformManaged ? <span className="admin-protected"><LockKeyhole size={13} />Gestionada desde plataforma</span>
        : unavailable ? <span className="admin-protected"><LockKeyhole size={13} />Perfil no disponible</span>
        : <Button disabled={busy || !changed}
          onClick={async event => { const row = event.currentTarget.closest('tr'); if (await save(member.userId, role, status)) { markFormSaved(row); setDraft(null) } }}><Save size={14} />Guardar</Button>}</td>
    </tr>
  )
}

export default function Users() {
  const { membership, currentUser } = useAuth()
  const { confirm, notify } = useFeedback()
  const businessId = membership?.businessId
  const { data, error, refreshing, busy, mutate, reload } = useSprintData('businessUsers')
  const members = Array.isArray(data) ? data : []
  const hasData = Array.isArray(data)
  const loading = !hasData && refreshing
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  async function save(userId, role, status) {
    if (!await confirm({ title: '¿Actualizar el acceso?', description: 'Se aplicará el cambio de rol o estado únicamente en este negocio.', confirmLabel: 'Actualizar acceso' })) return false
    const saved = await mutate({ action: 'membershipUpdate', userId, role, status })
    notify(saved
      ? { title: 'Acceso actualizado', message: 'Los cambios se guardaron para esta membresía.', type: 'success' }
      : { title: 'No se pudo actualizar', message: 'El servidor rechazó el cambio o la cuenta dejó de estar disponible. Revisa los permisos e inténtalo de nuevo.', type: 'error' })
    return saved
  }

  return <div className="space-y-6">
    <PageHeader title="Usuarios" description="Administra los roles y el acceso de las cuentas de tu negocio." />
    <AdminSummary items={[
      { label: 'Administradores', value: hasData ? members.filter(member => member.role === 'admin').length : '—', icon: ShieldCheck },
      { label: 'Profesionales', value: hasData ? members.filter(member => member.role === 'professional').length : '—', icon: UserRound, tone: 'blue' },
      { label: 'Clientes', value: hasData ? members.filter(member => member.role === 'client').length : '—', icon: UsersIcon, tone: 'green' },
    ]} />
    {error && <Alert tone="error">{error}</Alert>}
    <Card title="Cuentas del negocio">
      <p className="mb-4 text-sm text-muted">Desactivar una cuenta impide su acceso al panel de este negocio. Tu cuenta y la del propietario están protegidas.</p>
      <div className="admin-filter-row"><label>Filtrar por rol<select value={roleFilter} onChange={event => setRoleFilter(event.target.value)}><option value="">Todos los roles</option>{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Filtrar por estado<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">Todos los estados</option><option value="active">Activo</option><option value="inactive">Inactivo</option><option value="pending">Pendiente</option></select></label></div>
      {loading ? <p role="status">Cargando usuarios…</p> : error && !hasData ? <div className="flex items-center gap-3"><p role="status">No se pudo completar la consulta.</p><Button variant="secondary" onClick={reload}>Reintentar</Button></div> : hasData ? <>
        {refreshing && <p role="status" className="mb-2 text-xs text-muted">Actualizando usuarios…</p>}
        <DataList items={members.filter(member => (!roleFilter || member.role === roleFilter) && (!statusFilter || member.status === statusFilter))} resetKey={`${businessId}:${roleFilter}:${statusFilter}`} label="Usuarios" searchText={member => `${member.name} ${member.email} ${member.userId} ${roles[member.role] || ''} ${member.status}`}>
          {rows => <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead><tr><th className="p-3">Usuario</th><th className="p-3">Rol en este negocio</th><th className="p-3">Estado</th><th className="p-3">Acción</th></tr></thead>
            <tbody>{rows.map(member => <UserRow key={member.userId} member={member} currentUserId={currentUser?.uid} busy={busy} save={save} />)}</tbody>
          </table></div>}
        </DataList>
      </> : null}
    </Card>
    <Card title="Permisos por rol">
      <ul className="admin-role-guide">
        <li><strong>Administrador:</strong> configura el negocio y administra usuarios, servicios, profesionales, horarios y bloqueos.</li>
        <li><strong>Profesional:</strong> consulta su disponibilidad y gestiona sus propios bloqueos.</li>
        <li><strong>Cliente:</strong> accede a su panel personal, sin acceso a la administración.</li>
      </ul>
    </Card>
  </div>
}
