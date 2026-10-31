import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Clock3, Pause, Pencil, Plus, RefreshCw, Tag } from 'lucide-react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useAuth } from '../context/auth-context'
import { useFeedback } from '../context/feedback-context'
import useSprintData from '../hooks/useSprintData'
import { dateMillis, formatAppointmentDate } from '../lib/clientPresentation'
import { confirmDiscard, markFormSaved } from '../lib/unsavedForms'
import { db } from '../firebase/config'
import PageHeader from '../components/ui/PageHeader'
import Badge from '../components/ui/Badge'
import DataList from '../components/ui/DataList'
import EditorDialog from '../components/ui/EditorDialog'
import Alert from '../components/ui/Alert'
import '../components/booking/booking.css'
import './promotions.css'

const labels = { active: 'Activa', scheduled: 'Programada', expired: 'Vencida', disabled: 'Desactivada' }
const filterLabels = { all: 'Todas', ...labels }
const emptyPromotions = []

function promotionStatus(promotion, now) {
  if (promotion.isActive !== true) return 'disabled'
  const startAt = dateMillis(promotion.startAt), endAt = dateMillis(promotion.endAt)
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) return 'expired'
  if (now < startAt) return 'scheduled'
  return now < endAt ? 'active' : 'expired'
}

function utcDate(value) {
  const milliseconds = dateMillis(value)
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString().slice(0, 10) : ''
}

function endDateUtc(value) {
  const milliseconds = dateMillis(value)
  return Number.isFinite(milliseconds) ? new Date(milliseconds - 86400000).toISOString().slice(0, 10) : ''
}

function nextUtcDay(date) {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.getTime()
}

function dateLabel(value) {
  return formatAppointmentDate(value, 'UTC')
}

function money(value, currency = 'BOB') {
  try { return new Intl.NumberFormat('es-BO', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value) }
  catch { return `${currency} ${Number(value).toFixed(2)}` }
}

export default function Promotions() {
  const { membership } = useAuth()
  return <PromotionsView key={membership?.businessId || 'no-business'} businessId={membership?.businessId} />
}

