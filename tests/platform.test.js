import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countdown } from '../src/lib/countdown.js'
import { generatePassword } from '../src/lib/password.js'

test('countdown handles day/hour/minute boundaries and elapsed appointments', () => {
  const now = 1000000
  assert.equal(countdown(now + 86400000, now), 'Faltan 1 d · 0 min para tu cita')
  assert.equal(countdown(now + 3600000, now), 'Faltan 1 h · 0 min para tu cita')
  assert.equal(countdown(now + 1, now), 'Faltan 1 min para tu cita')
  assert.equal(countdown(now, now), 'La hora de tu cita ha llegado')
})

test('generated initial passwords have sufficient length, mixed characters and differ', () => {
  const passwords = Array.from({ length: 100 }, generatePassword)
  assert.equal(new Set(passwords).size, 100)
  for (const password of passwords) {
    assert(password.length >= 20)
    assert.match(password, /[A-Z]/)
    assert.match(password, /[a-z]/)
    assert.match(password, /[0-9]/)
    assert.match(password, /[!@#$%]/)
  }
})
