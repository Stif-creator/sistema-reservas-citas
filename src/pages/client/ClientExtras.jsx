import { bookingBounds, dateError } from '../../lib/clientBooking'
import { useClientBusiness } from '../../context/client-context'
import DataList from '../../components/ui/DataList'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import useSprintData from '../../hooks/useSprintData'
import { bookingRequest } from '../../lib/bookingApi'
import { useAuth } from '../../context/auth-context'
import '../../components/booking/booking.css'

export default function ClientExtras() {
  const { membership } = useAuth()
  const { business } = useClientBusiness()
  const [dateIssue, setDateIssue] = useState('')
  const { data, error, busy, mutate } = useSprintData()
  const [options, setOptions] = useState(null), [loadError, setLoadError] = useState('')
  useEffect(() => { let active = true; bookingRequest({ action: 'options', businessId: membership.businessId }).then(r => { if (active) setOptions(r) }).catch(e => { if (active) setLoadError(e.message) }); return () => { active = false } }, [membership.businessId])
  async function wait(event) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget))
    const { today, maxDate } = bookingBounds(business.settings)
    const issue = dateError(values.date, today, maxDate); setDateIssue(issue)
    if (issue) return
    await mutate({ action: 'wait', ...values })
  }
  return <section className="booking-scope space-y-6"><h1>Favoritos y lista de espera</h1>{(error || loadError) && <p role="alert">{error || loadError}</p>}
    {!data && !error && <p role="status">Cargando preferencias…</p>}
    <div className="booking-panel"><h2>Mis favoritos</h2>{data?.favorites.length === 0 && <p>Aún no has marcado favoritos.</p>}<DataList label="Favoritos" items={data?.favorites || []}>{rows => <>{rows.map(f => <div className="flex gap-4 flex-wrap py-2" key={f.id}><span>{f.name} · {f.kind === 'service' ? 'Servicio' : 'Profesional'}</span><button disabled={busy} onClick={() => mutate({ action: 'favorite', kind: f.kind, targetId: f.targetId, enabled: false })}>Quitar favorito</button>{f.kind === 'service' && <Link to={`/cliente/reservar?servicio=${encodeURIComponent(f.targetId)}`}>Reservar</Link>}</div>)}</>}</DataList></div>
    <div className="booking-panel"><h2>Elegir favoritos</h2>{options && [['service', options.services], ['professional', options.professionals]].map(([kind, items]) => <div key={kind}><h3>{kind === 'service' ? 'Servicios' : 'Profesionales'}</h3><DataList label={kind === "service" ? "Servicios favoritos" : "Profesionales favoritos"} items={items}>{rows => <>{rows.map(item => { const selected = data?.favorites.some(f => f.kind === kind && f.targetId === item.id); return <button className="booking-button secondary m-1" key={item.id} disabled={busy || !data} aria-pressed={!!selected} onClick={() => mutate({ action: 'favorite', kind, targetId: item.id, enabled: !selected })}>{selected ? '♥ ' : '♡ '}{item.name || item.displayName}</button> })}</>}</DataList></div>)}</div>
    <div className="booking-panel"><h2>Lista de espera</h2><p>Registra tu interés por una fecha sin disponibilidad. Esto no confirma ni reserva una cita; puedes volver a consultar los horarios o retirar tu interés.</p>
      {options && <WaitForm settings={business.settings} issue={dateIssue} options={options} busy={busy} onSubmit={wait} />}
      {data?.waiting.length === 0 && <p>No tienes solicitudes en espera.</p>}
      <DataList label="Lista de espera" items={data?.waiting || []}>{rows => <>{rows.map(w => <article key={w.id} className="py-3"><strong>{w.serviceName}</strong><p>{w.professionalName} · {w.date}</p><button disabled={busy} onClick={() => mutate({ action: 'unwait', serviceId: w.serviceId, professionalId: w.professionalId, date: w.date })}>Retirar de la lista</button></article>)}</>}</DataList>
    </div>
  </section>
}
function WaitForm({ options, busy, onSubmit, settings, issue }) {
  const { today, maxDate } = bookingBounds(settings)
  const [service, setService] = useState('')
  return <form onSubmit={onSubmit} className="booking-fields"><label className="booking-field">Servicio<select name="serviceId" required value={service} onChange={e => setService(e.target.value)}><option value="">Seleccionar</option>{options.services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="booking-field">Profesional<select key={service} name="professionalId" required><option value="">Seleccionar</option>{options.professionals.filter(p => p.serviceIds.includes(service)).map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label><label className="booking-field">Fecha de interés<input type="date" name="date" required min={today} max={maxDate} aria-describedby="wait-date-help" /></label><p id="wait-date-help" role={issue ? "alert" : undefined}>{issue || "Elige una fecha futura dentro del plazo de reserva del negocio."}</p><button className="booking-button" disabled={busy}>Registrar interés</button></form>
}
