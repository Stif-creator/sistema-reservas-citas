import { markFormSaved } from '../lib/unsavedForms'
import PlatformAudit from '../components/PlatformAudit'
import EditorDialog from '../components/ui/EditorDialog'
import AdminSummary from '../components/ui/AdminSummary'
import { Building2, CheckCircle2, PauseCircle, Plus, Settings, ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react'
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
  const [creating, setCreating] = useState(false)
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState({ name:'', email:'', firstName:'', lastName:'', primaryColor:'#6366f1', secondaryColor:'#eef2ff' })
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
    const form = e.currentTarget
    if (step < 2) { setStep(step + 1); return }
    const fields = draft
    if (await mutate({ action: 'platformCreate', businessId: requestId, ...fields, createAccount, ...(createAccount ? { password } : {}) })) { setCredential(createAccount ? { email: fields.email, password } : null); setPassword(generatePassword()); form.reset(); markFormSaved(form, true); setCreating(false); setStep(0); setDraft({name:'',email:'',firstName:'',lastName:'',primaryColor:'#6366f1',secondaryColor:'#eef2ff'}); setRequestId(crypto.randomUUID()); setMessage('Negocio creado y vinculado. Su página pública permanece desactivada hasta completar la configuración.') }
  }
  return <div className="space-y-6"><PageHeader title="Negocios de la plataforma" description="Crea negocios, asigna su administrador y gestiona su estado." />
    {credential && <Alert tone="success"><p>Cuenta creada: {credential.email}</p><p>Contraseña inicial: <code className="select-all">{credential.password}</code></p><p>Compártela directamente con el administrador. Se le pedirá cambiarla al ingresar.</p><Button variant="secondary" onClick={() => setCredential(null)}>Ocultar credenciales</Button></Alert>}
    {error && <Alert tone="error">{error}</Alert>}{message && <Alert tone="success">{message}</Alert>}
    <div className="flex flex-wrap items-center justify-between gap-4"><AdminSummary items={[{ label:'Negocios',value:items.filter(b => b.status !== 'deleted').length,icon:Building2 },{label:'Activos',value:items.filter(b => b.status === 'active').length,icon:CheckCircle2,tone:'green'},{label:'Desactivados',value:items.filter(b => b.status === 'inactive').length,icon:PauseCircle,tone:'blue'}]} /><Button onClick={() => { setCreating(true); setStep(0) }}><Plus size={18} />Crear negocio</Button></div>
    <Card title="Negocios" description="Selecciona Configurar para administrar un negocio.">
      <label className="block mb-4 text-sm"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Mostrar también eliminados</label>
      <DataList label="Negocios" items={items.filter(b => showArchived || b.status !== 'deleted')} searchText={b => `${b.name} ${owners[b.ownerUserId]?.email || b.administratorEmail || ''} ${owners[b.ownerUserId]?.firstName || b.administratorName || ''} ${owners[b.ownerUserId]?.lastName || ''} ${b.status}`}>
        {rows => <div className="space-y-4">{rows.map(b => <article key={b.id} className="business-row"><div><h3 className="font-semibold">{b.name || b.id}</h3><span className={`inline-block mt-2 rounded-full px-3 py-1 text-xs ${b.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{b.status === 'active' ? 'Activo' : b.status === 'deleted' ? 'Eliminado (archivado)' : 'Desactivado'}</span></div><p className="text-sm text-muted">{owners[b.ownerUserId] ? `${owners[b.ownerUserId].firstName || ''} ${owners[b.ownerUserId].lastName || ''}`.trim() : b.administratorName || 'Administrador'} · {owners[b.ownerUserId]?.email || b.administratorEmail || 'Sin correo registrado'} · {b.status === 'active' ? 'Activo' : b.status === 'deleted' ? 'Eliminado (archivado)' : 'Desactivado'}</p>
          <div className="flex flex-wrap gap-2"><Button disabled={busy} variant="secondary" onClick={() => { selectBusiness(b.id); navigate('/negocio') }}><Settings size={16} />Configurar</Button>
            <Button disabled={busy} variant="secondary" onClick={() => (b.status !== 'active' || window.confirm('Desactivar este negocio y su acceso?')) && mutate({ action: 'platformStatus', businessId: b.id, status: b.status === 'active' ? 'inactive' : 'active' })}>{b.status === 'active' ? 'Desactivar' : 'Activar / restaurar'}</Button>
            {b.status === 'inactive' && <Button disabled={busy} variant="ghost" onClick={() => { setDeleting(b); setConfirmation('') }}>Eliminar</Button>}
          </div></article>)}</div>}
      </DataList>
    </Card>
    <PlatformAudit businesses={items} users={owners} />
    {creating && <EditorDialog title="Crear negocio" busy={busy} onClose={() => setCreating(false)}><form onSubmit={create} className="business-wizard space-y-6">
      <div className="wizard-steps">{['Negocio','Administrador','Revisar'].map((name,index) => <span key={name} className={step === index ? 'current' : ''} aria-current={step === index ? 'step' : undefined}><b>{index+1}</b>{name}</span>)}</div>
      {step === 0 && <div className="space-y-5"><h3 className="text-lg font-semibold">Identidad del negocio</h3><p className="text-sm text-muted">Define su nombre y colores. El administrador podrá completar el resto.</p><label className="block">Nombre del negocio<input autoFocus className={fieldControlClasses(false)} required maxLength={120} value={draft.name} onChange={e => setDraft({...draft,name:e.target.value})} /></label><div className="grid grid-cols-2 gap-4">{[['primaryColor','Color primario'],['secondaryColor','Color secundario']].map(([key,label]) => <label key={key}>{label}<input className="block w-full h-12 mt-2 rounded-lg" type="color" value={draft[key]} onChange={e => setDraft({...draft,[key]:e.target.value})} /></label>)}</div></div>}
      {step === 1 && <div className="space-y-5"><h3 className="text-lg font-semibold">Cuenta del administrador</h3><label className="block">Cuenta del administrador<select className={fieldControlClasses(false)} value={createAccount ? 'new' : 'existing'} onChange={e => setCreateAccount(e.target.value === 'new')}><option value="new">Crear cuenta nueva</option><option value="existing">Vincular cuenta existente</option></select></label>{(createAccount ? [['firstName','Nombre del administrador'],['lastName','Apellido del administrador'],['email','Correo del administrador']] : [['email','Correo del administrador']]).map(([key,label]) => <label className="block" key={key}>{label}<input className={fieldControlClasses(false)} required maxLength={key === 'email' ? 254 : 80} type={key === 'email' ? 'email' : 'text'} value={draft[key]} onChange={e => setDraft({...draft,[key]:e.target.value})} /></label>)}<div className="flex gap-3 rounded-xl bg-indigo-50 text-indigo-900 p-4 text-sm"><ShieldCheck className="shrink-0" size={20} /><p>{createAccount ? 'Generaremos una contraseña inicial. El administrador verá el aviso para cambiarla al ingresar.' : 'La cuenta debe estar registrada. Se conservan sus otros negocios y su contraseña.'}</p></div></div>}
      {step === 2 && <div className="rounded-xl border p-6 space-y-4"><h3 className="text-lg font-semibold">Revisa antes de crear</h3><dl className="grid sm:grid-cols-2 gap-4"><div><dt className="text-sm text-muted">Negocio</dt><dd className="font-semibold break-words">{draft.name}</dd></div><div><dt className="text-sm text-muted">Administrador</dt><dd className="break-words">{createAccount ? `${draft.firstName} ${draft.lastName}` : 'Cuenta existente'}<br />{draft.email}</dd></div></dl><p className="text-sm text-muted">La página pública empezará desactivada. Podrás configurar el negocio antes de publicarlo.</p></div>}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex justify-between gap-3 border-t pt-5"><Button variant="secondary" disabled={busy} onClick={() => step ? setStep(step-1) : setCreating(false)}><ArrowLeft size={16} />{step ? 'Atrás' : 'Cancelar'}</Button><Button type="submit" disabled={busy}>{busy ? 'Guardando...' : step === 2 ? 'Crear y vincular negocio' : 'Continuar'}<ArrowRight size={16} /></Button></div>
    </form></EditorDialog>}
    {deleting && <Card title="Confirmar eliminación"><p>Se archivará el negocio y dejará de estar disponible. Se conservan cuentas e historial; podrás restaurarlo. Primero deben resolverse sus reservas pendientes o confirmadas.</p><label className="block mt-4">Escribe {deleting.name}<input className={fieldControlClasses(false)} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label><div className="flex gap-3 mt-4"><Button disabled={busy || confirmation !== deleting.name} onClick={async () => { if (await mutate({ action: 'platformStatus', businessId: deleting.id, status: 'deleted', confirmName: confirmation })) setDeleting(null) }}>Confirmar eliminación</Button><Button variant="secondary" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</Button></div></Card>}
  </div>
}
