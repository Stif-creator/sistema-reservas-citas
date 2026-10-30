import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function encryptionKey(env) {
  const key = Buffer.from(String(env.BUSINESS_REQUEST_TOKEN_ENCRYPTION_KEY || ''), 'base64')
  return key.length === 32 ? key : null
}

export function encryptTrackingToken(token, env = process.env) {
  const key = encryptionKey(env)
  if (!key) return null
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptTrackingToken(payload, env = process.env) {
  const key = encryptionKey(env)
  if (!key || typeof payload !== 'string') return null
  const [version, ivValue, tagValue, encryptedValue] = payload.split('.')
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8')
  } catch { return null }
}
