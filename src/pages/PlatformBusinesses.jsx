import { markFormSaved } from '../lib/unsavedForms'
import EditorDialog from '../components/ui/EditorDialog'
import { Plus, ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react'
import { generatePassword } from '../lib/password'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import { bookingRequest } from '../lib/bookingApi'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import PlatformBusinessList from '../components/PlatformBusinessList'
import { fieldControlClasses } from '../components/ui/fieldStyles'

export default function PlatformBusinesses() {
  const { isSuperadmin } = useAuth()
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [message, setMessage] = useState(''), [deleting, setDeleting] = useState(null), [confirmation, setConfirmation] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [creating, setCreating] = useState(false)
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState({ name:'', email:'', firstName:'', lastName:'', primaryColor:'#6366f1', secondaryColor:'#eef2ff' })
  const [createAccount, setCreateAccount] = useState(true)
  const [password, setPassword] = useState(generatePassword)
  const [credential, setCredential] = useState(null)
  if (!isSuperadmin) return <Navigate to="/dashboard" replace />
  async function mutate(input) {
    setBusy(true); setError(''); setMessage('')
    try { await bookingRequest(input); setError(''); setMessage('Negocio actualizado.'); setRefresh(value => value + 1); return true }
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
  return <div className="space-y-6"><PageHeader title="Negocios registrados" description="Crea negocios, personaliza su configuración y administra sus estados." />
    {credential && <Alert tone="success"><p>Cuenta creada: {credential.email}</p><p>Contraseña inicial: <code className="select-all">{credential.password}</code></p><p>Compártela directamente con el administrador. Se le pedirá cambiarla al ingresar.</p><Button variant="secondary" onClick={() => setCredential(null)}>Ocultar credenciales</Button></Alert>}
    {error && <Alert tone="error">{error}</Alert>}{message && <Alert tone="success">{message}</Alert>}
    <div className="flex justify-end"><Button onClick={() => { setCreating(true); setStep(0) }}><Plus size={18} />Crear negocio</Button></div>
    <PlatformBusinessList refresh={refresh} busy={busy} mutate={mutate} onArchive={business => { setDeleting(business); setConfirmation('') }} />
    {creating && <EditorDialog title="Crear negocio" busy={busy} onClose={() => setCreating(false)}><form onSubmit={create} className="business-wizard space-y-6">
      <div className="wizard-steps">{['Negocio','Administrador','Revisar'].map((name,index) => <span key={name} className={step === index ? 'current' : ''} aria-current={step === index ? 'step' : undefined}><b>{index+1}</b>{name}</span>)}</div>
      {step === 0 && <div className="space-y-5"><h3 className="text-lg font-semibold">Identidad del negocio</h3><p className="text-sm text-muted">Define su nombre y colores. El administrador podrá completar el resto.</p><label className="block">Nombre del negocio<input autoFocus className={fieldControlClasses(false)} required maxLength={120} value={draft.name} onChange={e => setDraft({...draft,name:e.target.value})} /></label><div className="grid grid-cols-2 gap-4">{[['primaryColor','Color primario'],['secondaryColor','Color secundario']].map(([key,label]) => <label key={key}>{label}<input className="block w-full h-12 mt-2 rounded-lg" type="color" value={draft[key]} onChange={e => setDraft({...draft,[key]:e.target.value})} /></label>)}</div></div>}
      {step === 1 && <div className="space-y-5"><h3 className="text-lg font-semibold">Cuenta del administrador</h3><label className="block">Cuenta del administrador<select className={fieldControlClasses(false)} value={createAccount ? 'new' : 'existing'} onChange={e => setCreateAccount(e.target.value === 'new')}><option value="new">Crear cuenta nueva</option><option value="existing">Vincular cuenta existente</option></select></label>{(createAccount ? [['firstName','Nombre del administrador'],['lastName','Apellido del administrador'],['email','Correo del administrador']] : [['email','Correo del administrador']]).map(([key,label]) => <label className="block" key={key}>{label}<input className={fieldControlClasses(false)} required maxLength={key === 'email' ? 254 : 80} type={key === 'email' ? 'email' : 'text'} value={draft[key]} onChange={e => setDraft({...draft,[key]:e.target.value})} /></label>)}<div className="flex gap-3 rounded-xl bg-indigo-50 text-indigo-900 p-4 text-sm"><ShieldCheck className="shrink-0" size={20} /><p>{createAccount ? 'Generaremos una contraseña inicial. El administrador verá el aviso para cambiarla al ingresar.' : 'La cuenta debe estar registrada. Se conservan sus otros negocios y su contraseña.'}</p></div></div>}
      {step === 2 && <div className="rounded-xl border p-6 space-y-4"><h3 className="text-lg font-semibold">Revisa antes de crear</h3><dl className="grid sm:grid-cols-2 gap-4"><div><dt className="text-sm text-muted">Negocio</dt><dd className="font-semibold break-words">{draft.name}</dd></div><div><dt className="text-sm text-muted">Administrador</dt><dd className="break-words">{createAccount ? `${draft.firstName} ${draft.lastName}` : 'Cuenta existente'}<br />{draft.email}</dd></div></dl><p className="text-sm text-muted">La página pública empezará desactivada. Podrás configurar el negocio antes de publicarlo.</p></div>}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex justify-between gap-3 border-t pt-5"><Button variant="secondary" disabled={busy} onClick={() => step ? setStep(step-1) : setCreating(false)}><ArrowLeft size={16} />{step ? 'Atrás' : 'Cancelar'}</Button><Button type="submit" disabled={busy}>{busy ? 'Guardando...' : step === 2 ? 'Crear y vincular negocio' : 'Continuar'}<ArrowRight size={16} /></Button></div>
    </form></EditorDialog>}
    {deleting && <EditorDialog busy={busy} onClose={() => setDeleting(null)} title="Confirmar eliminación"><p>Se archivará el negocio y dejará de estar disponible. Se conservan cuentas e historial; podrás restaurarlo. Primero deben resolverse sus reservas pendientes o confirmadas.</p><label className="block mt-4">Escribe {deleting.name}<input className={fieldControlClasses(false)} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label><div className="flex gap-3 mt-4"><Button disabled={busy || confirmation !== deleting.name} onClick={async () => { if (await mutate({ action: 'platformStatus', businessId: deleting.id, status: 'deleted', confirmName: confirmation })) setDeleting(null) }}>Confirmar eliminación</Button><Button variant="secondary" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</Button></div></EditorDialog>}
  </div>
}
