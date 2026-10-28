import { useEffect, useState } from 'react'
import { collection, doc, getCountFromServer, getDocs, getDoc, limit, query, where } from 'firebase/firestore'
import { Building2, CalendarCheck, Headset, ShieldCheck } from 'lucide-react'
import { db } from '../firebase/config'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import '../components/superadmin.css'

export default function PlatformSupport() {
  const [businesses, setBusinesses] = useState([]), [businessId, setBusinessId] = useState(''), [state, setState] = useState({ loading: true, error: '', business: null, reservations: null })
  useEffect(() => {
    getDocs(query(collection(db, 'businesses'), limit(40))).then(snapshot => {
      const items = snapshot.docs.map(item => ({ ...item.data(), id: item.id })).filter(item => item.status !== 'deleted')
      setBusinesses(items); setBusinessId(items[0]?.id || '')
      if (!items.length) setState({ loading: false, error: '', business: null, reservations: null })
    }).catch(() => setState({ loading: false, error: 'No se pudieron cargar los negocios disponibles.', business: null, reservations: null }))
  }, [])
  useEffect(() => {
    if (!businessId) return
    let live = true
    Promise.all([
      getDoc(doc(db, 'businesses', businessId)),
      getCountFromServer(query(collection(db, 'reservations'), where('businessId', '==', businessId)))
    ]).then(([business, reservations]) => {
      if (live) setState({ loading: false, error: '', business: business.exists() ? { ...business.data(), id: business.id } : null, reservations: reservations.data().count })
    }).catch(error => { if (live) setState({ loading: false, error: error.code === 'permission-denied' ? 'No se puede consultar la información con las reglas actuales.' : 'No se pudo completar el diagnóstico.', business: null, reservations: null }) })
    return () => { live = false }
  }, [businessId])
  return <div><PageHeader title="Soporte técnico" description="Diagnóstico de lectura para orientar a los administradores sin acceder a sus cuentas." />
    <div className="platform-support-box"><span className="platform-stat-icon violet"><Headset size={22} /></span><div><strong>Modo de supervisión de solo lectura</strong><p>La aplicación no cuenta con autorización temporal de soporte limitada y verificable. Por seguridad, esta sección no edita datos, no suplanta usuarios y no consulta documentos individuales de clientes.</p></div></div>
    <Card className="platform-panel mt-4"><div className="platform-panel-head"><div><h2>Diagnóstico básico</h2><p>Consulta estado general del negocio y un conteo agregado de reservas.</p></div><ShieldCheck size={20} /></div>
      <label className="platform-select-business">Seleccionar negocio<select aria-label="Seleccionar negocio para diagnóstico" value={businessId} onChange={event => { setState({ loading: true, error: '', business: null, reservations: null }); setBusinessId(event.target.value) }}><option value="">Selecciona un negocio</option>{businesses.map(item => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</select></label>
      {state.error && <p className="platform-alert" role="alert">{state.error}</p>}{state.loading && <p className="platform-loading" role="status">Cargando diagnóstico…</p>}
      {!state.loading && state.business && <div className="platform-support-diagnostics"><div><span><Building2 size={17} />Negocio</span><strong>{state.business.name || state.business.id}</strong></div><div><span><ShieldCheck size={17} />Estado de acceso</span><strong>{state.business.status === 'active' ? 'Activo' : state.business.status || 'Sin estado'}</strong></div><div><span><CalendarCheck size={17} />Reservas registradas</span><strong>{state.reservations}</strong></div><div><span>Página pública</span><strong>{state.business.settings?.publicPageEnabled ? 'Publicada' : 'No publicada'}</strong></div></div>}
      {!state.loading && !state.business && !state.error && <p className="platform-empty">Selecciona un negocio para ver el diagnóstico.</p>}
    </Card>
    <p className="platform-note mt-4">Para habilitar soporte con escritura se necesitaría una autorización backend con alcance, motivo, auditoría y expiración aplicados en cada operación. El proyecto no ofrece hoy ese control; esta alternativa se mantiene de solo lectura.</p>
  </div>
}
