import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import useSprintData from '../../hooks/useSprintData'
import { bookingRequest } from '../../lib/bookingApi'
import { useAuth } from '../../context/auth-context'
import '../../components/booking/booking.css'

export default function ClientExtras() {
  const { membership } = useAuth()
  const { data, error, busy, mutate } = useSprintData()
  const [options, setOptions] = useState(null), [loadError, setLoadError] = useState('')
  useEffect(() => { let active = true; bookingRequest({ action: 'options', businessId: membership.businessId }).then(r => { if (active) setOptions(r) }).catch(e => { if (active) setLoadError(e.message) }); return () => { active = false } }, [membership.businessId])
  async function wait(event) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget))
    await mutate({ action: 'wait', ...values })
  }
  return <section className="booking-scope space-y-6"><h1>Favoritos y lista de espera</h1>{(error || loadError) && <p role="alert">{error || loadError}</p>}
    {!data && !error && <p role="status">Cargando preferencias…</p>}
    <div className="booking-panel"><h2>Mis favoritos</h2>{data?.favorites.length === 0 && <p>Aún no has marcado favoritos.</p>}{data?.favorites.map(f => <div className="flex gap-4 flex-wrap py-2" key={f.id}><span>{f.name} · {f.kind === 'service' ? 'Servicio' : 'Profesional'}</span><button disabled={busy} onClick={() => mutate({ action: 'favorite', kind: f.kind, targetId: f.targetId, enabled: false })}>Quitar favorito</button>{f.kind === 'service' && <Link to={`/cliente/reservar?servicio=${encodeURIComponent(f.targetId)}`}>Reservar</Link>}</div>)}</div>
    <div className="booking-panel"><h2>Elegir favoritos</h2>{options && [['service', options.services], ['professional', options.professionals]].map(([kind, items]) => <div key={kind}><h3>{kind === 'service' ? 'Servicios' : 'Profesionales'}</h3>{items.map(item => { const selected = data?.favorites.some(f => f.kind === kind && f.targetId === item.id); return <button className="booking-button secondary m-1" key={item.id} disabled={busy || !data} aria-pressed={!!selected} onClick={() => mutate({ action: 'favorite', kind, targetId: item.id, enabled: !selected })}>{selected ? '♥ ' : '♡ '}{item.name || item.displayName}</button> })}</div>)}</div>
    <div className="booking-panel"><h2>Lista de espera</h2><p>Registra tu interés por una fecha sin disponibilidad. Esto no confirma ni reserva una cita; puedes volver a consultar los horarios o retirar tu interés.</p>
      {options && <WaitForm options={options} busy={busy} onSubmit={wait} />}
      {data?.waiting.length === 0 && <p>No tienes solicitudes en espera.</p>}
      {data?.waiting.map(w => <article key={w.id} className="py-3"><strong>{w.serviceName}</strong><p>{w.professionalName} · {w.date}</p><button disabled={busy} onClick={() => mutate({ action: 'unwait', serviceId: w.serviceId, professionalId: w.professionalId, date: w.date })}>Retirar de la lista</button></article>)}
    </div>
  </section>
}
function WaitForm({ options, busy, onSubmit }) {
  const [service, setService] = useState('')
  return <form onSubmit={onSubmit} className="booking-fields"><label className="booking-field">Servicio<select name="serviceId" required value={service} onChange={e => setService(e.target.value)}><option value="">Seleccionar</option>{options.services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="booking-field">Profesional<select key={service} name="professionalId" required><option value="">Seleccionar</option>{options.professionals.filter(p => p.serviceIds.includes(service)).map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label><label className="booking-field">Fecha de interés<input type="date" name="date" required /></label><button className="booking-button" disabled={busy}>Registrar interés</button></form>
}
