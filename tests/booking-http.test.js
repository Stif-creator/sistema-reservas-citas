import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createBookingServer } from '../functions/http.js'
import { BookingError } from '../functions/bookingError.js'

test('HTTP: autenticación, CORS, identidad verificada y errores sin secretos', async t => {
  let calls = 0
  const server = createBookingServer({ allowedOrigins: ['https://app.example'],
    verifyToken: async token => {
      if (token !== 'valid') throw Object.assign(new Error('private token'), { code: 'auth/invalid-id-token' })
      return { uid: 'verified-user' }
    },
    execute: async (uid, data) => {
      calls++
      assert.equal(uid, 'verified-user')
      if (data.action === 'conflict') throw new BookingError('already-exists', 'Horario ocupado.')
      if (data.action === 'crash') throw new Error('secret database path')
      return { reservationId: 'saved' }
    },
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`
  const request = (headers = {}, body = '{}', method = 'POST') => fetch(`${base}/booking`, {
    method, headers: { Origin: 'https://app.example', 'Content-Type': 'application/json', ...headers },
    ...(method === 'POST' ? { body } : {}),
  })
  assert.equal((await fetch(`${base}/health`)).status, 200)
  const preflight = await request({}, undefined, 'OPTIONS')
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://app.example')
  assert.equal((await request({ Origin: 'https://evil.example', Authorization: 'Bearer valid' })).status, 403)
  assert.equal((await request()).status, 401)
  assert.equal((await request({ Authorization: 'Bearer forged' })).status, 401)
  assert.equal((await request({ Authorization: 'Bearer valid' }, '{')).status, 400)
  assert.equal((await request({ Authorization: 'Bearer valid' }, 'null')).status, 400)
  assert.equal((await request({ Authorization: 'Bearer valid' }, JSON.stringify({ notes: 'x'.repeat(17000) }))).status, 400)
  assert.equal(calls, 0)
  const success = await request({ Authorization: 'Bearer valid' }, JSON.stringify({ uid: 'forged-user' }))
  assert.deepEqual(await success.json(), { data: { reservationId: 'saved' } })
  const conflict = await request({ Authorization: 'Bearer valid' }, '{"action":"conflict"}')
  assert.equal(conflict.status, 409)
  assert.equal((await conflict.json()).error.code, 'already-exists')
  const crash = await request({ Authorization: 'Bearer valid' }, '{"action":"crash"}')
  assert.equal(crash.status, 500)
  assert.ok(!(await crash.text()).includes('secret'))
})
