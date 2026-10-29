import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { decodeImage, uploadImage, uploadRequestImage, MAX_IMAGE_BYTES } from '../functions/images.js'
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCuoAAAAASUVORK5CYII='
const env = { CLOUDINARY_CLOUD_NAME: 'test-cloud', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'private' }
function database(role = 'admin') {
  const records = { 'users/u': { status: 'active' }, 'memberships/b_u': { status: 'active', role }, 'businesses/b': { status: 'active' } }
  const doc = path => ({ path, get: async () => ({ data: () => records[path] }) })
  return { records, doc, runTransaction: fn => fn({ get: ref => ref.get(), set: (ref, value) => { records[ref.path] = value } }) }
}
test('images: reject forged contents, unsupported formats and oversized files', () => {
  assert.equal(decodeImage(image).mime, 'image/png')
  for (const value of ['data:image/png;base64,aGVsbG8=', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,' + Buffer.alloc(MAX_IMAGE_BYTES + 1).toString('base64')]) assert.throws(() => decodeImage(value), { code: 'invalid-argument' })
})
test('images: authorization and configuration checked before provider call', async () => {
  const options = { env, request: () => { throw new Error('must not call provider') } }
  await assert.rejects(uploadImage(database(), '', { businessId: 'b', kind: 'logo', image }, options), { code: 'unauthenticated' })
  await assert.rejects(uploadImage(database('client'), 'u', { businessId: 'b', kind: 'logo', image }, options), { code: 'permission-denied' })
  await assert.rejects(uploadImage(database(), 'u', { businessId: 'other', kind: 'profile', image }, options), { code: 'permission-denied' })
  await assert.rejects(uploadImage(database(), 'u', { businessId: 'b', kind: 'logo', image }, { ...options, env: {} }), { code: 'failed-precondition' })
})
test('images: signed upload, own profile and shared quota', async () => {
  const db = database('client')
  const request = async (url, { body }) => {
    assert.equal(url, 'https://api.cloudinary.com/v1_1/test-cloud/image/upload')
    const signed = `overwrite=false&public_id=${body.get('public_id')}&timestamp=${body.get('timestamp')}private`
    assert.equal(body.get('signature'), createHash('sha256').update(signed).digest('hex'))
    assert.equal(body.get('file').type, 'image/png')
    assert.equal(body.get('api_secret'), null)
    return { ok: true, json: async () => ({ public_id: body.get('public_id'), secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/test.png' }) }
  }
  assert.match((await uploadImage(db, 'u', { businessId: 'b', kind: 'profile', image }, { env, request })).url, /^https:/)
  assert.equal(db.records['imageUploadLimits/u'].count, 1)
  db.records['imageUploadLimits/u'].count = 30
  await assert.rejects(uploadImage(db, 'u', { businessId: 'b', kind: 'profile', image }, { env, request }), { code: 'resource-exhausted' })
})
test('images: provider errors do not expose credentials', async () => {
  await assert.rejects(uploadImage(database(), 'u', { businessId: 'b', kind: 'cover', image }, { env, request: async () => { throw new Error('private secret') } }), error => error.code === 'unavailable' && !error.message.includes('secret'))
})

test('images: actionable provider errors never expose upstream secrets', async () => {
  for (const [status, code] of [[401, 'failed-precondition'], [403, 'failed-precondition'], [404, 'failed-precondition'], [429, 'resource-exhausted'], [500, 'unavailable']]) {
    await assert.rejects(uploadImage(database(), 'u', { businessId: 'b', kind: 'logo', image }, {
      env, request: async () => ({ ok: false, status, json: async () => ({ error: { message: 'private API key and signature' } }) }),
    }), error => error.code === code && !error.message.includes('private'))
  }
})

test('request images use validated raster bytes and a server-signed Cloudinary upload', async () => {
  const uploaded = await uploadRequestImage(image, 'logo', { env, request: async (_url, { body }) => ({ ok: true, json: async () => ({ public_id: body.get('public_id'), secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/logo.png' }) }) })
  assert.equal(uploaded.kind, 'logo')
  assert.match(uploaded.url, /^https:\/\/res\.cloudinary\.com\/test-cloud\//)
  await assert.rejects(uploadRequestImage('data:image/svg+xml;base64,PHN2Zz4=', 'cover', { env }), { code: 'invalid-argument' })
  await assert.rejects(uploadRequestImage(image, 'avatar', { env }), { code: 'invalid-argument' })
})
test('images: trim whitespace copied with credentials', async () => {
  await uploadImage(database(), 'u', { businessId: 'b', kind: 'logo', image }, {
    env: Object.fromEntries(Object.entries(env).map(([key, value]) => [key, ` ${value}\n`])),
    request: async (url, { body }) => {
      assert.equal(url, 'https://api.cloudinary.com/v1_1/test-cloud/image/upload')
      assert.equal(body.get('api_key'), 'key')
      const signed = `overwrite=false&public_id=${body.get('public_id')}&timestamp=${body.get('timestamp')}private`
      assert.equal(body.get('signature'), createHash('sha256').update(signed).digest('hex'))
      return { ok: true, json: async () => ({ public_id: body.get('public_id'), secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/test.png' }) }
    },
  })
})

test('images: platform can configure inactive business branding but cannot upload operational images', async () => {
  const db = database()
  db.records['users/u'].globalRole = 'superadmin'
  delete db.records['memberships/b_u']
  const options = { env, request: async (url, { body }) => ({ ok: true, json: async () => ({ public_id: body.get('public_id'), secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/branding.png' }) }) }
  for (const status of ['active', 'inactive', 'deleted']) {
    db.records['businesses/b'].status = status
    for (const kind of ['logo', 'cover']) assert.match((await uploadImage(db, 'u', { businessId: 'b', kind, image }, options)).url, /branding.png$/)
    for (const kind of ['service', 'professional', 'profile']) await assert.rejects(uploadImage(db, 'u', { businessId: 'b', kind, image }, options), { code: 'permission-denied' })
  }
  db.records['users/u'].status = 'inactive'
  await assert.rejects(uploadImage(db, 'u', { businessId: 'b', kind: 'logo', image }, options), { code: 'permission-denied' })
  const admin = database()
  admin.records['businesses/b'].status = 'inactive'
  await assert.rejects(uploadImage(admin, 'u', { businessId: 'b', kind: 'cover', image }, options), { code: 'permission-denied' })
})
