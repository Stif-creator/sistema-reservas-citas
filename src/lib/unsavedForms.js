// Drafts stay only in memory. Passwords and other values are never persisted.
export const forms = new Map()
export const values = form => JSON.stringify([...form.querySelectorAll('input,textarea,select,img')]
  .filter(el => !['submit', 'button', 'reset', 'hidden'].includes(el.type))
  .map(el => [el.id || el.name, el.tagName === 'IMG' ? el.getAttribute('src') : el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value]))
export function dirty(form) { return form.isConnected && forms.has(form) && forms.get(form).baseline !== values(form) }
export async function confirmDiscard(root = document, requestConfirmation = async () => false) {
  const affected = [...forms.keys()].filter(form => root.contains(form) && dirty(form))
  if (affected.length && !await requestConfirmation({ title: '¿Descartar los cambios?', description: 'Tienes cambios sin guardar. Si continúas, se perderán los cambios realizados.', confirmLabel: 'Descartar cambios' })) return false
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

export function markFormSectionSaved(form, names) {
  const entry = forms.get(form)
  if (!entry) return
  const current = JSON.parse(values(form))
  const savedNames = new Set(names)
  const savedValues = new Map(current.filter(([name]) => savedNames.has(name)))
  const baseline = new Map(JSON.parse(entry.baseline))
  for (const [name, value] of savedValues) baseline.set(name, value)
  entry.baseline = JSON.stringify([...baseline])
  entry.submitted = entry.baseline
}

