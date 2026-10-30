import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, ClipboardList, Eye, Search, ShieldCheck, X, Mail } from 'lucide-react'
import { useAuth } from '../context/auth-context'
import { useFeedback } from '../context/feedback-context'
import { bookingRequest } from '../lib/bookingApi'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import './platform-requests.css'

const statusLabel = { pending: 'Pendiente', in_review: 'En revisión', needs_info: 'Información solicitada', approved: 'Aprobada', rejected: 'Rechazada' }
const emailStatus = { accepted: 'Aceptado por el proveedor (entrega no confirmada)', not_configured: 'Correo sin configurar', failed: 'No aceptado por el proveedor' }
const dateLabel = value => { const date = value?.toDate?.() || (value?._seconds ? new Date(value._seconds * 1000) : value ? new Date(value) : null); return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium' }).format(date) : '—' }

export default function PlatformRequests() {
  const { isSuperadmin } = useAuth()
  const { confirm, notify } = useFeedback()
  const [status, setStatus] = useState(''), [cursor, setCursor] = useState(null), [history, setHistory] = useState([]), [search, setSearch] = useState('')
  const [data, setData] = useState(null), [selected, setSelected] = useState(null), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [emailFeedback, setEmailFeedback] = useState(null)
  const actionLock = useRef(false)
  const load = useCallback(async (nextCursor = null) => {
    setBusy(true); setError('')
    try { setData(await bookingRequest({ action: 'businessRequestsList', status: status || undefined, search: search || undefined, cursor: nextCursor || undefined, limit: 20 })) }
    catch (failure) { setError(failure.message || 'No se pudieron cargar las solicitudes.') }
    finally { setBusy(false) }
  }, [status, search])
  useEffect(() => { const timer = setTimeout(() => load(), 350); return () => clearTimeout(timer) }, [load])
  const items = useMemo(() => data?.items || [], [data])
  if (!isSuperadmin) return <Navigate to="/dashboard" replace />
  async function act(action, values = {}) {
    if (!selected || actionLock.current) return
    actionLock.current = true; setBusy(true); setError(''); setMessage(''); setEmailFeedback(null)
    try {
      const result = await bookingRequest({ action, requestId: selected.id, ...values })
      if (action === 'businessRequestEmailRetry') {
        setEmailFeedback({ event: values.emailEvent, ...result.emailNotification })
        notify({ title: 'Reintento de correo', message: emailStatus[result.emailNotification?.status] || 'Estado actualizado.', type: result.emailNotification?.status === 'accepted' ? 'success' : 'warning' })
        await load(cursor)
      } else {
        setMessage(action === 'businessRequestApprove' ? `Solicitud aprobada. Negocio creado: ${result.businessId}.` : `Solicitud actualizada: ${statusLabel[result.status]}.`)
        setEmailFeedback(result.emailNotification ? { event: values.status || 'approved', ...result.emailNotification } : null)
        setNote(''); await load(cursor); setSelected(null)
      }
    } catch (failure) { setError(failure.message || 'No se pudo actualizar la solicitud.') }
    finally { setBusy(false); actionLock.current = false }
  }
  async function approve() {
    if (!selected || busy || actionLock.current) return
    const applicant = `${selected.applicant?.firstName || ''} ${selected.applicant?.lastName || ''}`.trim()
    const accepted = await confirm({ title: '¿Aprobar esta solicitud?', description: `Se creará “${selected.business?.name}” y se vinculará a ${applicant}. Su página pública seguirá desactivada. Si aún no tiene cuenta, recibirá un enlace seguro para configurar su contraseña.`, confirmLabel: 'Aprobar y crear negocio' })
    if (accepted) await act('businessRequestApprove')
  }
  async function reject() {
    if (!selected || busy || actionLock.current) return
    if (note.trim().length < 5) { setError('Escribe el motivo del rechazo (al menos 5 caracteres).'); return }
    const accepted = await confirm({ title: '¿Rechazar esta solicitud?', description: `La solicitud de “${selected.business?.name}” se rechazará. El solicitante recibirá esta observación: ${note.trim()}`, confirmLabel: 'Confirmar rechazo' })
    if (accepted) await act('businessRequestReview', { status: 'rejected', note })
  }
  function page(next) { if (!next) return; setHistory(old => [...old, cursor]); setCursor(next); load(next) }
  return <div className="platform-requests"><PageHeader title="Solicitudes de negocios" description="Revisa los datos recibidos y autoriza la creación de negocios en CitasPro." />
    <div className="request-stat-grid">{[['Total', data?.counts?.total], ['Pendientes', data?.counts?.pending], ['En revisión', data?.counts?.in_review], ['Aprobadas', data?.counts?.approved], ['Rechazadas', data?.counts?.rejected]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value ?? '—'}</strong></article>)}</div>
    {error && <Alert tone="error">{error}</Alert>}{message && <Alert tone="success">{message}{emailFeedback && <div className="mt-2">Correo de actualización: {emailStatus[emailFeedback.status] || emailFeedback.status}.{emailFeedback.status === 'failed' || emailFeedback.status === 'not_configured' ? ' Puedes reintentarlo desde los detalles.' : ''}</div>}</Alert>}
    <section className="request-list-card"><div className="request-list-tools"><label><Search size={16} /><input aria-label="Buscar solicitudes" value={search} onChange={e => { setSearch(e.target.value); setCursor(null); setHistory([]) }} placeholder="Buscar negocio o solicitante" /></label><select aria-label="Filtrar estado" value={status} onChange={e => { setStatus(e.target.value); setCursor(null); setHistory([]) }}><option value="">Todos los estados</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Button variant="secondary" disabled={busy} onClick={() => load(cursor)}>Actualizar</Button></div>
      {busy && !data ? <p className="platform-empty">Cargando solicitudes…</p> : items.length ? <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Negocio</th><th>Solicitante</th><th>Rubro</th><th>Ciudad</th><th>Fecha</th><th>Estado</th><th /></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><strong>{item.business?.name}</strong></td><td>{item.applicant?.firstName} {item.applicant?.lastName}</td><td>{item.business?.category}</td><td>{item.business?.city}</td><td>{dateLabel(item.createdAt)}</td><td><span className={`request-status ${item.status}`}>{statusLabel[item.status] || item.status}</span></td><td><Button variant="secondary" onClick={() => { setSelected(item); setNote(''); setError('') }}><Eye size={15} />Ver detalles</Button></td></tr>)}</tbody></table></div> : <p className="platform-empty">No encontramos solicitudes para estos filtros.</p>}
      <footer className="request-pagination"><span>Se muestran hasta 20 solicitudes por página.</span><div><Button variant="secondary" disabled={!history.length || busy} onClick={() => { const h = [...history]; const prior = h.pop() || null; setHistory(h); setCursor(prior); load(prior) }}><ChevronLeft size={16} />Anterior</Button><Button variant="secondary" disabled={!data?.nextCursor || busy} onClick={() => page(data.nextCursor)}>Siguiente<ChevronRight size={16} /></Button></div></footer>
    </section>
    {selected && <div className="request-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setSelected(null) }}><section className="request-modal" role="dialog" aria-modal="true" aria-labelledby="request-detail-title"><header><div><ClipboardList /><h2 id="request-detail-title">{selected.business?.name}</h2></div><button aria-label="Cerrar" disabled={busy} onClick={() => setSelected(null)}><X /></button></header><div className="request-detail-grid"><p><b>Solicitante</b>{selected.applicant?.firstName} {selected.applicant?.lastName}</p><p><b>Correo</b><a href={`mailto:${selected.applicant?.email}`}>{selected.applicant?.email}</a></p><p><b>Teléfono</b><a href={`tel:${selected.applicant?.phone}`}>{selected.applicant?.phone}</a></p><p><b>Categoría / ciudad</b>{selected.business?.category} · {selected.business?.city}</p><p className="wide"><b>Descripción</b>{selected.business?.description}</p><p className="wide"><b>Sitio o redes</b>{selected.business?.website || 'No proporcionado'}</p><p><b>Estado</b>{statusLabel[selected.status]}</p><p><b>Fecha de solicitud</b>{dateLabel(selected.createdAt)}</p></div><div className="request-detail-colors">{Object.entries(selected.appearance || {}).map(([label, color]) => <span key={label} title={`${label}: ${color}`} style={{ background: color }} />)}</div><div className="request-detail-images">{['logo', 'cover'].map(key => selected.images?.[key]?.url && <a key={key} href={selected.images[key].url} target="_blank" rel="noreferrer"><img src={selected.images[key].url} loading="lazy" alt={`${key} propuesto`} />Ver {key}</a>)}</div>{selected.reviewNote && <p className="request-review-note"><b>Última observación</b>{selected.reviewNote}</p>}
      {selected.emailNotifications && <section className="request-email-status"><b><Mail size={16} /> Estado de correos</b>{Object.entries(selected.emailNotifications).map(([event, record]) => <p key={event}><span>{({ submitted: 'Recepción', approved: 'Aprobación', rejected: 'Rechazo', needs_info: 'Información solicitada' })[event] || event}: {emailStatus[record.status] || record.status}</span>{record.status !== 'accepted' && <Button variant="secondary" disabled={busy} onClick={() => act('businessRequestEmailRetry', { emailEvent: event })}>Reintentar</Button>}</p>)}</section>}
      {!['approved', 'rejected'].includes(selected.status) && <><label className="request-note">Observación para el solicitante<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} rows={3} placeholder="Motivo del rechazo o información requerida" /></label><div className="request-actions"><Button variant="secondary" disabled={busy} onClick={() => act('businessRequestReview', { status: 'in_review', note: '' })}><ShieldCheck size={15} />Marcar en revisión</Button><Button variant="secondary" disabled={busy || note.trim().length < 5} onClick={() => act('businessRequestReview', { status: 'needs_info', note })}>Solicitar información</Button><Button variant="secondary" disabled={busy || note.trim().length < 5} onClick={reject}><X size={15} />Rechazar</Button><Button disabled={busy} onClick={approve}><Check size={15} />Aprobar solicitud</Button></div></>}
      <div className="request-review-history"><b>Historial de revisión</b>{(selected.reviewHistory || []).map((event, index) => <p key={index}>{statusLabel[event.status] || event.status} · {dateLabel(event.at)}{event.note ? ` · ${event.note}` : ''}</p>)}</div>
      </section></div>}
  </div>
}
