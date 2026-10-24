import { markFormSaved, confirmDiscard } from '../lib/unsavedForms'
import PageHeader from '../components/ui/PageHeader'
import Badge from '../components/ui/Badge'
import DataList from '../components/ui/DataList'
import { useEffect, useState } from 'react'
import useSprintData from '../hooks/useSprintData'
import { useAuth } from '../context/auth-context'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import '../components/booking/booking.css'
import { useFeedback } from '../context/feedback-context'

export default function Promotions() {
  const { confirm } = useFeedback()
  const { data, error, busy, mutate, reload, refreshing } = useSprintData()
  const { membership } = useAuth()
  const [services, setServices] = useState([]), [selected, setSelected] = useState(null), [message, setMessage] = useState(''), [loadError, setLoadError] = useState('')
  const [servicesLoading, setServicesLoading] = useState(true), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    return onSnapshot(query(collection(db, 'services'), where('businessId', '==', membership.businessId)), snapshot => {
      setServices(snapshot.docs.map(d => ({ ...d.data(), id: d.id })).sort((a,b) => (a.name || '').localeCompare(b.name || '')))
      setLoadError(''); setServicesLoading(false)
    }, () => { setLoadError('No se pudieron cargar los servicios de Firestore. Comprueba tu sesión y las reglas publicadas.'); setServicesLoading(false) })
  }, [membership.businessId, attempt])
  async function save(e) {
    e.preventDefault(); const v = Object.fromEntries(new FormData(e.currentTarget)); setMessage('')
    if (await mutate({ action:'promotionSave', id:selected?.id || crypto.randomUUID(), title:v.title, serviceId:v.serviceId, percent:Number(v.percent), startAt:Date.parse(v.startAt + 'T00:00:00Z'), endAt:Date.parse(v.endAt + 'T00:00:00Z') + 86400000, isActive:v.isActive === 'on' })) { setSelected(null); markFormSaved(e.target, true); setMessage('Promoción guardada.') }
  }
  return <section className="booking-scope space-y-5"><PageHeader title="Promociones y recordatorios" description="Crea ofertas para tus servicios y configura los avisos de tus citas." />{error && <p role="alert">{error}</p>}{loadError && <p role="alert">{loadError}</p>}{message && <p role="status">{message}</p>}
    <button type="button" className="booking-button secondary" disabled={refreshing || busy} onClick={() => { reload(); setAttempt(v => v + 1); setServicesLoading(true) }}>{refreshing ? 'Conectando con el servidor…' : 'Actualizar datos'}</button>
    {servicesLoading && <p role="status">Cargando servicios…</p>}
    {!servicesLoading && !loadError && services.length === 0 && <p className="panel-empty">No hay servicios en este negocio. Crea uno desde Servicios para asociarle una promoción.</p>}
    <form className="booking-panel booking-fields admin-form-grid" key={selected?.id || message} onSubmit={save}><h2>{selected ? 'Editar promoción' : 'Nueva promoción'}</h2><p>Vigencia por días UTC. Si hay varias promociones aplicables se utiliza el mayor descuento, sin acumularlos. El precio se valida nuevamente al reservar.</p>
      <label className="booking-field">Título<input name="title" required maxLength={100} defaultValue={selected?.title} /></label><label className="booking-field">Servicio<select name="serviceId" required disabled={servicesLoading || !!loadError} defaultValue={selected?.serviceId || ''}><option value="">Seleccionar</option>{services.map(s => <option key={s.id} value={s.id}>{s.name}{s.isActive ? '' : ' (inactivo)'}</option>)}</select></label><label className="booking-field">Descuento (%)<input type="number" name="percent" min="1" max="90" required defaultValue={selected?.percent || 10} /></label>
      <label className="booking-field">Desde<input name="startAt" type="date" required defaultValue={selected ? new Date(selected.startAt).toISOString().slice(0,10) : ''} /></label><label className="booking-field">Hasta (incluido)<input name="endAt" type="date" required defaultValue={selected ? new Date(selected.endAt - 1).toISOString().slice(0,10) : ''} /></label><label><input name="isActive" type="checkbox" defaultChecked={selected?.isActive ?? true} /> Activa</label><button className="booking-button" disabled={busy}>Guardar promoción</button>{selected && <button className="booking-button secondary" type="button" onClick={async () => { if (await confirmDiscard(document, confirm)) setSelected(null) }}>Cancelar edición</button>}
    </form>
    <div className="admin-list-panel"><h2>Ofertas del negocio</h2><DataList label="Promociones" items={data?.promotions || []} searchText={p => `${p.title} ${p.serviceName} ${p.percent} ${p.isActive ? "Activa" : "Inactiva"}`}>{rows => <>{rows.map(p => <article className="booking-panel admin-promotion" key={p.id}><span className="admin-discount">{p.percent}%<small>descuento</small></span><h2>{p.title}</h2><p>{p.serviceName} · <Badge tone={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'Activa' : 'Inactiva'}</Badge></p><button className="booking-button secondary" onClick={async () => { if (!await confirmDiscard(document, confirm)) return; setSelected(p); setMessage('') }}>Editar promoción</button></article>)}</>}</DataList></div>
    {data && <form className="booking-panel booking-fields" key={`reminder-${data.reminderHours}`} onSubmit={async e => { e.preventDefault(); const hours = Number(new FormData(e.currentTarget).get('hours')); if (await mutate({ action:'reminderSave', hours })) { markFormSaved(e.target); setMessage('Anticipación de recordatorios guardada.') } }}><h2>Recordatorios internos</h2><p>Siempre se programan avisos 24 horas y 1 hora antes. Puedes sumar otra anticipación. Guardar actualiza también las reservas futuras existentes. Se muestran en Avisos antes de la cita. No envían correo, SMS ni notificaciones con el navegador cerrado.</p><label className="booking-field">Horas de anticipación<input name="hours" type="number" min="1" max="168" required defaultValue={data.reminderHours} /></label><button className="booking-button" disabled={busy}>Guardar anticipación</button></form>}
  </section>
}
