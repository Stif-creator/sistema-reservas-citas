import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc, getDoc } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test('superadmin selects another business; colors are locked again after privilege revocation', async ({ page }) => {
  test.setTimeout(120000)
  const id = `platform-${Date.now()}`, email = `${id}@example.test`, password = 'Demo-secret-123!'
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  expect(response.ok).toBe(true)
  const { localId: uid } = await response.json()
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      await setDoc(doc(db, 'users', uid), { firstName: 'Platform', lastName: 'Test', email, status: 'active', globalRole: 'superadmin', businessIds: [id], onboardingComplete: true })
      for (const bid of [id, `${id}-other`]) await setDoc(doc(db, 'businesses', bid), { id: bid, ownerUserId: bid === id ? uid : 'someone-else', name: bid, status: 'active', settings: { timezone: 'America/La_Paz', currencyCode: 'BOB', publicPageEnabled: true }, appearance: { primaryColor: '#123456', secondaryColor: '#abcdef' } })
      await setDoc(doc(db, 'services', `${id}-service`), { businessId: `${id}-other`, name: 'Consulta', isActive: true, durationMinutes: 30, price: 100 })
      await setDoc(doc(db, 'professionals', `${id}-pro`), { businessId: `${id}-other`, userId: 'pro', displayName: 'Profesional', isActive: true, serviceIds: [`${id}-service`] })
    })
    await page.goto('/login')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(page).toHaveURL(/dashboard/)
    await page.getByLabel('Superadministrador · Negocio').selectOption(`${id}-other`)
    await page.getByRole('link', { name: 'Disponibilidad', exact: true }).click()
    await page.getByLabel('Profesional', { exact: true }).selectOption(`${id}-pro`)
    await page.getByLabel('Servicio', { exact: true }).selectOption(`${id}-service`)
    const first = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
    const last = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)
    await page.getByLabel('Fecha de inicio').fill(first)
    await page.getByLabel('Fecha de fin').fill(last)
    await expect(page.getByRole('heading', { name: /Horarios disponibles/ })).toHaveCount(2)
    await page.getByLabel('Fecha de fin').fill('2020-01-01')
    await expect(page.getByRole('alert')).toContainText('rango ordenado')
    await page.getByRole('link', { name: 'Configuración', exact: true }).click()
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(`${id}-other`)
    await expect(page.getByLabel('Color primario')).toBeEnabled()
    await page.getByLabel('Color primario').fill('#654321')
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      await expect.poll(async () => (await getDoc(doc(db, 'businesses', `${id}-other`))).data().appearance.primaryColor).toBe('#654321')
      await setDoc(doc(db, 'memberships', `${id}_${uid}`), { businessId: id, userId: uid, role: 'admin', status: 'active' })
      await updateDoc(doc(context.firestore(), 'users', uid), { globalRole: 'user' })
    })
    await expect(page.getByLabel('Superadministrador · Negocio')).toHaveCount(0)
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(id)
    await expect(page.getByLabel('Color primario')).toBeDisabled()
    await page.getByRole('link', { name: 'Profesionales', exact: true }).click()
    await page.getByRole('button',{name:'Registrar profesional',exact:true}).click()
    const initial = await page.getByLabel('Contraseña inicial', { exact: true }).inputValue()
    expect(initial.length).toBeGreaterThanOrEqual(20)
    await expect(page.getByLabel('Confirmar contraseña inicial')).toHaveValue(initial)
    await page.getByRole('button',{name:'Cerrar',exact:true}).click()
    await page.getByRole('link', { name: 'Mi seguridad', exact: true }).click()
    await page.getByLabel('Contraseña actual', { exact: true }).fill(password)
    await page.getByLabel('Nueva contraseña', { exact: true }).fill('New-demo-password-789!')
    await page.getByLabel('Confirmar nueva contraseña').fill('New-demo-password-789!')
    await page.getByRole('button', { name: 'Cambiar contraseña', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Contraseña actualizada')
    expect(errors).toEqual([])
    await page.screenshot({ path: 'test-results/platform-security.png', fullPage: true })
  } finally { await env.cleanup() }
})
