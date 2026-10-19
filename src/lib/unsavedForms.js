// Drafts stay only in memory. Passwords and other values are never persisted.
export const forms = new Map()
export const values = form => JSON.stringify([...form.querySelectorAll('input,textarea,select,img')]
  .filter(el => !['submit', 'button', 'reset', 'hidden'].includes(el.type))
  .map(el => [el.id || el.name, el.tagName === 'IMG' ? el.getAttribute('src') : el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value]))
export function dirty(form) { return form.isConnected && forms.has(form) && forms.get(form).baseline !== values(form) }
export function confirmDiscard(root = document) {
  const affected = [...forms.keys()].filter(form => root.contains(form) && dirty(form))
  if (affected.length && !window.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos y continuar?')) return false
  for (const form of affected) forms.delete(form)
  return true
}
export function markFormSaved(form, reset = false) {
  const entry = forms.get(form)
  if (!entry) return
  // Preserve edits made while a request was in flight. Resets are explicit.
  if (reset) forms.delete(form)
  else entry.baseline = entry.submitted ?? values(form)
}

