import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test.use({ actionTimeout: 15000, navigationTimeout: 20000 })

test('client date guidance, next availability, no preference, repeat booking and calendar download', async ({ page }) => {
  test.setTimeout(180000)
  const suffix = Date.now()
  const businessId = `sprint2-${suffix}`
  const serviceId = `service-${suffix}`, professionalId = `legacy-pro-${suffix}`
  const password = 'test-password'
  const accounts = {}
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  for (const role of ['admin', 'client', 'professional']) {
    const email = `${role}-sprint2-${suffix}@example.test`
    const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
    })
    expect(response.ok).toBe(true)
    accounts[role] = { email, uid: (await response.json()).localId }
  }
  const date = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const hours = Object.fromEntries(Array.from({ length: 7 }, (_, index) => [String(index + 1), [{ start: '09:00', end: '17:00' }]]))
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await setDoc(doc(db, 'businesses', businessId), { ownerUserId: accounts.admin.uid, name: 'Negocio Reservas', status: 'active', weeklyHours: hours,
      appearance: { primaryColor: '#7c3aed', secondaryColor: '#f0e7ff' },
      settings: { publicPageEnabled: true, timezone: 'America/La_Paz', currencyCode: 'BOB', minAdvanceMinutes: 0, maxAdvanceDays: 90, bookingIntervalMinutes: 30, cancellationLimitHours: 24, autoConfirmBookings: false } })
    for (const [role, account] of Object.entries(accounts)) {
      await setDoc(doc(db, 'users', account.uid), { id: account.uid, auth_uid: account.uid, firstName: role === 'client' ? 'María' : role === 'admin' ? 'Dueña' : 'Ana', lastName: 'Prueba', email: account.email, phone: '70000000', status: 'active', globalRole: 'user', businessIds: [businessId], onboardingComplete: true })
      await setDoc(doc(db, 'memberships', `${businessId}_${account.uid}`), { userId: account.uid, businessId, role, status: 'active', permissions: {} })
    }
    await setDoc(doc(db, 'clients', `client-${suffix}`), { businessId, userId: accounts.client.uid, firstName: 'María', lastName: 'Prueba', email: accounts.client.email, phone: '70000000' })
    await setDoc(doc(db, 'categories', `category-${suffix}`), { businessId, name: 'Bienestar', isActive: true })
    await setDoc(doc(db, 'services', serviceId), { businessId, name: 'Consulta integral', description: 'Atención personalizada.', price: 100, durationMinutes: 30, currencyCode: 'BOB', categoryId: `category-${suffix}`, isActive: true, isPublic: true })
    await setDoc(doc(db, 'professionals', professionalId), { businessId, userId: accounts.professional.uid, displayName: 'Ana Agenda', jobTitle: 'Especialista', serviceIds: [serviceId], isActive: true, weeklyHours: hours })
  })
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore(), uid = `second-${suffix}`
    await setDoc(doc(db, 'users', uid), { firstName: 'Luis', lastName: 'Prueba', status: 'active' })
    await setDoc(doc(db, 'memberships', `${businessId}_${uid}`), { businessId, userId: uid, role: 'professional', status: 'active' })
    await setDoc(doc(db, 'professionals', uid), { businessId, userId: uid, displayName: 'Luis Prueba', serviceIds: [serviceId], isActive: true, weeklyHours: hours })
  })
  await env.cleanup()
  async function login(target, role) {
    await target.goto('http://127.0.0.1:4173/login')
    await target.getByLabel('Correo electrónico').fill(accounts[role].email)
    await target.getByLabel('Contraseña', { exact: true }).fill(password)
    await target.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(target).toHaveURL(role === 'client' ? /\/cliente$/ : /\/dashboard$/)
  }
  await login(page, 'client')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('link', { name: 'Reservar una cita', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Navegación rápida' })).toBeVisible()
  await page.getByRole('link', { name: 'Reservar una cita', exact: true }).click()
  await page.locator('.booking-choices').getByRole('button', { name: /^Consulta integral/ }).click()
  await expect(page.locator('.booking-progress')).toHaveText(/Paso 2 de 4/)
  await expect(page.getByRole('heading', { name: 'Selecciona un profesional', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Sin preferencia de profesional/ }).click()
  const input = page.getByLabel('Fecha de la cita')
  await input.fill('2020-01-01')
  await expect(page.getByRole('alert')).toContainText('fecha pasada')
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeDisabled()
  await input.fill('2099-01-01')
  await expect(page.getByRole('alert')).toContainText('Elige una fecha hasta')
  await input.fill('')
  await expect(page.getByRole('alert')).toContainText('fecha completa')
  // An empty queried day should lead to a real next day, keeping both professionals.
  await page.route('**/booking', async route => {
    const data = route.request().postDataJSON()
    if (data?.action === 'availability' && data.date === date) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { slots: [], quote: { price: 100, durationMinutes: 30, currencyCode: 'BOB' } } }) })
    await route.continue()
  })
  await input.fill(date)
  await expect(page.getByText('No hay horarios disponibles para esta fecha', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Ver próximo día disponible', exact: true }).click()
  const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1)
  await expect(input).toHaveValue(next.toISOString().slice(0, 10))
  await expect(page.getByRole('group', { name: 'Horarios disponibles' })).toBeVisible()
  await page.unroute('**/booking')
  await page.getByRole('group', { name: 'Horarios disponibles' }).getByRole('button', { name: '10:00 Luis Prueba', exact: true }).click()
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await expect(page.locator('.booking-summary')).toContainText('Luis Prueba')
  await expect(page.getByText(/Puedes cambiar o cancelar hasta el/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/client-review-mobile.png', fullPage: true })
  await page.getByRole('button', { name: /^(Confirmar reserva|Solicitar cita)$/ }).click()
  await expect(page.getByRole('heading', { name: '¡Solicitud registrada!' })).toBeVisible()
  await expect(page.getByText(/Tu cita todavía no está confirmada/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Agregar al calendario' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Ver mi reserva', exact: true }).click()
  const detailUrl = page.url()
  await expect(page.getByRole('region', { name: 'Opciones de tu cita' }).getByRole('link', { name: 'Contactar al negocio', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Reservar nuevamente', exact: true }).click()
  await expect(input).toBeVisible()
  await expect(page.locator('.booking-flow')).toContainText('Luis Prueba')
  await page.goto(detailUrl)
  const checkEnv = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  try {
    await checkEnv.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'reservations', detailUrl.split('/').pop()), { status: 'confirmed' }))
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Agregar al calendario' }).click()
    const download = await downloadEvent
    expect(download.suggestedFilename()).toBe('mi-cita.ics')
    const content = await readFile(await download.path(), 'utf8')
    expect(content).toContain('BEGIN:VCALENDAR')
    expect(content).toContain('Luis Prueba')
    await page.goto('/cliente')
    await expect(page.getByRole('heading', { name: 'Ya tienes un momento reservado.', exact: true })).toBeVisible()
    await expect(page.locator('.client-next-card')).toContainText('Consulta integral')
    await page.screenshot({ path: 'test-results/client-new-home-mobile.png', fullPage: true })
  } finally { await checkEnv.cleanup() }
  expect(errors).toEqual([])
})
