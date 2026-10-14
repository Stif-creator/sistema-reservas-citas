import DataList from './ui/DataList'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { bookingRequest, bookingEnabled } from '../lib/bookingApi'
import { safeImageUrl } from '../lib/brand'
import { formatPrice } from '../lib/clientPresentation'

export default function PublicCatalogExtras({ business }) {
  const [data, setData] = useState(null), [error, setError] = useState('')
  useEffect(() => { if (!bookingEnabled) return; let active = true; bookingRequest({ action:'publicOptions', businessId:business.id }).then(r => { if (active) setData(r) }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [business.id])
  return <section className="public-container public-section" id="profesionales"><h2>Nuestros profesionales</h2>{error && <p role="alert">{error}</p>}{!data && !error && <p>{bookingEnabled ? 'Cargando profesionales…' : 'Consulta al negocio para conocer su equipo.'}</p>}
    <DataList label="Profesionales" items={data?.professionals || []}>{rows => <div className="service-grid">{rows.map(p => <article className="service-card p-5" key={p.id}>{safeImageUrl(p.photoUrl) && <img src={p.photoUrl} alt={p.displayName} className="w-24 h-24 rounded-full object-cover" />}<h3>{p.displayName}</h3><p>{p.jobTitle}</p><p>{p.bio}</p><Link className="public-button" to={`/b/${business.id}/reservar`}>Reservar cita</Link></article>)}</div>}</DataList>{data?.professionals.length === 0 && <p>No hay profesionales disponibles por ahora.</p>}
    {data?.services.some(s => s.promotionTitle) && <><h2 className="mt-8">Promociones vigentes</h2><DataList label="Promociones vigentes" items={data.services.filter(s => s.promotionTitle) || []}>{rows => <div className="service-grid">{rows.map(s => <article className="service-card p-5" key={s.id}><h3>{s.promotionTitle}</h3><p>{s.name}</p><p><del>{formatPrice(s.originalPrice,s.currencyCode)}</del> · {formatPrice(s.price,s.currencyCode)}</p><Link className="public-button" to={`/b/${business.id}/reservar?servicio=${encodeURIComponent(s.id)}`}>Reservar oferta</Link></article>)}</div>}</DataList></>}
    <h2 className="mt-8">Opiniones de clientes</h2>{data?.reviews.length === 0 && <p>Aún no hay reseñas de citas finalizadas.</p>}<DataList label="Opiniones" items={data?.reviews || []}>{rows => <div className="service-grid">{rows.map(r => <article className="service-card p-5" key={r.id}><h3>{r.authorName} · {r.rating}/5</h3><p>{r.serviceName}</p><p>{r.comment}</p></article>)}</div>}</DataList>
  </section>
}
