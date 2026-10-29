import { useEffect, useState } from 'react'
import { collection, doc, getDoc, getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { bookingRequest } from '../lib/bookingApi'
import { useFeedback } from '../context/feedback-context'
import Card from './ui/Card'
import Button from './ui/Button'
import Alert from './ui/Alert'

export default function PlatformBusinessAdministration({ business, onStatusChange }) {
  const { confirm } = useFeedback()
  const [page, setPage] = useState({ cursors: [null], index: 0 })
  const [result, setResult] = useState({ items: [], loading: true })
  const [owner, setOwner] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    const cursor = page.cursors[page.index]
    getDocs(query(collection(db, 'memberships'), where('businessId', '==', business.id), where('role', '==', 'admin'), orderBy('userId'), ...(cursor ? [startAfter(cursor)] : []), limit(11)))
      .then(snapshot => { if (live) setResult({ items: snapshot.docs.slice(0, 10).map(item => ({ ...item.data(), id: item.id })), next: snapshot.size > 10 ? snapshot.docs[9] : null, loading: false }) })
      .catch(() => { if (live) { setResult({ items: [], loading: false }); setError('No se pudieron consultar las asignaciones. Comprueba permisos e índices.') } })
    return () => { live = false }
  }, [business.id, page])
  useEffect(() => {
    let live = true
    if (business.ownerUserId) getDoc(doc(db, 'users', business.ownerUserId))
      .then(snapshot => { if (live) setOwner(snapshot.data() || null) })
      .catch(() => { if (live) setError('No se pudo consultar el perfil del responsable.') })
    return () => { live = false }
  }, [business.ownerUserId])
  async function changeStatus() {
    const status = business.status === 'active' ? 'inactive' : 'active'
    if (!await confirm({ title: status === 'inactive' ? '¿Desactivar este negocio?' : '¿Activar este negocio?', description: 'El estado controla el acceso del negocio y de sus miembros. Se conservarán los datos.', confirmLabel: status === 'inactive' ? 'Desactivar negocio' : 'Activar negocio' })) return
    setBusy(true); setError('')
    try { await bookingRequest({ action: 'platformStatus', businessId: business.id, status }); onStatusChange(status) }
    catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  return <div className="space-y-5">
    {error && <Alert tone="error">{error}</Alert>}
    <div className="settings-columns"><Card title="Administrador responsable"><p>{[owner?.firstName, owner?.lastName].filter(Boolean).join(' ') || business.administratorName || business.ownerUserId || 'Sin responsable registrado'}</p><p className="text-sm text-muted break-words">{owner?.email || business.administratorEmail}</p></Card>
      <Card title="Estado del negocio"><p className="mb-4">{({ active: 'Activo', inactive: 'Desactivado', deleted: 'Archivado' })[business.status] || 'Sin estado'}</p><Button disabled={busy} onClick={changeStatus}>{busy ? 'Actualizando…' : business.status === 'active' ? 'Desactivar negocio' : business.status === 'deleted' ? 'Restaurar negocio' : 'Activar negocio'}</Button></Card></div>
    <Card title="Administradores asignados" description="Asignaciones registradas para este negocio.">
      {result.loading ? <p role="status">Cargando administradores…</p> : <>
        <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Nombre</th><th>Correo</th><th>Estado</th></tr></thead><tbody>{result.items.map(item => <tr key={item.id}><td>{[item.firstName, item.lastName].filter(Boolean).join(' ') || (item.userId === business.ownerUserId ? business.administratorName : '') || item.userId}{item.userId === business.ownerUserId && <small className="block">Responsable</small>}</td><td>{item.email || 'Sin correo en la membresía'}</td><td>{item.status === 'active' ? 'Activo' : item.status === 'pending' ? 'Pendiente' : 'Inactivo'}</td></tr>)}</tbody></table></div>
        {!result.items.length && <p>No hay asignaciones registradas.</p>}
        <div className="platform-pagination"><span>Página {page.index + 1}</span><div><Button variant="secondary" disabled={!page.index} onClick={() => { setResult(previous => ({ ...previous, loading: true })); setPage(previous => ({ ...previous, index: previous.index - 1 })) }}>Anterior</Button><Button variant="secondary" disabled={!result.next} onClick={() => { setResult(previous => ({ ...previous, loading: true })); setPage(previous => ({ index: previous.index + 1, cursors: [...previous.cursors.slice(0, previous.index + 1), result.next] })) }}>Siguiente</Button></div></div>
      </>}
      <p className="platform-note mt-4">Las asignaciones se muestran en modo consulta. Para cambiar responsables o agregar administradores se requiere un flujo administrativo autorizado.</p>
    </Card>
  </div>
}
