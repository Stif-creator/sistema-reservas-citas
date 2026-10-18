import PersonAvatar from '../components/ui/PersonAvatar'
import PageHeader from '../components/ui/PageHeader'
import DataList from '../components/ui/DataList'
import Alert from '../components/ui/Alert'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import useSprintData from '../hooks/useSprintData'
import { formatAppointmentDate, reservationStatuses } from '../lib/clientPresentation'
import '../components/booking/booking.css'

export default function Clients() {
  const { data, error, busy, mutate, reload, refreshing } = useSprintData('clients')
  const [selected, setSelected] = useState(null), [message, setMessage] = useState('')
  async function save(e) {
    e.preventDefault(); const values = Object.fromEntries(new FormData(e.currentTarget)); setMessage('')
    if (await mutate({ action: 'clientUpdate', id: selected.id, ...values })) { setSelected({ ...selected, ...values }); setMessage('Datos de contacto guardados.') }
  }
  return <section className="booking-scope space-y-5"><PageHeader title="Clientes" description="Consulta los datos de contacto y el historial de citas de tus clientes." />{error && <Alert tone="error">{error}</Alert>}{message && <Alert tone="success">{message}</Alert>}
    <button type="button" className="booking-button secondary" disabled={refreshing || busy} onClick={reload}>{refreshing ? 'Conectando con el servidor…' : 'Actualizar clientes'}</button>
    {!data && !error && <p role="status" className="panel-loading">Cargando clientes…</p>}
    <div className="admin-list-panel"><DataList label="Clientes" items={data?.clients || []} searchText={c => `${c.firstName} ${c.lastName} ${c.email} ${c.phone}`}>{rows => <><div className="booking-choices">{rows.map(c => <button className="booking-choice" key={c.id} onClick={() => { setSelected(c); setMessage('') }}><PersonAvatar name={`${c.firstName} ${c.lastName}`} /><strong>{c.firstName} {c.lastName}</strong><span>{c.phone}</span><span>{c.email}</span><span>Editar y ver historial</span></button>)}</div></>}</DataList></div>
    {data?.clients.length === 0 && <p className="panel-empty">Aún no hay clientes.</p>}
    {selected && <div className="admin-detail-grid"><form className="booking-panel booking-fields" key={selected.id} onSubmit={save}><h2>Datos del cliente</h2>{[['firstName','Nombre','text'],['lastName','Apellido','text'],['phone','Teléfono','tel'],['email','Correo de contacto','email']].map(([key,label,type]) => <label className="booking-field" key={key}>{label}<input name={key} type={type} defaultValue={selected[key] || ''} required={['firstName','phone'].includes(key)} maxLength={key === 'email' ? 254 : 100} /></label>)}<button className="booking-button" disabled={busy}>Guardar cliente</button></form><div className="booking-panel"><h2>Historial del cliente</h2><DataList label="Historial del cliente" items={data?.reservations.filter(r => r.clientId === selected.id) || []} key={selected.id} searchText={r => `${r.serviceName} ${formatAppointmentDate(r.startAt,r.timeZone)} ${reservationStatuses[r.status]}`}>{rows => <>{rows.map(r => <p className="admin-history-item" key={r.id}><Link to={`/reservas/${r.id}`}>{r.serviceName} · {formatAppointmentDate(r.startAt,r.timeZone)} · {reservationStatuses[r.status]}</Link></p>)}</>}</DataList>{!data?.reservations.some(r => r.clientId === selected.id) && <p className="panel-empty">Sin reservas registradas.</p>}</div></div>}
  </section>
}
