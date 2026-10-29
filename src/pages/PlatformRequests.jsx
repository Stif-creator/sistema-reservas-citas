import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, ClipboardList, Eye, Search, ShieldCheck, X } from 'lucide-react'
import { useAuth } from '../context/auth-context'
import { bookingRequest } from '../lib/bookingApi'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import './platform-requests.css'

const statusLabel = { pending: 'Pendiente', in_review: 'En revisión', needs_info: 'Información solicitada', approved: 'Aprobada', rejected: 'Rechazada' }
const dateLabel = value => { const date = value?.toDate?.() || (value?._seconds ? new Date(value._seconds * 1000) : value ? new Date(value) : null); return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium' }).format(date) : '—' }

export default function PlatformRequests() {
  const { isSuperadmin } = useAuth()
  const [status, setStatus] = useState(''), [cursor, setCursor] = useState(null), [history, setHistory] = useState([]), [search, setSearch] = useState('')
  const [data, setData] = useState(null), [selected, setSelected] = useState(null), [note, setNote] = useState(''), [initialPassword, setInitialPassword] = useState(''), [generatedPassword, setGeneratedPassword] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
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
    if (!selected) return
    setBusy(true); setError(''); setMessage(''); setGeneratedPassword('')
    try {
      const result = await bookingRequest({ action, requestId: selected.id, ...values })
      setMessage(action === 'businessRequestApprove' ? `Solicitud aprobada. Negocio creado: ${result.businessId}` : `Solicitud actualizada: ${statusLabel[result.status]}.`)
      if (result.generatedPassword) setGeneratedPassword(result.generatedPassword)
      setNote(''); await load(cursor); setSelected(null)
    } catch (failure) { setError(failure.message || 'No se pudo actualizar la solicitud.') }
    finally { setBusy(false) }
  }
  function page(next) { if (!next) return; setHistory(old => [...old, cursor]); setCursor(next); load(next) }
  function previous() { const nextHistory = [...history]; const prior = nextHistory.pop() || null; setHistory(nextHistory); setCursor(prior); load(prior) }
  return <div className="platform-requests"><PageHeader title="Solicitudes de negocios" description="Revisa los datos recibidos y autoriza la creación de negocios en CitasPro." />
    <div className="request-stat-grid">{[['Total', data?.counts?.total], ['Pendientes', data?.counts?.pending], ['En revisión', data?.counts?.in_review], ['Aprobadas', data?.counts?.approved], ['Rechazadas', data?.counts?.rejected]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value ?? '—'}</strong></article>)}</div>
    {error && <Alert tone="error">{error}</Alert>}{message && <Alert tone="success">{message}{generatedPassword && <div className="mt-2">Contraseña inicial (entrégala directamente al solicitante): <code className="select-all">{generatedPassword}</code></div>}</Alert>}
    <section className="request-list-card"><div className="request-list-tools"><label><Search size={16} /><input aria-label="Buscar solicitudes" value={search} onChange={e => { setSearch(e.target.value); setCursor(null); setHistory([]) }} placeholder="Buscar negocio o solicitante" /></label><select aria-label="Filtrar estado" value={status} onChange={e => { setStatus(e.target.value); setCursor(null); setHistory([]) }}><option value="">Todos los estados</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Button variant="secondary" disabled={busy} onClick={() => load(cursor)}>Actualizar</Button></div>
      {busy && !data ? <p className="platform-empty">Cargando solicitudes…</p> : items.length ? <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Negocio</th><th>Solicitante</th><th>Rubro</th><th>Ciudad</th><th>Fecha</th><th>Estado</th><th /></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><strong>{item.business?.name}</strong></td><td>{item.applicant?.firstName} {item.applicant?.lastName}</td><td>{item.business?.category}</td><td>{item.business?.city}</td><td>{dateLabel(item.createdAt)}</td><td><span className={`request-status ${item.status}`}>{statusLabel[item.status] || item.status}</span></td><td><Button variant="secondary" onClick={() => { setSelected(item); setNote('') }}><Eye size={15} />Ver detalles</Button></td></tr>)}</tbody></table></div> : <p className="platform-empty">No encontramos solicitudes para estos filtros.</p>}
      <footer className="request-pagination"><span>Se muestran hasta 20 solicitudes por página.</span><div><Button variant="secondary" disabled={!history.length || busy} onClick={previous}><ChevronLeft size={16} />Anterior</Button><Button variant="secondary" disabled={!data?.nextCursor || busy} onClick={() => page(data.nextCursor)}>Siguiente<ChevronRight size={16} /></Button></div></footer>
    </section>
    {selected && <div className="request-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null) }}><section className="request-modal" role="dialog" aria-modal="true" aria-labelledby="request-detail-title"><header><div><ClipboardList /><h2 id="request-detail-title">{selected.business?.name}</h2></div><button aria-label="Cerrar" onClick={() => setSelected(null)}><X /></button></header><div className="request-detail-grid"><p><b>Solicitante</b>{selected.applicant?.firstName} {selected.applicant?.lastName}</p><p><b>Correo</b><a href={`mailto:${selected.applicant?.email}`}>{selected.applicant?.email}</a></p><p><b>Teléfono</b><a href={`tel:${selected.applicant?.phone}`}>{selected.applicant?.phone}</a></p><p><b>Categoría / ciudad</b>{selected.business?.category} · {selected.business?.city}</p><p className="wide"><b>Descripción</b>{selected.business?.description}</p><p className="wide"><b>Sitio o redes</b>{selected.business?.website || 'No proporcionado'}</p><p><b>Estado</b>{statusLabel[selected.status]}</p><p><b>Fecha de solicitud</b>{dateLabel(selected.createdAt)}</p></div><div className="request-detail-colors">{Object.entries(selected.appearance || {}).map(([label, color]) => <span key={label} title={`${label}: ${color}`} style={{ background: color }} />)}</div><div className="request-detail-images">{['logo', 'cover'].map(key => selected.images?.[key]?.url && <a key={key} href={selected.images[key].url} target="_blank" rel="noreferrer"><img src={selected.images[key].url} loading="lazy" alt={`${key} propuesto`} />Ver {key}</a>)}</div>{selected.reviewNote && <p className="request-review-note"><b>Última observación</b>{selected.reviewNote}</p>}
      {!['approved', 'rejected'].includes(selected.status) && <><label className="request-note">Observación para el solicitante<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} rows={3} placeholder="Motivo del rechazo o información requerida" /></label><label className="request-note">Contraseña inicial si el correo aún no tiene cuenta (12 caracteres o más)<input type="password" autoComplete="new-password" value={initialPassword} onChange={e => setInitialPassword(e.target.value)} maxLength={128} /></label><div className="request-actions"><Button variant="secondary" disabled={busy} onClick={() => act('businessRequestReview', { status: 'in_review', note: '' })}><ShieldCheck size={15} />Marcar en revisión</Button><Button variant="secondary" disabled={busy || note.trim().length < 5} onClick={() => act('businessRequestReview', { status: 'needs_info', note })}>Solicitar información</Button><Button variant="secondary" disabled={busy || note.trim().length < 5} onClick={() => window.confirm('¿Rechazar esta solicitud?') && act('businessRequestReview', { status: 'rejected', note })}><X size={15} />Rechazar</Button><Button disabled={busy} onClick={() => window.confirm('Aprobar y crear el negocio con página pública desactivada. ¿Continuar?') && act('businessRequestApprove', { initialPassword })}><Check size={15} />Aprobar solicitud</Button></div></>}
      <div className="request-review-history"><b>Historial de revisión</b>{(selected.reviewHistory || []).map((event, index) => <p key={index}>{statusLabel[event.status] || event.status} · {dateLabel(event.at)}{event.note ? ` · ${event.note}` : ''}</p>)}</div>
      </section></div>}
  </div>
}
