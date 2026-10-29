import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, Timestamp } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

async function createAccount(email, password) {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) })
  expect(response.ok).toBe(true)
  return (await response.json()).localId
}

test('superadmin analytics switches from platform totals to private aggregate business metrics', async ({ page }) => {
  const id = `analytics-${Date.now()}`, email = `${id}@example.test`, password = 'Demo-secret-123!'
  const uid = await createAccount(email, password)
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore(), now = Timestamp.now(), past = Timestamp.fromMillis(Date.now() - 7 * 86400000)
      await setDoc(doc(db, 'users', uid), { id: uid, auth_uid: uid, firstName: 'Analytics', lastName: 'Admin', email, status: 'active', globalRole: 'superadmin', businessIds: [], onboardingComplete: true })
      await setDoc(doc(db, 'businesses', id), { id, name: 'Negocio analítica', status: 'active', ownerUserId: 'admin-personal-id' })
      await setDoc(doc(db, 'memberships', `${id}_admin`), { businessId: id, userId: 'admin-personal-id', role: 'admin', status: 'active' })
      await setDoc(doc(db, 'memberships', `${id}_pro`), { businessId: id, userId: 'pro-personal-id', role: 'professional', status: 'active' })
      await setDoc(doc(db, 'professionals', `${id}_pro`), { businessId: id, userId: 'pro-personal-id', isActive: true, displayName: 'Dato personal no visible' })
      await setDoc(doc(db, 'clients', `${id}_client`), { businessId: id, userId: 'client-personal-id', firstName: 'Dato personal no visible' })
      await setDoc(doc(db, 'services', `${id}_service`), { businessId: id, name: 'Servicio', isActive: true })
      await setDoc(doc(db, 'promotions', `${id}_promotion`), { businessId: id, isActive: true, startAt: past, endAt: Timestamp.fromMillis(Date.now() + 86400000) })
      await setDoc(doc(db, 'reservations', `${id}_reservation`), { businessId: id, status: 'confirmed', createdAt: now, clientName: 'Dato personal no visible' })
    })
    await page.goto('/login')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(page).toHaveURL(/dashboard$/)
    await page.goto('/plataforma/estadisticas')
    await expect(page.getByText('Negocios registrados').first()).toBeVisible()
    await page.getByLabel('Buscar negocio por nombre').fill('Negocio analítica')
    await expect.poll(() => page.getByLabel('Alcance de estadísticas').locator('option').allTextContents()).toContain('Negocio analítica')
    await page.getByLabel('Alcance de estadísticas').selectOption(id)
    await expect(page.getByRole('heading', { name: 'Negocio analítica' })).toBeVisible()
    await expect(page.getByText('Clientes registrados').first()).toBeVisible()
    await expect(page.getByText('Dato personal no visible')).toHaveCount(0)
    await expect(page.getByText('100.0%', { exact: true })).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByLabel('Alcance de estadísticas').selectOption('')
    await expect(page.getByText('Membresías administradoras')).toBeVisible()
    expect(errors).toEqual([])
  } finally { await env.cleanup() }
})
