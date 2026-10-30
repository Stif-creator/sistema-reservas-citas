import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { executeBusinessRequests, publicBusinessRequestAction, validateBusinessRequest } from '../functions/businessRequests.js'
import { decryptTrackingToken, encryptTrackingToken } from '../functions/businessRequestSecrets.js'
import { escapeEmailHtml, sendTransactionalEmail } from '../functions/transactionalEmail.js'

const valid = {
  applicant: { firstName: 'Ana', lastName: 'Pérez', email: 'ANA@example.test', phone: '+59170000000' },
  business: { name: 'Mi estudio', category: 'Belleza', city: 'La Paz', description: 'Servicios de belleza para toda la familia.', website: 'https://example.test' },
  appearance: { primaryColor: '#2563eb', secondaryColor: '#7c3aed', accentColor: '#ec4899', surfaceColor: '#1f2937' },
  termsAccepted: true,
}

test('business requests validate and normalize public application data', () => {
  const result = validateBusinessRequest(valid)
  assert.equal(result.applicant.email, 'ana@example.test')
  assert.equal(result.business.description, valid.business.description)
  assert.equal(result.appearance.primaryColor, '#2563eb')
  assert.equal('password' in result, false)
})

test('business requests reject missing consent, malformed contact data, invalid colors and honeypot submissions', () => {
  for (const input of [
    { ...valid, termsAccepted: false },
    { ...valid, applicant: { ...valid.applicant, email: 'bad' } },
    { ...valid, applicant: { ...valid.applicant, phone: '123' } },
    { ...valid, appearance: { ...valid.appearance, accentColor: 'blue' } },
    { ...valid, websiteTrap: 'bot' },
    { ...valid, business: { ...valid.business, website: 'http://unsafe.test' } },
  ]) assert.throws(() => validateBusinessRequest(input), { code: 'invalid-argument' })
})

test('public submission creates a trackable request and a platform notification; failed attempts release rate limits', async () => {
  const db = fakeDb()
  const collection = db.collection.bind(db)
  db.collection = name => name === 'users'
    ? { where: () => ({ limit: () => ({ get: async () => { throw new Error('temporary lookup failure') } }) }) }
    : collection(name)
  await assert.rejects(publicBusinessRequestAction(db, { ...valid, action: 'businessRequestSubmit' }, '203.0.113.10'))
  assert.equal(Object.entries(db.values).find(([path]) => path.includes('businessRequestLimits/v2_'))?.[1].count, 0)
  db.collection = collection
  const result = await publicBusinessRequestAction(db, { ...valid, action: 'businessRequestSubmit' }, '203.0.113.10', {
    env: { APP_PUBLIC_URL: 'https://app.example.test', RESEND_API_KEY: 'test-key', RESEND_FROM: 'CitasPro <mail@example.test>' },
    emailService: async () => { throw new Error('provider offline') },
  })
  assert.match(result.requestId, /^[a-f\d-]{36}$/i)
  assert.equal(result.trackingToken.length, 43)
  assert.equal(result.emailNotification.status, 'failed')
  const request = db.values[`businessRequests/${result.requestId}`]
  assert.equal(request.status, 'pending')
  assert.equal(request.trackingTokenHash, createHash('sha256').update(result.trackingToken).digest('hex'))
  const notices = Object.entries(db.values).filter(([path]) => path.startsWith('notifications/'))
  assert.equal(notices.length, 1)
  assert.equal(notices[0][1].recipientUserId, 'super')
  assert.equal(notices[0][1].type, 'platform')
  assert.equal(notices[0][1].event, 'businessRequestSubmitted')
  assert.equal(notices[0][1].read, false)
})

function fakeDb() {
  const values = {
    'users/super': { status: 'active', globalRole: 'superadmin' },
    'users/applicant': { status: 'active', globalRole: 'user', onboardingComplete: true, businessIds: [], firstName: 'Ana', lastName: 'Pérez', email: 'ana@example.test' },
    'businessRequests/11111111-1111-4111-8111-111111111111': {
      ...validateBusinessRequest(valid), status: 'pending', reviewHistory: [], images: { logo: null, cover: null },
    },
  }
  let sequence = 0
  const applyUpdate = (path, value) => { const current = { ...values[path] }; for (const [key, item] of Object.entries(value)) { if (key.startsWith('emailNotifications.')) current.emailNotifications = { ...(current.emailNotifications || {}), [key.slice('emailNotifications.'.length)]: item }; else current[key] = item } values[path] = current }
  const ref = path => ({ path, id: path.split('/').at(-1), get: async () => ({ exists: Boolean(values[path]), data: () => values[path] }), update: async value => applyUpdate(path, value), create: async value => { if (values[path]) throw Object.assign(new Error('exists'), { code: 'already-exists' }); values[path] = value } })
  const queryRef = (name, field, expected) => ({ query: true, name, field, expected, limit() { return this }, orderBy() { return this }, startAfter() { return this }, get: async () => { const matches = Object.entries(values).filter(([path, value]) => path.startsWith(`${name}/`) && value?.[field] === expected); return { size: matches.length, docs: matches.map(([path, value]) => ({ id: path.split('/').at(-1), ref: { path }, data: () => value })) } } })
  const collection = name => ({ doc: id => ref(`${name}/${id || `generated-${++sequence}`}`), where: (field, _op, expected) => queryRef(name, field, expected), orderBy() { return this }, limit() { return this } })
  const db = {
    values,
    doc: ref,
    collection,
    runTransaction: async fn => {
      const writes = []
      const tx = {
        get: async target => target.query ? target.get() : target.get(),
        create: (target, value) => writes.push(['create', target.path, value]),
        update: (target, value) => writes.push(['update', target.path, value]),
        set: (target, value) => writes.push(['set', target.path, value]),
      }
      const result = await fn(tx)
      for (const [operation, path, data] of writes) {
        if (operation === 'create') { assert.equal(values[path], undefined, `expected no existing ${path}`); values[path] = data }
        else if (operation === 'update') applyUpdate(path, data)
        else values[path] = data
      }
      return result
    },
  }
  return db
}

