import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, Timestamp } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'
import { addDays, dayKey, zonedDateBoundary } from '../../src/lib/calendarDates.js'

test('business agenda supports day, week, month, professional filtering, details and mobile layout', async ({ page, browser }) => {
  const suffix = Date.now()
  const businessId = `agenda-${suffix}`
  const roles = ['admin', 'professional_a', 'professional_b', 'professional_empty']
  const accounts = {}
  for (const role of roles) {
    const email = `${role}-${suffix}@example.test`
    const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-password', returnSecureToken: true }),
    })
    expect(response.ok).toBe(true)
    accounts[role] = { email, uid: (await response.json()).localId }
  }
  const zone = 'America/La_Paz'
  const tomorrow = addDays(dayKey(Date.now(), zone), 1)
  const firstStart = zonedDateBoundary(tomorrow, zone) + 9 * 3600000
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await setDoc(doc(db, 'businesses', businessId), { ownerUserId: accounts.admin.uid, name: 'Agenda de prueba', status: 'active', weeklyHours: Object.fromEntries(Array.from({ length: 7 }, (_, index) => [String(index + 1), [{ start: '08:00', end: '19:00' }]])), settings: { timezone: zone } })
    for (const [role, account] of Object.entries(accounts)) {
      await setDoc(doc(db, 'users', account.uid), { id: account.uid, auth_uid: account.uid, firstName: role, lastName: 'Agenda', email: account.email, status: 'active', globalRole: 'user', businessIds: [businessId], onboardingComplete: true })
      await setDoc(doc(db, 'memberships', `${businessId}_${account.uid}`), { userId: account.uid, businessId, role: role === 'admin' ? 'admin' : 'professional', status: 'active', permissions: {} })
    }
    const professionals = [
      ['professional-a', accounts.professional_a.uid, 'Ana Agenda'],
      ['professional-b', accounts.professional_b.uid, 'Bruno Agenda'],
      ['professional-empty', accounts.professional_empty.uid, 'Carla Sin Citas'],
    ]
    for (const [id, userId, displayName] of professionals) await setDoc(doc(db, 'professionals', id), { businessId, userId, displayName, isActive: true, serviceIds: ['service-agenda'] })
    await setDoc(doc(db, 'services', 'service-agenda'), { businessId, name: 'Consulta general', durationMinutes: 60, price: 100, currencyCode: 'BOB', isActive: true })
    for (const [index, [professionalId, professionalUserId, professionalName]] of [professionals[0], professionals[1]].entries()) {
      const startAt = Timestamp.fromMillis(firstStart + index * 30 * 60000)
      await setDoc(doc(db, 'reservations', `agenda-reservation-${suffix}-${index}`), {
        businessId, status: index === 0 ? 'confirmed' : 'pending', serviceId: 'service-agenda', serviceName: 'Consulta general',
        professionalId, professionalUserId, professionalName, clientName: `Cliente ${index + 1}`, clientEmail: `client${index}@example.test`,
        startAt, endAt: Timestamp.fromMillis(startAt.toMillis() + (index === 0 ? 60 : 45) * 60000), notes: index === 0 ? 'Nota visible existente' : '',
      })
    }
    const oldStart = Timestamp.fromMillis(zonedDateBoundary(addDays(tomorrow, -70), zone) + 9 * 3600000)
    await setDoc(doc(db, 'reservations', `agenda-old-${suffix}`), { businessId, status: 'confirmed', serviceId: 'service-agenda', serviceName: 'Cita histórica', professionalId: 'professional-a', professionalUserId: accounts.professional_a.uid, professionalName: 'Ana Agenda', clientName: 'Cliente histórico', startAt: oldStart, endAt: Timestamp.fromMillis(oldStart.toMillis() + 3600000) })
  })
  await env.cleanup()

  async function login(target, role) {
    await target.goto('/login')
    await target.getByLabel('Correo electrónico').fill(accounts[role].email)
    await target.getByLabel('Contraseña', { exact: true }).fill('test-password')
    await target.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(target).toHaveURL(/\/dashboard$/)
  }

  await login(page, 'admin')
  await page.goto('/agenda')
  await expect(page.getByRole('heading', { name: 'Agenda del negocio' })).toBeVisible()
  await expect(page.getByText('Total de citas de la semana')).toBeVisible()
  await expect(page.getByText('2', { exact: true }).first()).toBeVisible()
  await expect(page.getByLabel('Filtrar profesional')).toContainText('Carla Sin Citas')
  await page.getByLabel('Filtrar profesional').selectOption('professional-empty')
  await expect(page.getByText('Total de citas de la semana')).toBeVisible()
  await expect(page.locator('.agenda-event')).toHaveCount(0)
  await expect(page.getByText('No hay citas agendadas en este período.')).toBeVisible()
  await page.getByLabel('Filtrar profesional').selectOption('')
  await page.getByLabel('Fecha de agenda').fill(tomorrow)
  await page.getByRole('button', { name: 'Día', exact: true }).click()
  await expect(page.locator('.agenda-timeline-day .agenda-event')).toHaveCount(2)
  await expect(page.locator('.agenda-timeline-day .agenda-event-client', { hasText: 'Cliente 1' })).toBeVisible()
  await page.locator('.agenda-timeline-day .agenda-event', { hasText: 'Cliente 1' }).click()
  await expect(page.getByText('Nota visible existente')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ver detalle' })).toHaveAttribute('href', /\/reservas\//)
  await page.getByRole('button', { name: 'Mes', exact: true }).click()
  await expect(page.locator('.agenda-month-cell')).toHaveCount(42)
  await page.getByRole('button', { name: /2 citas/ }).first().click()
  await page.getByRole('button', { name: 'Ver agenda del día' }).click()
  await expect(page.getByRole('button', { name: 'Día', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Semana', exact: true }).click()
  await expect(page.locator('.agenda-week-mobile')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  const professionalContext = await browser.newContext()
  const professionalPage = await professionalContext.newPage()
  try {
    await login(professionalPage, 'professional_a')
    await professionalPage.goto('/agenda')
    await expect(professionalPage.getByRole('heading', { name: 'Mi agenda profesional' })).toBeVisible()
    await expect(professionalPage.getByLabel('Filtrar profesional')).toHaveCount(0)
    await expect(professionalPage.locator('.agenda-timeline-shell .agenda-event')).toHaveCount(1)
    await expect(professionalPage.getByText('Cliente 2', { exact: true })).toHaveCount(0)
  } finally { await professionalContext.close() }
})
