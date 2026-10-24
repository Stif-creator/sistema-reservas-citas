import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, Timestamp } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test('client notification center filters, paginates, marks read and stays responsive', async ({ page }) => {
  test.setTimeout(90000)
  const suffix = Date.now()
  const businessId = `notices-${suffix}`
  const email = `client-${suffix}@example.test`
  const password = 'test-password'
  const authResponse = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  expect(authResponse.ok).toBe(true)
  const uid = (await authResponse.json()).localId
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await setDoc(doc(db, 'businesses', businessId), { ownerUserId: uid, name: 'Negocio Avisos', status: 'active',
      appearance: { primaryColor: '#24245f', secondaryColor: '#e9e7ff', accentColor: '#d97706', surfaceColor: '#f4f2fa' },
      settings: { publicPageEnabled: true, timezone: 'America/La_Paz' } })
    await setDoc(doc(db, 'users', uid), { id: uid, auth_uid: uid, firstName: 'María', lastName: 'Prueba', email, status: 'active', globalRole: 'user', businessIds: [businessId], onboardingComplete: true })
    await setDoc(doc(db, 'memberships', `${businessId}_${uid}`), { userId: uid, businessId, role: 'client', status: 'active', permissions: {} })
    const categories = ['confirmed', 'reminder', 'cancelled', 'completed', 'rescheduled', ...Array(7).fill('reminder')]
    for (const [index, category] of categories.entries()) {
      const title = { confirmed: 'Cita confirmada', reminder: `Recordatorio de cita ${index}`, cancelled: 'Cita cancelada', completed: 'Cita finalizada', rescheduled: 'Cita reprogramada' }[category]
      const createdAt = Timestamp.fromMillis(Date.now() + index)
      await setDoc(doc(db, 'notifications', `notice-${suffix}-${index}`), {
        businessId, recipientUserId: uid, type: category === 'reminder' ? 'reminder' : 'change', title,
        message: `${title}. Consulta integral · Ana Agenda`, serviceName: 'Consulta integral', professionalName: 'Ana Agenda',
        appointmentStartAt: Timestamp.fromDate(new Date(`${date}T15:00:00.000Z`)), visibleAt: createdAt, createdAt, read: false,
      })
    }
  })
  await env.cleanup()

  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page).toHaveURL(/\/cliente$/)
  await page.goto('/cliente/avisos')
  await expect(page.getByRole('heading', { name: 'Avisos y recordatorios' })).toBeVisible()
  expect(await page.locator('.client-site').evaluate(element => getComputedStyle(element).getPropertyValue('--brand').trim())).toBe('#24245f')
  const rows = page.locator('.notice-row')
  const status = page.locator('.data-list-footer [role="status"]')
  await expect(rows).toHaveCount(10)
  await expect(status).toContainText('de 12 registros')
  await expect(page.getByRole('link', { name: 'Avisos: 12 sin leer' })).toBeVisible()
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
  await expect(rows).toHaveCount(2)
  await page.getByRole('button', { name: 'Anterior', exact: true }).click()

  await page.getByLabel('Filtrar por tipo').selectOption('reminder')
  await expect(status).toContainText('de 8 registros')
  await page.getByLabel('Filtrar por lectura').selectOption('unread')
  await page.getByLabel('Fecha desde').fill(date)
  await page.getByLabel('Fecha hasta').fill(date)
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  expect(await page.locator('.notice-filter-actions .public-button').evaluate(element => getComputedStyle(element).color)).toBe('rgb(255, 255, 255)')
  await expect(status).toContainText('de 8 registros')
  await page.getByRole('searchbox', { name: 'Buscar avisos' }).fill('Ana Agenda')
  await expect(status).toContainText('de 8 registros')
  await page.getByRole('searchbox', { name: 'Buscar avisos' }).fill('')
  await page.getByLabel('Filtrar por lectura').selectOption('all')
  await page.getByLabel('Filtrar por tipo').selectOption('all')
  await expect(rows).toHaveCount(10)
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
  await page.locator('.notice-row').filter({ hasText: 'Cita confirmada' }).getByRole('button', { name: /Marcar como leído/ }).click()
  await expect(page.getByRole('link', { name: 'Avisos: 11 sin leer' })).toBeVisible()
  await page.getByRole('button', { name: 'Marcar todos como leídos' }).click()
  await expect(page.getByRole('link', { name: 'Avisos: 0 sin leer' })).toBeVisible({ timeout: 15000 })

  await page.getByRole('button', { name: 'Anterior', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(rows).toHaveCount(10)
})