test('business request review is superadmin-only, requires a note, and prevents double resolution', async () => {
  const db = fakeDb(), requestId = '11111111-1111-4111-8111-111111111111'
  const input = { action: 'businessRequestReview', requestId, status: 'rejected', note: 'No se pudo verificar el negocio.' }
  await assert.rejects(executeBusinessRequests(db, 'applicant', input, { authService: {} }), { code: 'permission-denied' })
  await assert.rejects(executeBusinessRequests(db, 'super', { ...input, note: 'no' }, { authService: {} }), { code: 'invalid-argument' })
  await executeBusinessRequests(db, 'super', { ...input, status: 'in_review', note: '' }, { authService: {} })
  assert.equal(db.values[`businessRequests/${requestId}`].status, 'in_review')
  await executeBusinessRequests(db, 'super', input, { authService: {} })
  await assert.rejects(executeBusinessRequests(db, 'super', input, { authService: {} }), { code: 'failed-precondition' })
})

test('business request approval creates one unpublished business and an admin membership atomically', async () => {
  const db = fakeDb(), requestId = '11111111-1111-4111-8111-111111111111'
  const authService = { getUserByEmail: async () => ({ uid: 'applicant' }) }
  const result = await executeBusinessRequests(db, 'super', { action: 'businessRequestApprove', requestId }, { authService })
  const business = db.values[`businesses/${result.businessId}`]
  assert.equal(result.status, 'approved')
  assert.equal(business.settings.publicPageEnabled, false)
  assert.equal(business.sourceRequestId, requestId)
  assert.equal(db.values[`memberships/${result.businessId}_applicant`].role, 'admin')
  assert.equal(db.values[`businessRequests/${requestId}`].status, 'approved')
  await assert.rejects(executeBusinessRequests(db, 'super', { action: 'businessRequestApprove', requestId }, { authService }), { code: 'failed-precondition' })
  assert.equal(Object.keys(db.values).filter(path => path.startsWith('businesses/')).length, 1)
})

test('business request approval provisions a random password and sends a one-time setup link without exposing it', async () => {
  const requestId = '11111111-1111-4111-8111-111111111111'
  const notFound = Object.assign(new Error('missing'), { code: 'auth/user-not-found' })
  const db = fakeDb()
  let created, deleted, sent
  const setupLink = 'https://auth.example.test/action?mode=resetPassword&oobCode=secret'
  const authService = { getUserByEmail: async () => { throw notFound }, createUser: async user => { created = user; return { uid: 'new-admin' } }, deleteUser: async uid => { deleted = uid }, generatePasswordResetLink: async () => setupLink }
  const env = { APP_PUBLIC_URL: 'https://app.example.test', RESEND_API_KEY: 'test-key', RESEND_FROM: 'CitasPro <hola@example.test>' }
  const emailService = async payload => { sent = payload; return { status: 'accepted', provider: 'resend', messageId: 'mail-1' } }
  const result = await executeBusinessRequests(db, 'super', { action: 'businessRequestApprove', requestId }, { authService, emailService, env })
  assert.match(created.password, /^[A-Za-z0-9_-]{64}$/)
  assert.equal(created.emailVerified, false)
  assert.equal(created.password.includes('Temporary'), false)
  assert.equal(sent.text.includes(setupLink), true)
  assert.equal(result.emailNotification.status, 'accepted')
  assert.equal(JSON.stringify(result).includes(setupLink), false)
  assert.equal(JSON.stringify(result).includes(created.password), false)
  assert.equal(db.values[`businessRequests/${requestId}`].adminInvitationRequired, true)
  assert.equal(db.values[`businessRequests/${requestId}`].approvalLock, null)
  db.values['businesses/existing'] = { name: valid.business.name }
  const secondId = '22222222-2222-4222-8222-222222222222'
  db.values[`businessRequests/${secondId}`] = { ...validateBusinessRequest(valid), status: 'pending', reviewHistory: [], images: { logo: null, cover: null } }
  const previousPassword = created.password
  await assert.rejects(executeBusinessRequests(db, 'super', { action: 'businessRequestApprove', requestId: secondId }, { authService }), { code: 'already-exists' })
  assert.notEqual(created.password, previousPassword)
  assert.equal(deleted, 'new-admin')
  assert.equal(db.values[`businessRequests/${secondId}`].status, 'pending')
  assert.equal(db.values[`businessRequests/${secondId}`].approvalLock, null)
})

