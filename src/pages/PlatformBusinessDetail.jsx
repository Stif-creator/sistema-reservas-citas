import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { collection, doc, getCountFromServer, getDoc, query, where } from 'firebase/firestore'
import { ArrowLeft, ArrowRight, Building2, CalendarDays, ExternalLink, Globe2, ShieldCheck } from 'lucide-react'
import { db } from '../firebase/config'
import { bookingRequest } from '../lib/bookingApi'
import { useFeedback } from '../context/feedback-context'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import '../components/superadmin.css'

export default function PlatformBusinessDetail() {
  const { businessId } = useParams()
  const navigate = useNavigate()
  const { confirm } = useFeedback()
  const [state, setState] = useState({ loading: true, error: '', business: null, reservations: 0 })
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try {
      const [businessSnap, reservationCount] = await Promise.all([
        getDoc(doc(db, 'businesses', businessId)),
        getCountFromServer(query(collection(db, 'reservations'), where('businessId', '==', businessId)))
      ])
      if (!businessSnap.exists()) throw new Error('No encontramos este negocio.')
      setState({ loading: false, error: '', business: { ...businessSnap.data(), id: businessSnap.id }, reservations: reservationCount.data().count })
    } catch (error) { setState({ loading: false, error: error.message || 'No se pudo cargar la supervisión.', business: null, reservations: 0 }) }
  }, [businessId])
  useEffect(() => { const timer = window.setTimeout(() => load(), 0); return () => window.clearTimeout(timer) }, [load])
  async function toggleStatus() {
    const business = state.business
    if (!business) return
    const next = business.status === 'active' ? 'inactive' : 'active'
    if (!await confirm({ title: next === 'inactive' ? '¿Suspender temporalmente el negocio?' : '¿Reactivar el negocio?', description: next === 'inactive' ? 'El negocio y sus miembros no podrán operar mientras esté desactivado. Se conservan todos los datos.' : 'El negocio recuperará el acceso según sus membresías existentes.', confirmLabel: next === 'inactive' ? 'Desactivar negocio' : 'Reactivar negocio' })) return
    setBusy(true)
    try { await bookingRequest({ action: 'platformStatus', businessId, status: next }); await load() }
    catch (error) { setState(previous => ({ ...previous, error: error.message || 'No se pudo actualizar el estado.' })) }
    finally { setBusy(false) }
  }
  if (state.loading) return <p role="status" className="platform-loading">Cargando supervisión…</p>
  if (!state.business) return <div><PageHeader title="Supervisión del negocio" description="Información general autorizada para la plataforma." /><p className="platform-alert" role="alert">{state.error}</p><Button variant="secondary" onClick={() => navigate('/plataforma/negocios')}><ArrowLeft size={16} />Volver a negocios</Button></div>
  const business = state.business
  const location = [business.location?.addressLine, business.location?.city, business.location?.stateRegion, business.location?.countryCode].filter(value => typeof value === 'string' && value.trim()).join(', ')
  const createdAt = business.createdAt?.toDate ? business.createdAt.toDate() : business.createdAt ? new Date(business.createdAt) : null
  const published = business.settings?.publicPageEnabled === true && business.status === 'active'
  return <div className="space-y-5">
    <Link className="platform-back-link" to="/plataforma/negocios"><ArrowLeft size={15} />Volver a negocios</Link>
    <PageHeader title={business.name || 'Negocio'} description="Vista de supervisión. Los servicios, reservas y perfiles operativos permanecen bajo la gestión del administrador." />
    {state.error && <p role="alert" className="platform-alert">{state.error}</p>}
    <section className="platform-detail-grid">
      <Card className="platform-panel"><div className="platform-business-identity"><span className="platform-detail-logo">{business.logo ? <img src={business.logo} alt={`Logo de ${business.name || 'negocio'}`} /> : <Building2 size={25} />}</span><div><h2>{business.name || business.id}</h2><p>{business.activityType || business.category || 'Tipo de negocio no configurado'}</p><span className={`platform-status ${business.status || ''}`}>{({ active: 'Activo', inactive: 'Desactivado', pending: 'Pendiente', deleted: 'Archivado' }[business.status] || 'Sin estado')}</span></div></div>
        <dl className="platform-detail-kv mt-6"><Detail label="Administrador responsable" value={business.administratorName} /><Detail label="Correo del administrador" value={business.administratorEmail} /><Detail label="Correo público" value={business.contact?.email} /><Detail label="Teléfono público" value={business.contact?.phone} /><Detail label="Categoría" value={business.activityType || business.category} /><Detail label="Ubicación pública" value={location} /><Detail label="Fecha de registro" value={createdAt && Number.isFinite(createdAt.getTime()) ? new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium' }).format(createdAt) : null} /><Detail label="Página pública" value={published ? 'Publicada' : 'No publicada'} /></dl>
        {business.description && <div className="platform-business-description"><h3>Descripción pública</h3><p>{business.description}</p></div>}
        <div className="flex flex-wrap gap-2 mt-5">{published && <a className="platform-link-button" href={`/b/${encodeURIComponent(business.id)}`} target="_blank" rel="noreferrer">Ver página pública <ExternalLink size={14} /></a>}<Button disabled={busy || business.status === 'deleted'} variant={business.status === 'active' ? 'secondary' : 'primary'} onClick={toggleStatus}>{busy ? 'Actualizando…' : business.status === 'active' ? 'Desactivar negocio' : 'Reactivar negocio'}</Button></div>
      </Card>
      <div className="space-y-4"><Card className="platform-panel"><div className="platform-panel-head"><div><h2>Indicadores agregados</h2><p>No se muestran datos personales de citas.</p></div><CalendarDays size={19} /></div><div className="platform-business-metric"><span>Reservas registradas</span><strong>{state.reservations}</strong></div><p className="platform-data-note">Conteo agregado de reservas de este negocio. Los documentos individuales no se descargan.</p></Card><Card className="platform-panel"><div className="platform-panel-head"><div><h2>Acceso y publicación</h2><p>Estado configurado para este negocio.</p></div><Globe2 size={19} /></div><div className="platform-access-row"><span><ShieldCheck size={17} /> Acceso operativo</span><strong>{business.status === 'active' ? 'Disponible' : 'Desactivado'}</strong></div><div className="platform-access-row"><span><Globe2 size={17} /> Página pública</span><strong>{published ? 'Publicada' : 'Oculta'}</strong></div></Card></div>
    </section>
    <p className="platform-note"><strong>Alcance de supervisión:</strong> no se habilita suplantación de identidad ni edición directa de reservas, precios, servicios o datos de clientes. Las acciones de estado pasan por el mecanismo administrativo existente.</p>
    <Link className="platform-link-button" to="/plataforma/actividad">Actividad de negocios <ArrowRight size={14} /></Link>
  </div>
}

function Detail({ label, value }) { return <div><dt>{label}</dt><dd>{value || 'No configurado'}</dd></div> }
