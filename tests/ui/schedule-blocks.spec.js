import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test('admin creates and inspects a business block for a specific time range', async ({ page }) => {
  const businessId = `blocks-${Date.now()}`
  const email = `${businessId}@example.test`
  const password = 'Blocks-test-123!'
  const signup = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  expect(signup.ok).toBe(true)
  const { localId: uid } = await signup.json()
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      await setDoc(doc(db, 'users', uid), { id: uid, auth_uid: uid, firstName: 'Admin', lastName: 'Bloqueos', email, status: 'active', globalRole: 'user', businessIds: [businessId], defaultBusinessId: businessId, onboardingComplete: true })
      await setDoc(doc(db, 'memberships', `${businessId}_${uid}`), { userId: uid, businessId, role: 'admin', status: 'active' })
      await setDoc(doc(db, 'businesses', businessId), { id: businessId, name: 'Consultorio de prueba', status: 'active', settings: { timezone: 'America/La_Paz' } })
    })

    await page.goto('/login')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(page).toHaveURL(/dashboard$/)
    await page.goto('/bloqueos')
    await expect(page.getByRole('heading', { name: 'Bloqueos' })).toBeVisible()
    await expect(page.locator('.blocks-stats')).toContainText('0')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Nuevo bloqueo' }).click()

    const dialog = page.getByRole('dialog', { name: 'Nuevo bloqueo' })
    expect(await dialog.evaluate(element => element.getBoundingClientRect().width)).toBeLessThanOrEqual(390)
    expect(await dialog.locator('.editor-dialog-content').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    await dialog.getByRole('button', { name: 'Horario específico' }).click()
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 14)
    const date = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`
    await dialog.getByLabel('Título').fill('Reunión de prueba')
    await dialog.getByLabel('Fecha', { exact: true }).fill(date)
    await dialog.getByLabel('Hora inicio').fill('14:00')
    await dialog.getByLabel('Hora fin').fill('16:00')
    await dialog.getByRole('button', { name: 'Crear bloqueo' }).click()

    await expect(dialog).toHaveCount(0)
    const row = page.getByRole('row', { name: /Reunión de prueba/ })
    await expect(row).toContainText('02:00 p. m.')
    await expect(row).toContainText('04:00 p. m.')
    await row.getByRole('button', { name: 'Ver' }).click()
    const details = page.getByRole('dialog', { name: 'Detalle del bloqueo' })
    await expect(details).toContainText('Horario específico')
    await expect(details).toContainText('Reunión')
    await details.getByRole('button', { name: 'Cerrar' }).last().click()
  } finally {
    await env.cleanup()
  }
})
