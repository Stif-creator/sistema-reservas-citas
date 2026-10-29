import { useRouteError } from 'react-router-dom'

export default function RouteErrorFallback() {
  const error = useRouteError()
  const staleChunk = /dynamically imported module|loading chunk|failed to fetch/i.test(error?.message || '')
  const retry = () => {
    const freshUrl = new URL(window.location.href)
    freshUrl.searchParams.set('_fresh', String(Date.now()))
    window.location.replace(freshUrl)
  }
  return <main role="alert" style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', gap: 12, padding: 24, background: '#f3f7fd', color: '#17345f', fontFamily: 'system-ui, sans-serif' }}>
    <section style={{ maxWidth: 520, border: '1px solid #dbe7f7', borderRadius: 14, padding: 24, background: '#fff', boxShadow: '0 8px 28px #17345f12' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>{staleChunk ? 'CitasPro se actualizó' : 'No se pudo cargar esta página'}</h1>
      <p style={{ margin: '0 0 18px', color: '#607796', lineHeight: 1.5 }}>{staleChunk ? 'La página estaba usando archivos de una versión anterior. Vuelve a cargar para continuar.' : 'Ocurrió un problema al abrir esta página. Puedes volver a intentarlo.'}</p>
      <button type="button" onClick={retry} style={{ border: 0, borderRadius: 9, padding: '10px 16px', color: '#fff', background: '#0876f9', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Volver a cargar</button>
    </section>
  </main>
}
