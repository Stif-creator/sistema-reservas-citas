import { test } from 'node:test'
import assert from 'node:assert/strict'
import { forms, values, dirty, markFormSaved, confirmDiscard, confirmSignOut } from '../src/lib/unsavedForms.js'

test('form guards retain failed edits, allow reverting, and clear explicit saved resets', () => {
  const input = { id: 'title', value: 'Original', type: 'text' }
  const form = { isConnected: true, querySelectorAll: () => [input] }
  forms.set(form, { baseline: values(form) })
  input.value = 'Cambio'
  assert.equal(dirty(form), true)
  input.value = 'Original'
  assert.equal(dirty(form), false)
  input.value = 'Cambio'
  forms.get(form).submitted = values(form)
  input.value = 'Cambio posterior al envío'
  markFormSaved(form)
  assert.equal(dirty(form), true)
  markFormSaved(form, true)
  assert.equal(dirty(form), false)
})

test('discard cancellation keeps drafts and acceptance removes only the selected editor', async () => {
  const make = () => ({ isConnected: true, querySelectorAll: () => [] })
  const one = make(), two = make()
  forms.set(one, { baseline: 'changed' }); forms.set(two, { baseline: 'changed' })
  try {
    assert.equal(await confirmDiscard({ contains: form => form === one }, async options => { assert.match(options.description, /sin guardar/); return false }), false)
    assert.equal(dirty(one), true)
    assert.equal(await confirmDiscard({ contains: form => form === one }, async () => true), true)
    assert.equal(forms.has(one), false)
    assert.equal(dirty(two), true)
  } finally { forms.clear() }
})

test('sign out requires a fresh confirmation every time and keeps the session when canceled', async () => {
  const form = { isConnected: true, querySelectorAll: () => [] }
  const root = { contains: element => element === form }
  forms.set(form, { baseline: 'unsaved' })
  let calls = 0
  try {
    const confirm = async options => {
      calls += 1
      assert.equal(options.title, '¿Cerrar sesión?')
      return calls === 2
    }

    assert.equal(await confirmSignOut(root, confirm), false)
    assert.equal(forms.has(form), true)
    assert.equal(await confirmSignOut(root, confirm), true)
    assert.equal(forms.has(form), false)
    assert.equal(await confirmSignOut(root, confirm), false)
    assert.equal(calls, 3)
  } finally {
    forms.delete(form)
  }
})
