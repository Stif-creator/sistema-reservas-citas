import { ArrowRight } from 'lucide-react'

export default function BusinessMap({ business, compact = false }) {
  const { latitude: lat, longitude: lon, addressLine, city } = business?.location || {}
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180)
    return <p>El negocio aún no ha configurado su ubicación en el mapa.</p>
  const bbox = [Math.max(-180,lon-.008),Math.max(-85,lat-.006),Math.min(180,lon+.008),Math.min(85,lat+.006)].join(',')
  return <section className={`business-map${compact ? ' compact' : ''}`}>
    {!compact && <><h2>Encuéntranos</h2><p>{[addressLine, city].filter(Boolean).join(', ')}</p></>}
    <iframe title={`Ubicación de ${business.name}`} loading="lazy" referrerPolicy="no-referrer" src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lon}`} />
    <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`} target="_blank" rel="noreferrer">Abrir mapa <ArrowRight aria-hidden="true" size={15} /></a>
    <a className="business-map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
  </section>
}
