export default function BusinessMap({ business }) {
  const { latitude: lat, longitude: lon, addressLine, city } = business?.location || {}
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return <p>El negocio aún no ha configurado su ubicación en el mapa.</p>
  const bbox = [Math.max(-180,lon-.008),Math.max(-85,lat-.006),Math.min(180,lon+.008),Math.min(85,lat+.006)].join(',')
  return <section className="mt-6"><h2>Encuéntranos</h2><p>{addressLine} {city}</p><iframe title={`Ubicación de ${business.name}`} loading="lazy" referrerPolicy="no-referrer" src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lon}`} style={{ width:'100%', height:320, border:0, borderRadius:12 }} /><a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`} target="_blank" rel="noreferrer">Abrir mapa · © OpenStreetMap contributors</a></section>
}
