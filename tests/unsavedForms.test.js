import { test } from 'node:test'
import assert from 'node:assert/strict'
import { forms, values, dirty, markFormSaved, confirmDiscard } from '../src/lib/unsavedForms.js'

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

test('discard cancellation keeps drafts and acceptance removes only the selected editor', () => {
  const make = () => ({ isConnected: true, querySelectorAll: () => [] })
  const one = make(), two = make()
  forms.set(one, { baseline: 'changed' }); forms.set(two, { baseline: 'changed' })
  const previous = globalThis.window
  try {
    globalThis.window = { confirm: () => false }
    assert.equal(confirmDiscard({ contains: form => form === one }), false)
    assert.equal(dirty(one), true)
    globalThis.window.confirm = () => true
    assert.equal(confirmDiscard({ contains: form => form === one }), true)
    assert.equal(forms.has(one), false)
    assert.equal(dirty(two), true)
  } finally { forms.clear(); globalThis.window = previous }
})
