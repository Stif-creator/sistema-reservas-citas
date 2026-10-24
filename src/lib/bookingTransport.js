export const readActions = new Set(['options', 'availability', 'publicOptions', 'publicAvailability', 'hub', 'clients', 'clientHistory'])
const transientStatuses = new Set([502, 503, 504])
const failure = (message, code) => Object.assign(new Error(message), { code: `functions/${code}` })

export async function sendBookingRequest(data, { base, token, request = fetch, pause, timeoutMs = 120000, retryDelays = [3000, 7000, 15000, 30000] }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const sleep = pause || (ms => new Promise((resolve, reject) => {
    const done = () => { controller.signal.removeEventListener('abort', abort); resolve() }
    const timer = setTimeout(done, ms)
    const abort = () => { clearTimeout(timer); reject(failure('El servidor tardó demasiado en responder.', 'deadline-exceeded')) }
    if (controller.signal.aborted) abort()
    else controller.signal.addEventListener('abort', abort, { once: true })
  }))
  try {
    for (let attempt = 0; ; attempt++) {
      const response = await request(`${base}/booking`, { method: 'POST', signal: controller.signal,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      if (readActions.has(data.action) && transientStatuses.has(response.status) && attempt < retryDelays.length) {
        await response.body?.cancel()
        await sleep(retryDelays[attempt])
        continue
      }
      let payload
      try { payload = await response.json() } catch { /* Gateways can return HTML instead of API JSON. */ }
      if (!response.ok || payload?.error) {
        if (payload?.error?.code) throw failure(payload.error.message || 'No se pudo completar la operación.', payload.error.code)
        if (transientStatuses.has(response.status)) throw failure(`El servidor de Render no está disponible (HTTP ${response.status}). Puede estar iniciándose o tener un error de despliegue. Intenta cargar de nuevo.`, 'unavailable')
        if (response.status === 404) throw failure('La API no se encontró. Revisa la dirección configurada y el despliegue de Render.', 'not-found')
        throw failure(`No se pudo consultar el servidor (HTTP ${response.status}).`, 'unavailable')
      }
      if (!payload || !Object.hasOwn(payload, 'data')) throw failure('El servidor devolvió una respuesta no válida. Revisa el despliegue de la API.', 'unavailable')
      return payload.data
    }
  } catch (error) {
    if (controller.signal.aborted) throw failure('El servidor tardó demasiado en responder. Intenta cargar de nuevo.', 'deadline-exceeded')
    if (error.code?.startsWith('functions/')) throw error
    throw failure('No se pudo conectar con el servidor. Comprueba la conexión y los dominios autorizados en Render.', 'unavailable')
  } finally { clearTimeout(timeout) }
}

export function bookingFailure(error, action) {
  const ambiguous = ['functions/internal', 'functions/unavailable', 'functions/deadline-exceeded'].includes(error.code)
  // Only the booking mutations support request IDs and safe ambiguous retries.
  if (ambiguous && ['create', 'reschedule', 'status'].includes(action)) return Object.assign(new Error(`${error.message} No pudimos confirmar si se guardó. Reintenta la misma operación para comprobarla sin duplicarla.`), { code: error.code })
  if (error.code === 'functions/internal' && readActions.has(action)) return Object.assign(new Error('El servidor encontró un error al cargar los datos. Revisa los registros de Render e intenta actualizar.'), { code: error.code })
  return error
}
