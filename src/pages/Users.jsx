import DataList from '../components/ui/DataList'
import AdminSummary from '../components/ui/AdminSummary'
import PersonAvatar from '../components/ui/PersonAvatar'
import { Users as UsersIcon, UserRound, ShieldCheck, LockKeyhole, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'
import { changeMembership } from '../lib/userAdministration'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import { fieldControlClasses } from '../components/ui/fieldStyles'

const roles = { admin: 'Administrador', professional: 'Profesional', client: 'Cliente' }

function UserRow({ member, locked, save, busy }) {
  const [draft, setDraft] = useState(null)
  const role = draft?.role ?? member.role
  const status = draft?.status ?? (member.status === 'pending' ? 'active' : member.status)
  return (
    <tr className="border-b border-border">
      <td className="p-3"><div className="admin-person"><PersonAvatar name={member.name} tone={member.role === 'client' ? 'green' : member.role === 'professional' ? 'blue' : 'purple'} /><div><p className="font-medium">{member.name}</p><p className="text-xs text-muted">{member.email}</p></div></div></td>
      <td className="p-3"><select aria-label={`Rol de ${member.name}`} value={role} disabled={locked || busy}
        className={fieldControlClasses(false)} onChange={(e) => setDraft({ role: e.target.value, status })}>
        {Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></td>
      <td className="p-3">
        {member.status === 'pending' && <p className="mb-1 text-xs text-muted">Pendiente de aprobación</p>}
        <select aria-label={`Estado de ${member.name}`} value={status} disabled={locked || busy}
          className={fieldControlClasses(false)} onChange={(e) => setDraft({ role, status: e.target.value })}>
          <option value="active">Activo</option><option value="inactive">Inactivo</option>
        </select>
      </td>
      <td className="p-3">{locked ? <span className="admin-protected"><LockKeyhole size={13} />Cuenta protegida</span> :
        <Button disabled={busy || (role === member.role && status === member.status)}
          onClick={async () => { if (await save(member.userId, role, status)) setDraft(null) }}><Save size={14} />Guardar</Button>}</td>
    </tr>
  )
}

export default function Users() {
  const { membership, currentUser } = useAuth()
  const businessId = membership.businessId
  const [members, setMembers] = useState([])
  const [ownerId, setOwnerId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  useEffect(() => {
    let active = true
    let generation = 0
    const stop = onSnapshot(query(collection(db, 'memberships'), where('businessId', '==', businessId)), async (snapshot) => {
      const version = ++generation
      try {
        const [business, list] = await Promise.all([
          getDoc(doc(db, 'businesses', businessId)),
          Promise.all(snapshot.docs.map(async (item) => {
            const member = item.data()
            const profile = await getDoc(doc(db, 'users', member.userId)).catch(error => { if (error.code === 'permission-denied' && member.email) return null; throw error })
            const data = profile ? profile.data() : member
            return { ...member, name: data ? `${data.firstName} ${data.lastName}` : 'Perfil incompleto', email: data?.email || '' }
          })),
        ])
        if (!active || version !== generation) return
        setMembers(list.sort((a, b) => a.name.localeCompare(b.name)))
        setOwnerId(business.data()?.ownerUserId)
        setError('')
      } catch (err) {
        console.error('Error al cargar perfiles de usuarios', err)
        if (active && version === generation) setError(err.code === 'permission-denied'
          ? 'No tienes permisos para consultar los perfiles de este negocio. Contacta al administrador.'
          : 'No se pudieron cargar los usuarios. Recarga la página.')
      } finally { if (active && version === generation) setLoading(false) }
    }, (err) => {
      console.error('Error al consultar membresías', err)
      ++generation
      if (active) { setError('No se pudieron cargar los usuarios.'); setLoading(false) }
    })
    return () => { active = false; stop() }
  }, [businessId])
  async function save(userId, role, status) {
    if (!window.confirm('Confirmar el cambio de rol y acceso de esta cuenta?')) return false
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await changeMembership(businessId, userId, role, status)
      setMembers((previous) => previous.map((member) => member.userId === userId ? { ...member, role, status } : member))
      setSuccess('Rol y estado actualizados. Los permisos se aplican también a las sesiones abiertas.')
      return true
    } catch { setError('No se pudieron actualizar los permisos. Recarga la página e intenta de nuevo.'); return false }
    finally { setBusy(false) }
  }
  return <div className="space-y-6">
    <PageHeader title="Usuarios" description="Administra los roles y el acceso de las cuentas de tu negocio." />
    <AdminSummary items={[
      { label: 'Administradores', value: loading ? '—' : members.filter(m => m.role === 'admin').length, icon: ShieldCheck },
      { label: 'Profesionales', value: loading ? '—' : members.filter(m => m.role === 'professional').length, icon: UserRound, tone: 'blue' },
      { label: 'Clientes', value: loading ? '—' : members.filter(m => m.role === 'client').length, icon: UsersIcon, tone: 'green' },
    ]} />
    {error && <Alert tone="error">{error}</Alert>}
    {success && <Alert tone="success">{success}</Alert>}
    <Card title="Cuentas del negocio">
      <p className="mb-4 text-sm text-muted">Desactivar una cuenta impide su acceso al panel de este negocio. Tu cuenta y la del propietario están protegidas.</p>
      <div className="admin-filter-row"><label>Filtrar por rol<select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}><option value="">Todos los roles</option>{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Filtrar por estado<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">Todos los estados</option><option value="active">Activo</option><option value="inactive">Inactivo</option><option value="pending">Pendiente</option></select></label></div>
      {loading ? <p role="status">Cargando usuarios…</p> : <DataList items={members.filter(m => (!roleFilter || m.role === roleFilter) && (!statusFilter || m.status === statusFilter))} resetKey={`${roleFilter}:${statusFilter}`} label="Usuarios" searchText={m => `${m.name} ${m.email} ${roles[m.role]} ${m.status === "active" ? "Activo" : m.status === "pending" ? "Pendiente" : "Inactivo"}`}>{rows => <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr><th className="p-3">Usuario</th><th className="p-3">Rol</th><th className="p-3">Estado</th><th className="p-3">Acción</th></tr></thead>
        <tbody>{rows.map((member) => <UserRow key={member.userId}
          member={member} busy={busy} locked={!ownerId || member.userId === ownerId || member.userId === currentUser.uid} save={save} />)}</tbody>
      </table></div>}</DataList>}
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
