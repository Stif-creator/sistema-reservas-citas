const validEmail = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

export async function sendTransactionalEmail({ to, subject, text, html }, { env = process.env, fetchImpl = fetch } = {}) {
  const apiKey = String(env.RESEND_API_KEY || '').trim()
  const from = String(env.RESEND_FROM || '').trim()
  if (!apiKey || !from || !env.APP_PUBLIC_URL) return { status: 'not_configured', reason: 'missing_configuration' }
  if (!validEmail(to) || !subject || !text || /[\r\n]/.test(from) || !/<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>$/.test(from))
    return { status: 'failed', reason: 'invalid_configuration_or_message' }
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, ...(html ? { html } : {}) }),
      signal: AbortSignal.timeout(12000),
    })
    if (!response.ok) return { status: 'failed', reason: response.status === 429 ? 'provider_rate_limited' : 'provider_rejected', statusCode: response.status }
    const result = await response.json().catch(() => null)
    if (typeof result?.id !== 'string' || !result.id) return { status: 'failed', reason: 'provider_unconfirmed' }
    return { status: 'accepted', provider: 'resend', messageId: result.id }
  } catch {
    return { status: 'failed', reason: 'provider_unavailable' }
  }
}

export function escapeEmailHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}
