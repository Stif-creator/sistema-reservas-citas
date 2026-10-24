import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sendBookingRequest, bookingFailure } from '../src/lib/bookingTransport.js'

test('read operations retry gateway HTML and recover without parsing HTML as JSON', async () => {
  for (const action of ['clients', 'clientHistory']) {
    let calls = 0
    const pauses = []
    const result = await sendBookingRequest({ action }, { base:'https://api.example', token:'test', pause:async ms => pauses.push(ms), request:async () => ++calls < 3 ? new Response('<html>Starting</html>', { status:502 }) : Response.json({ data:{ clients:[], history:[] } }) })
    assert.equal(calls,3)
    assert.equal(pauses.length,2)
    assert.deepEqual(result,{ clients:[], history:[] })
  }
})
test('persistent gateway errors explain read failure without claiming an ambiguous booking', async () => {
  await assert.rejects(sendBookingRequest({ action:'hub' }, { base:'https://api.example', retryDelays:[], request:async () => new Response('<html>Unavailable</html>', { status:503 }) }), error => {
    const shown = bookingFailure(error,'hub')
    return shown.code === 'functions/unavailable' && shown.message.includes('HTTP 503') && !shown.message.includes('duplicarla')
  })
})
test('writes are not automatically retried and only booking writes get idempotent retry guidance', async () => {
  for (const action of ['create','reschedule','status','promotionSave','clientUpdate']) {
    let calls = 0
    await assert.rejects(sendBookingRequest({ action }, { base:'https://api.example', pause:async () => {}, request:async () => { calls++; return new Response('offline',{ status:502 }) } }), error => {
      const shown = bookingFailure(error,action)
      assert.equal(shown.message.includes('sin duplicarla'), ['create','reschedule','status'].includes(action))
      return true
    })
    assert.equal(calls,1)
  }
})
test('API authorization and business errors retain their original message and are not retried', async () => {
  let calls = 0
  await assert.rejects(sendBookingRequest({ action:'options' }, { base:'https://api.example', request:async () => { calls++; return Response.json({ error:{ code:'permission-denied',message:'Sin acceso al negocio.' } },{ status:403 }) } }), { code:'functions/permission-denied',message:'Sin acceso al negocio.' })
  assert.equal(calls,1)
})
test('timeouts and malformed success responses produce actionable errors', async () => {
  await assert.rejects(sendBookingRequest({ action:'hub' }, { base:'https://api.example', timeoutMs:5, request:(_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort',() => reject(new Error('aborted')))) }), { code:'functions/deadline-exceeded' })
  await assert.rejects(sendBookingRequest({ action:'hub' }, { base:'https://api.example', request:async () => new Response('not json') }), { code:'functions/unavailable' })
})