function PromotionsView({ businessId }) {
  const { confirm, notify } = useFeedback()
  const { data, error, busy, mutate, reload, refreshing } = useSprintData()
  const [services, setServices] = useState([])
  const [servicesLoading, setServicesLoading] = useState(true)
  const [servicesError, setServicesError] = useState('')
  const [servicesAttempt, setServicesAttempt] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPromotion, setEditingPromotion] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [now, setNow] = useState(Date.now)
  const [reminderBusy, setReminderBusy] = useState(false)
  const reminderGuard = useRef(false)
  const promotions = data?.promotions || emptyPromotions

  useEffect(() => {
    return onSnapshot(query(collection(db, 'services'), where('businessId', '==', businessId)), snapshot => {
      setServices(snapshot.docs.map(item => ({ ...item.data(), id: item.id })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es')))
      setServicesError('')
      setServicesLoading(false)
    }, () => {
      setServicesError('No se pudieron cargar los servicios de este negocio.')
      setServicesLoading(false)
    })
  }, [businessId, servicesAttempt])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  const promotionsWithState = useMemo(() => promotions.map(promotion => ({ ...promotion, calculatedStatus: promotionStatus(promotion, now) })), [promotions, now])
  const counts = useMemo(() => promotionsWithState.reduce((total, promotion) => {
    total[promotion.calculatedStatus] += 1
    return total
  }, { active: 0, scheduled: 0, expired: 0, disabled: 0 }), [promotionsWithState])
  const visiblePromotions = statusFilter === 'all' ? promotionsWithState : promotionsWithState.filter(item => item.calculatedStatus === statusFilter)

  function openCreate() {
    setEditingPromotion(null)
    setDialogOpen(true)
  }

  function openEdit(promotion) {
    setEditingPromotion(promotion)
    setDialogOpen(true)
  }

  async function savePromotion(values, form) {
    const startAt = Date.parse(`${values.startDate}T00:00:00.000Z`)
    const endAt = nextUtcDay(values.endDate)
    const saved = await mutate({
      action: 'promotionSave',
      id: editingPromotion?.id || crypto.randomUUID(),
      title: values.title.trim(),
      serviceId: values.serviceId,
      percent: Number(values.percent),
      startAt,
      endAt,
      isActive: values.isActive,
    })
    if (!saved) return false
    markFormSaved(form, true)
    setDialogOpen(false)
    setEditingPromotion(null)
    notify({ title: editingPromotion ? 'Promoción actualizada' : 'Promoción guardada', message: 'La promoción se guardó correctamente.', type: 'success' })
    return true
  }

  async function togglePromotion(promotion) {
    const enable = promotion.isActive !== true
    if (!enable && !await confirm({ title: '¿Desactivar esta promoción?', description: 'Dejará de aplicarse a nuevas reservas. Se conservará en el historial del negocio.', confirmLabel: 'Desactivar' })) return
    const saved = await mutate({
      action: 'promotionSave', id: promotion.id, title: promotion.title, serviceId: promotion.serviceId,
      percent: promotion.percent, startAt: dateMillis(promotion.startAt), endAt: dateMillis(promotion.endAt), isActive: enable,
    })
    if (saved) notify({ title: enable ? 'Promoción activada' : 'Promoción desactivada', message: enable && promotionStatus({ ...promotion, isActive: true }, now) === 'expired' ? 'Sus fechas ya vencieron; seguirá apareciendo como vencida.' : enable ? 'Se aplicará según su vigencia.' : 'No se aplicará a nuevas reservas.', type: 'success' })
  }

  async function saveReminder(event) {
    event.preventDefault()
    if (reminderGuard.current) return
    const form = event.currentTarget
    const hours = Number(new FormData(form).get('hours'))
    reminderGuard.current = true
    setReminderBusy(true)
    try {
      if (await mutate({ action: 'reminderSave', hours })) {
        markFormSaved(form)
        notify({ title: 'Anticipación guardada', message: 'Se actualizaron los recordatorios internos y las reservas futuras.', type: 'success' })
      }
    } finally {
      reminderGuard.current = false
      setReminderBusy(false)
    }
  }

  const servicesAvailable = !servicesLoading && !servicesError && services.some(service => service.isActive)
  const serviceById = new Map(services.map(service => [service.id, service]))

  return <section className="booking-scope promotions-page">
    <PageHeader title="Promociones y recordatorios" description="Crea ofertas para tus servicios y configura los avisos de tus citas."
      actions={<button type="button" className="booking-button promotions-primary" onClick={openCreate} disabled={!servicesAvailable || busy}><Plus size={17} />Nueva promoción</button>} />
    {(error || servicesError) && <Alert tone="error">{error || servicesError}</Alert>}
    {servicesLoading && <p className="promotions-loading" role="status">Cargando servicios…</p>}

    {data && <div className="promotions-stats" aria-label="Resumen de promociones">
      <Stat icon={Tag} tone="green" count={counts.active} label="Activas" detail="Promociones vigentes" />
      <Stat icon={Clock3} tone="blue" count={counts.scheduled} label="Programadas" detail="Por comenzar" />
      <Stat icon={CalendarDays} tone="red" count={counts.expired} label="Vencidas" detail="Ya finalizaron" />
      <Stat icon={Pause} tone="slate" count={counts.disabled} label="Desactivadas" detail="No visibles para clientes" />
    </div>}

    <section className="promotions-list-panel" aria-label="Ofertas del negocio">
      <div className="promotions-list-heading"><div><h2>Ofertas del negocio</h2><p>Gestiona promociones, vigencias y estados.</p></div>
        <div className="promotions-tools"><label><span className="sr-only">Filtrar promociones por estado</span><select aria-label="Filtrar promociones por estado" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>{Object.entries(filterLabels).map(([value, label]) => <option key={value} value={value}>{value === 'all' ? 'Todos los estados' : label}</option>)}</select></label><button type="button" className="booking-button secondary promotions-refresh" onClick={() => { reload(); setServicesLoading(true); setServicesError(''); setServicesAttempt(attempt => attempt + 1) }} disabled={refreshing || busy || servicesLoading} aria-label="Actualizar promociones"><RefreshCw size={16} />{refreshing || servicesLoading ? 'Actualizando…' : 'Actualizar'}</button></div>
      </div>
      {!data && refreshing && <p className="promotions-loading" role="status">Cargando promociones…</p>}
      {data && <DataList label="Promociones" items={visiblePromotions} resetKey={statusFilter} searchText={promotion => `${promotion.title} ${promotion.serviceName || serviceById.get(promotion.serviceId)?.name || ''} ${promotion.percent} ${labels[promotion.calculatedStatus]}`}>
        {rows => <div className="promotions-list">{rows.map(promotion => <PromotionRow key={promotion.id} promotion={promotion} service={serviceById.get(promotion.serviceId)} onEdit={() => openEdit(promotion)} onToggle={() => togglePromotion(promotion)} busy={busy} />)}</div>}
      </DataList>}
    </section>

    {data && <form className="promotions-reminder-panel" onSubmit={saveReminder}>
      <div className="promotions-reminder-copy"><span className="promotions-reminder-icon"><Clock3 size={21} /></span><div><h2>Recordatorios internos</h2><p>Se programan avisos 24 y 1 hora antes. Puedes sumar otra anticipación; los avisos aparecen en CitasPro.</p><small>Al guardar, también se actualizan las reservas futuras existentes.</small></div></div>
      <div className="promotions-reminder-controls"><label>Horas de anticipación adicional<input name="hours" type="number" min="1" max="168" required defaultValue={data.reminderHours} /></label><button type="submit" className="booking-button promotions-primary" disabled={busy || reminderBusy}>{reminderBusy ? 'Guardando…' : 'Guardar anticipación'}</button></div>
    </form>}

    {dialogOpen && <PromotionDialog key={editingPromotion?.id || 'new-promotion'} promotion={editingPromotion} services={services} serverError={error} busy={busy} onClose={() => setDialogOpen(false)} onSave={savePromotion} />}
  </section>
}

function Stat({ icon: Icon, tone, count, label, detail }) {
  return <article className={`promotions-stat promotions-stat-${tone}`}><span className="promotions-stat-icon"><Icon size={21} /></span><div><strong>{count}</strong><b>{label}</b><small>{detail}</small></div></article>
}

function PromotionRow({ promotion, service, onEdit, onToggle, busy }) {
  const status = promotion.calculatedStatus
  const active = promotion.isActive === true
  return <article className="promotions-row">
    <span className="promotions-discount"><strong>{promotion.percent}%</strong><small>descuento</small></span>
    <div className="promotions-row-main"><h3>{promotion.title || 'Promoción sin título'}</h3><p className="promotions-service">{service?.name || promotion.serviceName || 'Servicio no disponible'}</p></div>
    <div className="promotions-row-state"><Badge className={`promotion-status promotion-status-${status}`}>{labels[status]}</Badge><span><CalendarDays size={15} />{dateLabel(promotion.startAt)} <i>–</i> {dateLabel(dateMillis(promotion.endAt) - 1)}</span></div>
    <div className="promotions-row-actions"><button type="button" className="booking-button secondary" onClick={onEdit} disabled={busy}><Pencil size={15} />Editar</button><button type="button" className={`booking-button ${active ? 'promotions-danger' : 'promotions-enable'}`} onClick={onToggle} disabled={busy}>{active ? <><Pause size={15} />Desactivar</> : <><Plus size={15} />Activar</>}</button></div>
  </article>
}

function PromotionDialog({ promotion, services, serverError, busy, onClose, onSave }) {
  const { confirm } = useFeedback()
  const formRef = useRef(null)
  const [draft, setDraft] = useState(() => ({
    title: promotion?.title || '',
    serviceId: promotion?.serviceId || '',
    percent: promotion?.percent ?? 10,
    startDate: utcDate(promotion?.startAt),
    endDate: endDateUtc(promotion?.endAt),
    isActive: promotion?.isActive ?? true,
  }))
  const [fieldErrors, setFieldErrors] = useState({})
  const selectedService = services.find(service => service.id === draft.serviceId)
  const price = Number(selectedService?.price)
  const percent = Number(draft.percent)
  const hasPreview = selectedService?.isActive === true && Number.isFinite(price) && price > 0 && Number.isInteger(percent) && percent >= 1 && percent <= 90
  const discountedPrice = hasPreview ? Math.max(0.01, Math.round(price * (100 - percent)) / 100) : null
  const currency = selectedService?.currencyCode || 'BOB'

  async function cancel() {
    if (await confirmDiscard(formRef.current, confirm)) onClose()
  }

  async function submit(event) {
    event.preventDefault()
    const form = event.currentTarget
    const nextErrors = {}
    if (!draft.title.trim()) nextErrors.title = 'Ingresa el título de la promoción.'
    if (!draft.serviceId || !services.some(service => service.id === draft.serviceId && (service.isActive || service.id === promotion?.serviceId))) nextErrors.serviceId = 'Selecciona un servicio activo de este negocio.'
    if (!Number.isInteger(percent) || percent < 1 || percent > 90) nextErrors.percent = 'El descuento debe ser un número entero entre 1 y 90.'
    if (!draft.startDate) nextErrors.startDate = 'Selecciona la fecha de inicio.'
    if (!draft.endDate) nextErrors.endDate = 'Selecciona la fecha de finalización.'
    if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) nextErrors.endDate = 'La fecha final debe ser igual o posterior a la inicial.'
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    await onSave(draft, form)
  }

  function change(name, value) {
    setDraft(current => ({ ...current, [name]: value }))
    setFieldErrors(current => ({ ...current, [name]: '' }))
  }

  return <EditorDialog title={promotion ? 'Editar promoción' : 'Nueva promoción'} onClose={onClose} busy={busy}>
    <form ref={formRef} className="promotions-form" onSubmit={submit} noValidate>
      <p className="promotions-form-intro">Configura el descuento y su período de vigencia.</p>
      <label className="promotions-field promotions-field-wide">Título <em>*</em><input name="title" value={draft.title} maxLength={100} required onChange={event => change('title', event.target.value)} placeholder="Ej. Limpieza dental de fin de mes" aria-invalid={!!fieldErrors.title} />{fieldErrors.title && <small className="promotions-field-error">{fieldErrors.title}</small>}</label>
      <label className="promotions-field promotions-field-wide">Servicio <em>*</em><select name="serviceId" value={draft.serviceId} required onChange={event => change('serviceId', event.target.value)} aria-invalid={!!fieldErrors.serviceId}><option value="">Seleccionar servicio</option>{services.filter(service => service.isActive || service.id === promotion?.serviceId).map(service => <option key={service.id} value={service.id}>{service.name}{service.isActive ? '' : ' (inactivo)'}</option>)}</select>{fieldErrors.serviceId && <small className="promotions-field-error">{fieldErrors.serviceId}</small>}</label>
      <label className="promotions-field">Descuento (%) <em>*</em><input name="percent" type="number" min="1" max="90" step="1" value={draft.percent} required onChange={event => change('percent', event.target.value)} aria-invalid={!!fieldErrors.percent} />{fieldErrors.percent && <small className="promotions-field-error">{fieldErrors.percent}</small>}</label>
      <label className="promotions-field">Desde <em>*</em><input name="startDate" type="date" value={draft.startDate} required onChange={event => change('startDate', event.target.value)} aria-invalid={!!fieldErrors.startDate} />{fieldErrors.startDate && <small className="promotions-field-error">{fieldErrors.startDate}</small>}</label>
      <label className="promotions-field">Hasta (incluido) <em>*</em><input name="endDate" type="date" min={draft.startDate || undefined} value={draft.endDate} required onChange={event => change('endDate', event.target.value)} aria-invalid={!!fieldErrors.endDate} />{fieldErrors.endDate && <small className="promotions-field-error">{fieldErrors.endDate}</small>}</label>
      <label className="promotions-toggle"><input name="isActive" type="checkbox" checked={draft.isActive} onChange={event => change('isActive', event.target.checked)} /><span><strong>Promoción habilitada</strong><small>La oferta se aplicará dentro de sus fechas si el servicio sigue disponible.</small></span></label>

      <section className="promotions-preview" aria-label="Vista previa del descuento"><div><h3>Vista previa del descuento</h3><p>Se calcula con el precio actual del servicio seleccionado.</p></div>{hasPreview ? <div className="promotions-preview-card"><span className="promotions-discount"><strong>{percent}%</strong><small>descuento</small></span><div><strong>{selectedService.name}</strong><span>Precio original: <s>{money(price, currency)}</s></span><b>Precio con descuento: {money(discountedPrice, currency)}</b></div></div> : <p className="promotions-preview-empty">Selecciona un servicio con precio y un descuento válido para ver el cálculo.</p>}<small className="promotions-preview-note">El precio definitivo se vuelve a validar al confirmar la reserva.</small></section>

      <section className="promotions-state-guide"><h3>Estados de una promoción</h3><div>{Object.entries(labels).map(([state, label]) => <span key={state} className={`promotion-guide promotion-status-${state}`}><Badge className={`promotion-status promotion-status-${state}`}>{label}</Badge><small>{state === 'active' ? 'Vigente ahora.' : state === 'scheduled' ? 'Comenzará en la fecha indicada.' : state === 'expired' ? 'Ya terminó su vigencia.' : 'Deshabilitada por el administrador.'}</small></span>)}</div></section>
      {serverError && <Alert tone="error">{serverError}</Alert>}
      <footer className="promotions-form-actions"><button type="button" className="booking-button secondary" onClick={cancel} disabled={busy}>Cancelar</button><button type="submit" className="booking-button promotions-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar promoción'}</button></footer>
    </form>
  </EditorDialog>
}
