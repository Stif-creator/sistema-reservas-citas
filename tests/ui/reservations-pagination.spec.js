import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, Timestamp } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test('reservations use cursor pagination, page-scoped search, mobile cards and authorized detail', async ({ page }) => {
  const suffix = Date.now()
  const businessId = `reservations-page-${suffix}`
  const email = `reservations-admin-${suffix}@example.test`
  const password = 'test-password'
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  expect(response.ok).toBe(true)
  const { localId: uid } = await response.json()
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await setDoc(doc(db, 'businesses', businessId), { ownerUserId: uid, name: 'Negocio paginado', status: 'active', settings: { timezone: 'America/La_Paz' } })
    await setDoc(doc(db, 'users', uid), { id: uid, auth_uid: uid, firstName: 'Admin', lastName: 'Reservas', email, status: 'active', globalRole: 'user', businessIds: [businessId], onboardingComplete: true })
    await setDoc(doc(db, 'memberships', `${businessId}_${uid}`), { userId: uid, businessId, role: 'admin', status: 'active', permissions: {} })
    const start = Date.now() + 86400000
    for (let index = 0; index < 30; index++) {
      const startAt = Timestamp.fromMillis(start + index * 3600000)
      await setDoc(doc(db, 'reservations', `page-${suffix}-${String(index).padStart(2, '0')}`), {
        businessId, status: 'pending', serviceId: 'service', serviceName: 'Consulta', professionalId: 'professional',
        professionalUserId: 'professional-user', professionalName: 'Ana', clientName: `Cliente ${String(index).padStart(2, '0')}`,
        clientEmail: `client${index}@example.test`, startAt, endAt: Timestamp.fromMillis(startAt.toMillis() + 1800000),
      })
    }
  })
  await env.cleanup()

  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto('/reservas')
  await expect(page.getByText('30 reservas con estos filtros')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Cliente 29' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Cliente 04' })).toHaveCount(0)
  await page.getByLabel('Buscar en la página actual').fill('Cliente 00')
  await expect(page.getByText('No hay coincidencias en esta página')).toBeVisible()
  await page.getByLabel('Buscar en la página actual').fill('')
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Cliente 04' })).toBeVisible()
  await page.getByLabel('Buscar en la página actual').fill('Cliente 00')
  await expect(page.getByRole('row').filter({ hasText: 'Cliente 00' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.reservation-mobile-card')).toBeVisible()
  await page.getByRole('link', { name: 'Ver detalle' }).click()
  await expect(page.getByRole('heading', { name: 'Detalle de reserva' })).toBeVisible()
  await expect(page.getByText('Cliente 00', { exact: true })).toBeVisible()
})