test('transactional email validates provider acceptance and safely escapes HTML content', async () => {
  assert.equal(escapeEmailHtml('<script>&"'), '&lt;script&gt;&amp;&quot;')
  const config = { RESEND_API_KEY: 'secret', RESEND_FROM: 'CitasPro <mail@example.test>', APP_PUBLIC_URL: 'https://app.example.test' }
  const sent = []
  const fetchImpl = async (url, options) => {
    sent.push({ url, options })
    return { ok: true, json: async () => ({ id: 'resend-id' }) }
  }
  const accepted = await sendTransactionalEmail({ to: 'user@example.test', subject: 'Test', text: 'Hola' }, { env: config, fetchImpl })
  assert.equal(accepted.status, 'accepted')
  assert.equal(accepted.provider, 'resend')
  assert.equal(sent[0].url, 'https://api.resend.com/emails')
  assert.equal(JSON.parse(sent[0].options.body).to[0], 'user@example.test')
  const failed = await sendTransactionalEmail({ to: 'user@example.test', subject: 'Test', text: 'Hola' }, { env: config, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) })
  assert.equal(failed.status, 'failed')
  assert.equal((await sendTransactionalEmail({ to: 'user@example.test', subject: 'Test', text: 'Hola' }, { env: {}, fetchImpl })).status, 'not_configured')
})

test('business request token encryption protects invitation links and fails closed on a wrong key', () => {
  const env = { BUSINESS_REQUEST_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') }
  const token = 'a'.repeat(43)
  const encrypted = encryptTrackingToken(token, env)
  assert.notEqual(encrypted, token)
  assert.equal(decryptTrackingToken(encrypted, env), token)
  assert.equal(decryptTrackingToken(encrypted, { BUSINESS_REQUEST_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64') }), null)
})

test('request review survives mail provider failures and allows a safe retry without repeating a status change', async () => {
  const db = fakeDb(), requestId = '11111111-1111-4111-8111-111111111111'
  const env = { APP_PUBLIC_URL: 'https://app.example.test', RESEND_API_KEY: 'key', RESEND_FROM: 'CitasPro <mail@example.test>', BUSINESS_REQUEST_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64') }
  db.values[`businessRequests/${requestId}`].trackingTokenCiphertext = encryptTrackingToken('t'.repeat(43), env)
  const review = await executeBusinessRequests(db, 'super', { action: 'businessRequestReview', requestId, status: 'rejected', note: 'No se pudo verificar.' }, { authService: {}, env, emailService: async () => { throw new Error('provider offline') } })
  assert.equal(review.status, 'rejected')
  assert.equal(review.emailNotification.status, 'failed')
  assert.equal(db.values[`businessRequests/${requestId}`].status, 'rejected')
  let delivered
  const retry = await executeBusinessRequests(db, 'super', { action: 'businessRequestEmailRetry', requestId, emailEvent: 'rejected' }, { authService: {}, env, emailService: async payload => { delivered = payload; return { status: 'accepted', provider: 'resend', messageId: 'retry-1' } } })
  assert.equal(retry.emailNotification.status, 'accepted')
  assert.ok(delivered.text.includes('https://app.example.test/solicitud/'))
  await assert.rejects(executeBusinessRequests(db, 'super', { action: 'businessRequestEmailRetry', requestId, emailEvent: 'rejected' }, { authService: {}, env, emailService: async () => { throw new Error('must not send') } }), { code: 'failed-precondition' })
})
test('business request tracking requires its secret token and accepts requested details idempotently', async () => {
  const db = fakeDb(), requestId = '11111111-1111-4111-8111-111111111111', token = 'a'.repeat(43)
  const ref = `businessRequests/${requestId}`
  db.values[ref] = { ...validateBusinessRequest(valid), status: 'needs_info', reviewNote: 'Indica el horario de atención.', trackingTokenHash: createHash('sha256').update(token).digest('hex'), reviewHistory: [] }
  const request = { action: 'businessRequestStatus', requestId, trackingToken: token }
  assert.equal((await publicBusinessRequestAction(db, request, '127.0.0.1')).status, 'needs_info')
  await assert.rejects(publicBusinessRequestAction(db, { ...request, trackingToken: 'b'.repeat(43) }, '127.0.0.1'), { code: 'permission-denied' })
  const provide = { ...request, action: 'businessRequestProvideInfo', additionalInfo: 'Atendemos de lunes a viernes, de 9 a 18.' }
  await publicBusinessRequestAction(db, provide, '127.0.0.1')
  await publicBusinessRequestAction(db, provide, '127.0.0.1')
  assert.equal(db.values[ref].status, 'pending')
  assert.equal(db.values[ref].additionalInfo, provide.additionalInfo)
  assert.equal(db.values[ref].reviewHistory.length, 1)
})
