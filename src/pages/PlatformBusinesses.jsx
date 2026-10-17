import { generatePassword } from '../lib/password'
import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { Navigate, useNavigate } from 'react-router-dom'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'
import { bookingRequest } from '../lib/bookingApi'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import DataList from '../components/ui/DataList'
import { fieldControlClasses } from '../components/ui/fieldStyles'

export default function PlatformBusinesses() {
  const { isSuperadmin, selectBusiness } = useAuth()
  const [items, setItems] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(''), [deleting, setDeleting] = useState(null), [confirmation, setConfirmation] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [showArchived, setShowArchived] = useState(false)
  const [createAccount, setCreateAccount] = useState(true)
  const [password, setPassword] = useState(generatePassword)
  const [credential, setCredential] = useState(null)
  const [owners, setOwners] = useState({})
  const navigate = useNavigate()
  useEffect(() => {
    if (!isSuperadmin) return
    return onSnapshot(collection(db, 'users'), snap => setOwners(Object.fromEntries(snap.docs.map(d => [d.id, d.data()]))), () => setError('No se pudieron cargar los administradores.'))
  }, [isSuperadmin])
  useEffect(() => {
    if (!isSuperadmin) return
    return onSnapshot(collection(db, 'businesses'), snap => setItems(snap.docs.map(d => ({ ...d.data(), id: d.id }))), () => setError('No se pudieron cargar los negocios.'))
  }, [isSuperadmin])
  if (!isSuperadmin) return <Navigate to="/dashboard" replace />
  async function mutate(input) {
    setBusy(true); setError(''); setMessage('')
    try { await bookingRequest(input); setMessage('Negocio actualizado.'); return true }
    catch (e) { setError(e.message); return false }
    finally { setBusy(false) }
  }
  async function create(e) {
    e.preventDefault()
    const form = e.currentTarget, fields = Object.fromEntries(new FormData(form))
    if (await mutate({ action: 'platformCreate', businessId: requestId, ...fields, createAccount, ...(createAccount ? { password } : {}) })) { setCredential(createAccount ? { email: fields.email, password } : null); setPassword(generatePassword()); form.reset(); setRequestId(crypto.randomUUID()); setMessage('Negocio creado y vinculado. Su página pública permanece desactivada hasta completar la configuración.') }
  }
  return <div className="space-y-6"><PageHeader title="Negocios de la plataforma" description="Crea negocios, asigna su administrador y gestiona su estado." />
    {credential && <Alert tone="success"><p>Cuenta creada: {credential.email}</p><p>Contraseña inicial: <code className="select-all">{credential.password}</code></p><p>Compártela directamente con el administrador. Se le pedirá cambiarla al ingresar.</p><Button variant="secondary" onClick={() => setCredential(null)}>Ocultar credenciales</Button></Alert>}
    {error && <Alert tone="error">{error}</Alert>}{message && <Alert tone="success">{message}</Alert>}
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start [&>*]:min-w-0"><Card title="Negocios">
      <label className="block mb-4 text-sm"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Mostrar también eliminados</label>
      <DataList label="Negocios" items={items.filter(b => showArchived || b.status !== 'deleted')} searchText={b => `${b.name} ${owners[b.ownerUserId]?.email || b.administratorEmail || ''} ${owners[b.ownerUserId]?.firstName || b.administratorName || ''} ${owners[b.ownerUserId]?.lastName || ''} ${b.status}`}>
        {rows => <div className="space-y-4">{rows.map(b => <article key={b.id} className="border rounded-xl p-4 space-y-3"><h3 className="font-semibold">{b.name || b.id}</h3><p className="text-sm text-muted">{owners[b.ownerUserId] ? `${owners[b.ownerUserId].firstName || ''} ${owners[b.ownerUserId].lastName || ''}`.trim() : b.administratorName || 'Administrador'} · {owners[b.ownerUserId]?.email || b.administratorEmail || 'Sin correo registrado'} · {b.status === 'active' ? 'Activo' : b.status === 'deleted' ? 'Eliminado (archivado)' : 'Desactivado'}</p>
          <div className="flex flex-wrap gap-2"><Button disabled={busy} variant="secondary" onClick={() => { selectBusiness(b.id); navigate('/negocio') }}>Configurar</Button>
            <Button disabled={busy} variant="secondary" onClick={() => mutate({ action: 'platformStatus', businessId: b.id, status: b.status === 'active' ? 'inactive' : 'active' })}>{b.status === 'active' ? 'Desactivar' : 'Activar / restaurar'}</Button>
            {b.status === 'inactive' && <Button disabled={busy} variant="ghost" onClick={() => { setDeleting(b); setConfirmation('') }}>Eliminar</Button>}
          </div></article>)}</div>}
      </DataList>
    </Card><Card title="Agregar negocio"><form onSubmit={create} className="space-y-4">
      <label className="block">Cuenta del administrador<select className={fieldControlClasses(false)} value={createAccount ? 'new' : 'existing'} disabled={busy} onChange={e => setCreateAccount(e.target.value === 'new')}><option value="new">Crear cuenta nueva</option><option value="existing">Vincular cuenta existente</option></select></label>
      {createAccount && <><label className="block">Nombre del administrador<input name="firstName" required maxLength={80} disabled={busy} className={fieldControlClasses(false)} /></label><label className="block">Apellido del administrador<input name="lastName" required maxLength={80} disabled={busy} className={fieldControlClasses(false)} /></label><p className="text-sm text-muted">Se genera una contraseña temporal, que se mostrará al crear la cuenta. No se envía por correo.</p></>}
      <label className="block">Nombre del negocio<input className={fieldControlClasses(false)} name="name" maxLength={120} required disabled={busy} /></label>
      <label className="block">Correo del administrador<input className={fieldControlClasses(false)} name="email" type="email" required disabled={busy} /></label>
      {!createAccount && <p className="text-sm text-muted">Debe ser una cuenta ya registrada. Se vinculará como administrador de este negocio sin eliminar sus otras membresías.</p>}
      <div className="grid grid-cols-2 gap-4"><label>Color primario<input className="block w-full h-10" name="primaryColor" type="color" defaultValue="#6366f1" disabled={busy} /></label><label>Color secundario<input className="block w-full h-10" name="secondaryColor" type="color" defaultValue="#eef2ff" disabled={busy} /></label></div>
      <p className="text-sm text-muted">El nombre y los colores son exclusivos del superadministrador. El administrador completa imágenes, contacto, ubicación, Nosotros, servicios y horarios. También puedes completar toda la configuración por él.</p>
      <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Crear y vincular negocio'}</Button>
    </form></Card></div>
    {deleting && <Card title="Confirmar eliminación"><p>Se archivará el negocio y dejará de estar disponible. Se conservan cuentas e historial; podrás restaurarlo. Primero deben resolverse sus reservas pendientes o confirmadas.</p><label className="block mt-4">Escribe {deleting.name}<input className={fieldControlClasses(false)} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label><div className="flex gap-3 mt-4"><Button disabled={busy || confirmation !== deleting.name} onClick={async () => { if (await mutate({ action: 'platformStatus', businessId: deleting.id, status: 'deleted', confirmName: confirmation })) setDeleting(null) }}>Confirmar eliminación</Button><Button variant="secondary" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</Button></div></Card>}
  </div>
}
