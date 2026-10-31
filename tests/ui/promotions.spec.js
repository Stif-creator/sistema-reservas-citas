import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, Timestamp } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test('promotions calculate statuses, filter offers and preview current service pricing', async ({ page }) => {
  test.setTimeout(90000)
  const suffix = Date.now()
  const businessId = `promotions-${suffix}`
  const email = `promotions-${suffix}@example.test`
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-password', returnSecureToken: true }),
  })
  expect(response.ok).toBe(true)
  const { localId: uid } = await response.json()
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  const today = new Date()
  const startAt = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const startDate = new Date(startAt).toISOString().slice(0, 10)
  const endDate = new Date(startAt + 86400000).toISOString().slice(0, 10)
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await setDoc(doc(db, 'businesses', businessId), { ownerUserId: uid, name: 'Consultorio de prueba', status: 'active', settings: { timezone: 'America/La_Paz' } })
    await setDoc(doc(db, 'users', uid), { id: uid, auth_uid: uid, firstName: 'Admin', lastName: 'Promociones', email, status: 'active', globalRole: 'user', businessIds: [businessId], onboardingComplete: true })
    await setDoc(doc(db, 'memberships', `${businessId}_${uid}`), { userId: uid, businessId, role: 'admin', status: 'active', permissions: {} })
    await setDoc(doc(db, 'services', `service-${suffix}`), { id: `service-${suffix}`, businessId, name: 'Limpieza dental', price: 150, currencyCode: 'BOB', durationMinutes: 30, isActive: true, isPublic: true })
    const offers = [
      ['active', 'Oferta vigente', startAt - 86400000, startAt + 86400000, true],
      ['scheduled', 'Oferta futura', startAt + 86400000, startAt + 172800000, true],
      ['expired', 'Oferta vencida', startAt - 172800000, startAt - 86400000, true],
      ['disabled', 'Oferta desactivada', startAt - 86400000, startAt + 86400000, false],
    ]
    for (const [id, title, start, end, isActive] of offers) await setDoc(doc(db, 'promotions', `${id}-${suffix}`), { id: `${id}-${suffix}`, businessId, serviceId: `service-${suffix}`, serviceName: 'Limpieza dental', title, percent: 10, startAt: Timestamp.fromMillis(start), endAt: Timestamp.fromMillis(end), isActive })
    await setDoc(doc(db, 'reminderSettings', businessId), { businessId, hours: 24 })
  })
  await env.cleanup()

  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto('/promociones')
  await expect(page.getByRole('heading', { name: 'Promociones y recordatorios' })).toBeVisible()
  await expect(page.getByText('Activas').first()).toBeVisible()
  const list = page.getByRole('region', { name: 'Promociones' })
  await expect(list).toContainText('Oferta vigente')
  await expect(list).toContainText('Oferta futura')
  await expect(list).toContainText('Oferta vencida')
  await expect(list).toContainText('Oferta desactivada')
  await expect(list.locator('.promotion-status-active')).toHaveCount(1)
  await expect(list.locator('.promotion-status-scheduled')).toHaveCount(1)
  await expect(list.locator('.promotion-status-expired')).toHaveCount(1)
  await expect(list.locator('.promotion-status-disabled')).toHaveCount(1)

  await page.getByLabel('Filtrar promociones por estado').selectOption('expired')
  await expect(list).toContainText('Oferta vencida')
  await expect(list).not.toContainText('Oferta vigente')
  await page.getByLabel('Filtrar promociones por estado').selectOption('all')
  await page.getByRole('button', { name: 'Nueva promoción' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nueva promoción' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Servicio *').selectOption(`service-${suffix}`)
  await expect(dialog).toContainText('Precio original:')
  await expect(dialog).toContainText('Bs 150,00')
  await expect(dialog).toContainText('Bs 135,00')
  await dialog.getByLabel('Título *').fill('Oferta desde modal')
  await dialog.getByLabel('Desde *').fill(startDate)
  await dialog.getByLabel('Hasta (incluido) *').fill(endDate)
  await dialog.getByRole('button', { name: 'Guardar promoción' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Promoción guardada' })).toBeVisible()
  await expect(list).toContainText('Oferta desde modal')

  await list.getByRole('searchbox', { name: 'Buscar promociones' }).fill('Oferta desde modal')
  await expect(list).toContainText('1–1 de 1 registros')
  await list.getByRole('searchbox', { name: 'Buscar promociones' }).fill('')
  const createdOffer = list.locator('.promotions-row').filter({ hasText: 'Oferta desde modal' })
  await createdOffer.getByRole('button', { name: 'Editar' }).click()
  const editDialog = page.getByRole('dialog', { name: 'Editar promoción' })
  await editDialog.getByLabel('Descuento (%) *').fill('15')
  await expect(editDialog).toContainText('Bs 127,50')
  await editDialog.getByRole('button', { name: 'Guardar promoción' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Promoción actualizada' })).toBeVisible()

  await page.getByLabel('Horas de anticipación adicional').fill('48')
  await page.getByRole('button', { name: 'Guardar anticipación' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Anticipación guardada' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
