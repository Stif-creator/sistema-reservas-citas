import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Copy, Eye, EyeOff, LockKeyhole, RefreshCw, Search, ShieldCheck, X } from 'lucide-react'
import { useAuth } from '../context/auth-context'
import { useFeedback } from '../context/feedback-context'
import { bookingRequest } from '../lib/bookingApi'
import { generatePassword } from '../lib/password'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import './platform-requests.css'

const statusLabel = { pending: 'Pendiente', in_review: 'En revisión', needs_info: 'Información solicitada', approved: 'Aprobada', rejected: 'Rechazada' }
const dateLabel = value => { const date = value?.toDate?.() || (value?._seconds ? new Date(value._seconds * 1000) : value ? new Date(value) : null); return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium' }).format(date) : '—' }

export default function PlatformRequests() {
  const { isSuperadmin } = useAuth()
  const { confirm } = useFeedback()
  const actionLock = useRef(false), modalRef = useRef(null), returnFocusRef = useRef(null), passwordRef = useRef(null)
  const [status, setStatus] = useState(''), [cursor, setCursor] = useState(null), [history, setHistory] = useState([]), [search, setSearch] = useState('')
  const [data, setData] = useState(null), [selected, setSelected] = useState(null), [note, setNote] = useState(''), [initialPassword, setInitialPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false), [credentialReceipt, setCredentialReceipt] = useState(''), [showReceipt, setShowReceipt] = useState(false), [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const closeDetails = useCallback(() => { if (actionLock.current) return; setSelected(null); setInitialPassword(''); setShowPassword(false); setError('') }, [])
  const load = useCallback(async (nextCursor = null) => {
    setBusy(true); setError('')
    try { setData(await bookingRequest({ action: 'businessRequestsList', status: status || undefined, search: search || undefined, cursor: nextCursor || undefined, limit: 20 })) }
    catch (failure) { setError(failure.message || 'No se pudieron cargar las solicitudes.') }
    finally { setBusy(false) }
  }, [status, search])
  useEffect(() => { const timer = setTimeout(() => load(), 350); return () => clearTimeout(timer) }, [load])
  useEffect(() => {
    if (!selected) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timer = setTimeout(() => modalRef.current?.querySelector('button, input, textarea')?.focus(), 0)
    const onKeyDown = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeDetails(); return }
      if (event.key !== 'Tab' || !modalRef.current) return
      const elements = [...modalRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], select:not([disabled])')]
      if (!elements.length) return
      const first = elements[0], last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { clearTimeout(timer); document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow }
  }, [selected, closeDetails])
  useEffect(() => { if (!selected && returnFocusRef.current) { returnFocusRef.current.focus(); returnFocusRef.current = null } }, [selected])
  const items = useMemo(() => data?.items || [], [data])
  const canApprove = selected && ['pending', 'in_review'].includes(selected.status)
  if (!isSuperadmin) return <Navigate to="/dashboard" replace />

  function openDetails(item, trigger) {
    returnFocusRef.current = trigger
    setSelected(item); setNote(''); setInitialPassword(''); setShowPassword(false); setError('')
  }
  async function act(action, values = {}) {
    if (!selected || actionLock.current) return
    if (action === 'businessRequestApprove' && initialPassword && initialPassword.length < 12) {
      setError('La contraseña inicial debe tener al menos 12 caracteres.'); passwordRef.current?.focus(); return
    }
    actionLock.current = true
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await bookingRequest({ action, requestId: selected.id, ...values })
      setMessage(action === 'businessRequestApprove' ? `Solicitud aprobada. Negocio creado: ${result.businessId}` : `Solicitud actualizada: ${statusLabel[result.status]}.`)
      if (result.generatedPassword) { setCredentialReceipt(result.generatedPassword); setShowReceipt(false); setCopied(false) }
      else { setCredentialReceipt(''); setShowReceipt(false) }
      setNote(''); setInitialPassword(''); setSelected(null); await load(cursor)
    } catch (failure) {
      const detail = failure.message || 'No se pudo actualizar la solicitud.'
      setError(initialPassword && detail.includes(initialPassword) ? 'No se pudo aprobar la solicitud. Revisa los datos e inténtalo nuevamente.' : detail)
      if (/no tiene cuenta|contraseña inicial/i.test(detail)) { setShowPassword(true); passwordRef.current?.focus() }
    } finally { setBusy(false); actionLock.current = false }
  }
  async function approve() {
    if (!selected || !['pending', 'in_review'].includes(selected.status) || busy || actionLock.current) return
    const applicant = `${selected.applicant?.firstName || ''} ${selected.applicant?.lastName || ''}`.trim()
    const accepted = await confirm({ title: '¿Aprobar este negocio?', description: `Se aprobará la solicitud de “${selected.business?.name}” y se creará el negocio en CitasPro para ${applicant}. Su página pública permanecerá desactivada hasta que el Superadministrador autorice su publicación. Si el correo ya tiene una cuenta, se vinculará sin cambiar su contraseña.`, confirmLabel: 'Aprobar y crear negocio' })
    if (accepted) await act('businessRequestApprove', { initialPassword })
  }
  async function reject() {
    if (!selected || busy || actionLock.current) return
    if (note.trim().length < 5) { setError('Escribe el motivo del rechazo (al menos 5 caracteres).'); return }
    const accepted = await confirm({ title: '¿Rechazar esta solicitud?', description: `El negocio “${selected.business?.name}” será rechazado. Motivo: ${note.trim()}`, confirmLabel: 'Confirmar rechazo' })
    if (accepted) await act('businessRequestReview', { status: 'rejected', note })
  }
  async function requestInfo() {
    if (!selected || busy || actionLock.current) return
    if (note.trim().length < 5) { setError('Escribe qué información hace falta (al menos 5 caracteres).'); return }
    const accepted = await confirm({ title: '¿Solicitar información adicional?', description: `Se enviará la observación al solicitante de “${selected.business?.name}”: ${note.trim()}`, confirmLabel: 'Solicitar información' })
    if (accepted) await act('businessRequestReview', { status: 'needs_info', note })
  }
  async function copyReceipt() {
    try { await navigator.clipboard.writeText(credentialReceipt); setCopied(true) }
    catch { setError('No se pudo copiar la contraseña. Selecciónala y cópiala manualmente.') }
  }
  function page(next) { if (!next) return; setHistory(old => [...old, cursor]); setCursor(next); load(next) }
  function previous() { const nextHistory = [...history]; const prior = nextHistory.pop() || null; setHistory(nextHistory); setCursor(prior); load(prior) }

  return <div className="platform-requests"><PageHeader title="Solicitudes de negocios" description="Revisa los datos recibidos y autoriza la creación de negocios en CitasPro." />
    <div className="request-stat-grid">{[['Total', data?.counts?.total], ['Pendientes', data?.counts?.pending], ['En revisión', data?.counts?.in_review], ['Aprobadas', data?.counts?.approved], ['Rechazadas', data?.counts?.rejected]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value ?? '—'}</strong></article>)}</div>
    {error && !selected && <Alert tone="error">{error}</Alert>}{message && <Alert tone="success">{message}</Alert>}
    {credentialReceipt && <section className="request-credential-receipt" aria-labelledby="credential-receipt-title"><div className="request-credential-receipt-copy"><LockKeyhole size={20} /><div><h3 id="credential-receipt-title">Contraseña inicial creada</h3><p>Entrégala al administrador por un canal seguro fuera de CitasPro. Se solicitará cambiarla en el primer ingreso.</p></div></div><div className="request-receipt-controls"><code>{showReceipt ? credentialReceipt : '•'.repeat(credentialReceipt.length)}</code><Button variant="secondary" onClick={() => setShowReceipt(value => !value)}>{showReceipt ? <EyeOff size={16} /> : <Eye size={16} />}{showReceipt ? 'Ocultar' : 'Mostrar'}</Button><Button variant="secondary" onClick={copyReceipt}><Copy size={16} />{copied ? 'Copiada' : 'Copiar'}</Button><Button variant="ghost" aria-label="Cerrar y borrar contraseña" onClick={() => { setCredentialReceipt(''); setShowReceipt(false); setCopied(false) }}><X size={16} />Cerrar</Button></div></section>}
    <section className="request-list-card"><div className="request-list-tools"><label><Search size={16} /><input aria-label="Buscar solicitudes" value={search} onChange={e => { setSearch(e.target.value); setCursor(null); setHistory([]) }} placeholder="Buscar negocio o solicitante" /></label><select aria-label="Filtrar estado" value={status} onChange={e => { setStatus(e.target.value); setCursor(null); setHistory([]) }}><option value="">Todos los estados</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Button variant="secondary" disabled={busy} onClick={() => load(cursor)}>Actualizar</Button></div>
      {busy && !data ? <p className="platform-empty">Cargando solicitudes…</p> : items.length ? <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Negocio</th><th>Solicitante</th><th>Rubro</th><th>Ciudad</th><th>Fecha</th><th>Estado</th><th /></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><strong>{item.business?.name}</strong></td><td>{item.applicant?.firstName} {item.applicant?.lastName}</td><td>{item.business?.category}</td><td>{item.business?.city}</td><td>{dateLabel(item.createdAt)}</td><td><span className={`request-status ${item.status}`}>{statusLabel[item.status] || item.status}</span></td><td><Button variant="secondary" onClick={event => openDetails(item, event.currentTarget)}><Eye size={15} />Ver detalles</Button></td></tr>)}</tbody></table></div> : <p className="platform-empty">No encontramos solicitudes para estos filtros.</p>}
      <footer className="request-pagination"><span>Se muestran hasta 20 solicitudes por página.</span><div><Button variant="secondary" disabled={!history.length || busy} onClick={previous}><ChevronLeft size={16} />Anterior</Button><Button variant="secondary" disabled={!data?.nextCursor || busy} onClick={() => page(data.nextCursor)}>Siguiente<ChevronRight size={16} /></Button></div></footer>
    </section>
    {selected && <div className="request-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) closeDetails() }}><section ref={modalRef} className="request-modal" role="dialog" aria-modal="true" aria-labelledby="request-detail-title" tabIndex={-1}>
      <header className="request-modal-header"><div><ClipboardList /><div><h2 id="request-detail-title">{selected.business?.name}</h2><span className={`request-status ${selected.status}`}>{statusLabel[selected.status]}</span></div></div><button aria-label="Cerrar" disabled={busy} onClick={closeDetails}><X /></button></header>
      <div className="request-modal-content">
        <section className="request-modal-section"><h3>Información de la solicitud</h3><div className="request-detail-grid"><p><b>Solicitante</b>{selected.applicant?.firstName} {selected.applicant?.lastName}</p><p><b>Correo</b><a href={`mailto:${selected.applicant?.email}`}>{selected.applicant?.email}</a></p><p><b>Teléfono</b><a href={`tel:${selected.applicant?.phone}`}>{selected.applicant?.phone}</a></p><p><b>Rubro / ciudad</b>{selected.business?.category} · {selected.business?.city}</p><p className="wide"><b>Descripción</b>{selected.business?.description}</p><p className="wide"><b>Sitio web o redes</b>{selected.business?.website ? <a href={selected.business.website} target="_blank" rel="noreferrer">{selected.business.website}</a> : 'No proporcionado'}</p><p><b>Fecha de solicitud</b>{dateLabel(selected.createdAt)}</p></div></section>
        <section className="request-modal-section"><h3>Identidad visual</h3><div className="request-brand-row"><div><b>Colores del negocio</b><div className="request-detail-colors">{Object.entries(selected.appearance || {}).map(([label, color]) => <span key={label} title={`${label}: ${color}`} style={{ background: color }} />)}</div></div><div className="request-detail-images">{['logo', 'cover'].map(key => selected.images?.[key]?.url && <a key={key} href={selected.images[key].url} target="_blank" rel="noreferrer"><b>{key === 'logo' ? 'Logo' : 'Portada'}</b><img src={selected.images[key].url} loading="lazy" alt={`${key} propuesto`} />Ver imagen completa</a>)}</div></div></section>
        {selected.reviewNote && <p className="request-review-note"><b>Última observación</b>{selected.reviewNote}</p>}
        {!['approved', 'rejected'].includes(selected.status) && <>
          {canApprove && <section className="request-credentials"><div className="request-credentials-heading"><LockKeyhole /><div><h3>Credenciales iniciales del administrador</h3><p>Define la contraseña inicial si se crea una cuenta nueva.</p></div></div><p className="request-account-hint">Al aprobar, el servidor comprobará si este correo ya tiene una cuenta. Si existe, se vinculará y conservará su contraseña; si no, deberás proporcionar una contraseña inicial de al menos 12 caracteres. La contraseña solo se mostrará tras crear una cuenta nueva.</p>
            <label className="request-password-label" htmlFor="request-initial-password">Contraseña inicial <span>(necesaria solo para una cuenta nueva)</span></label><div className="request-password-row"><div className="request-password-input"><LockKeyhole size={17} /><input ref={passwordRef} id="request-initial-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={initialPassword} onChange={e => { setInitialPassword(e.target.value); setError('') }} maxLength={128} aria-describedby="request-password-help" placeholder="Mínimo 12 caracteres" /><button type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><Button variant="secondary" onClick={() => { setInitialPassword(generatePassword()); setShowPassword(true); setError('') }}><RefreshCw size={16} />Generar contraseña</Button><Button variant="secondary" disabled={!initialPassword} onClick={async () => { try { await navigator.clipboard.writeText(initialPassword); setMessage('Contraseña copiada. Entrégala por un canal seguro fuera de CitasPro.') } catch { setError('No se pudo copiar la contraseña. Selecciónala y cópiala manualmente.') } }}><Copy size={16} />Copiar</Button></div><p id="request-password-help" className="request-password-help"><CheckCircle2 size={14} />Mínimo 12 caracteres. La cuenta nueva deberá cambiarla en su primer ingreso.</p>
          </section>}
          <label className="request-note">Observación para el solicitante<textarea value={note} onChange={e => { setNote(e.target.value); setError('') }} maxLength={1000} rows={3} placeholder="Motivo del rechazo o información requerida (opcional para aprobar)" /></label>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="request-actions"><Button variant="secondary" disabled={busy} onClick={() => act('businessRequestReview', { status: 'in_review', note: '' })}><ShieldCheck size={15} />Marcar en revisión</Button><Button variant="secondary" disabled={busy || note.trim().length < 5} onClick={requestInfo}>Solicitar información</Button><Button variant="danger" disabled={busy || note.trim().length < 5} onClick={reject}><X size={15} />Rechazar</Button>{canApprove && <Button disabled={busy} onClick={approve}><Check size={15} />{busy ? 'Procesando…' : 'Aprobar solicitud'}</Button>}</div>
        </>}
        <div className="request-review-history"><b>Historial de revisión</b>{(selected.reviewHistory || []).map((event, index) => <p key={index}>{statusLabel[event.status] || event.status} · {dateLabel(event.at)}{event.note ? ` · ${event.note}` : ''}</p>)}</div>
      </div>
    </section></div>}
  </div>
}
