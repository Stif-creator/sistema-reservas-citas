import { useState } from 'react'
import { Link } from 'react-router-dom'
import useSprintData from '../hooks/useSprintData'
import { formatAppointmentDate, reservationStatuses } from '../lib/clientPresentation'
import '../components/booking/booking.css'

export default function Clients() {
  const { data, error, busy, mutate } = useSprintData('clients')
  const [selected, setSelected] = useState(null), [search, setSearch] = useState(''), [message, setMessage] = useState('')
  async function save(e) {
    e.preventDefault(); const values = Object.fromEntries(new FormData(e.currentTarget)); setMessage('')
    if (await mutate({ action: 'clientUpdate', id: selected.id, ...values })) { setSelected({ ...selected, ...values }); setMessage('Datos de contacto guardados.') }
  }
  return <section className="booking-scope space-y-5"><h1>Clientes</h1><p>Administra los datos de contacto de este negocio. El correo de acceso y la cuenta personal del cliente se conservan.</p>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <label className="booking-field">Buscar cliente<input value={search} onChange={e => setSearch(e.target.value)} /></label>
    {!data && !error && <p role="status">Cargando clientes…</p>}
    <div className="booking-choices">{data?.clients.filter(c => `${c.firstName} ${c.lastName} ${c.email} ${c.phone}`.toLowerCase().includes(search.toLowerCase())).map(c => <button className="booking-choice" key={c.id} onClick={() => { setSelected(c); setMessage('') }}><strong>{c.firstName} {c.lastName}</strong><span>{c.phone}</span><span>{c.email}</span><span>Editar y ver historial</span></button>)}</div>
    {data?.clients.length === 0 && <p>Aún no hay clientes.</p>}
    {selected && <><form className="booking-panel booking-fields" key={selected.id} onSubmit={save}><h2>Datos del cliente</h2>{[['firstName','Nombre','text'],['lastName','Apellido','text'],['phone','Teléfono','tel'],['email','Correo de contacto','email']].map(([key,label,type]) => <label className="booking-field" key={key}>{label}<input name={key} type={type} defaultValue={selected[key] || ''} required={['firstName','phone'].includes(key)} maxLength={key === 'email' ? 254 : 100} /></label>)}<button className="booking-button" disabled={busy}>Guardar cliente</button></form><div className="booking-panel"><h2>Historial del cliente</h2>{data?.reservations.filter(r => r.clientId === selected.id).map(r => <p key={r.id}><Link to={`/reservas/${r.id}`}>{r.serviceName} · {formatAppointmentDate(r.startAt,r.timeZone)} · {reservationStatuses[r.status]}</Link></p>)}{!data?.reservations.some(r => r.clientId === selected.id) && <p>Sin reservas registradas.</p>}</div></>}
  </section>
}
