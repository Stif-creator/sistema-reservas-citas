import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test('client booking, admin agenda, manual booking and assigned professional states work end to end', async ({ page, browser }) => {
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
  await env.cleanup()
  const staffContext = await browser.newContext()
  const proContext = await browser.newContext()
  const staff = await staffContext.newPage(), pro = await proContext.newPage()
  async function login(target, role) {
    await target.goto('http://127.0.0.1:4173/login')
    await target.getByLabel('Correo electrónico').fill(accounts[role].email)
    await target.getByLabel('Contraseña', { exact: true }).fill(password)
    await target.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(target).toHaveURL(role === 'client' ? /\/cliente$/ : /\/dashboard$/)
  }
  async function selectTime(target, label) {
    await target.getByLabel('Fecha de la cita').fill(date)
    await target.getByRole('group', { name: 'Horarios disponibles' }).getByRole('button', { name: label, exact: true }).click()
    await target.getByRole('button', { name: 'Continuar', exact: true }).click()
  }
  try {
    await login(page, 'client')
    // Una respuesta de disponibilidad que supera el período de sondeo no debe descartarse.
    let availabilityCalls = 0
    await page.route('**/booking', async route => {
      const input = route.request().postDataJSON()
      if (input?.action === 'availability' && input.date === date) {
        availabilityCalls++
        if (availabilityCalls === 1) {
          const response = await route.fetch()
          await new Promise(resolve => setTimeout(resolve, 16000))
          return route.fulfill({ response })
        }
      }
      return route.continue()
    })
    await page.goto(`/cliente/servicios/${serviceId}`)
    await page.getByRole('link', { name: 'Reservar cita', exact: true }).click()
    await page.getByRole('button', { name: /Ana Agenda/ }).click()
    await page.getByLabel('Fecha de la cita').fill(date)
    await expect(page.getByRole('group', { name: 'Horarios disponibles' })).toBeVisible({ timeout: 25000 })
    expect(availabilityCalls).toBe(1)
    await page.unroute('**/booking')
    await selectTime(page, '10:00')
    await page.getByLabel('Notas adicionales (opcional)').fill('Primera visita')
    await page.getByRole('button', { name: 'Confirmar reserva', exact: true }).click()
    await expect(page.getByRole('heading', { name: '¡Solicitud registrada!' })).toBeVisible({ timeout: 20000 })
    await page.getByRole('link', { name: 'Ver mi reserva', exact: true }).click()
    await expect(page.getByText('Pendiente', { exact: true })).toBeVisible()
    const originalUrl = page.url()

    await login(staff, 'admin')
    await staff.getByRole('link', { name: 'Reservas', exact: true }).click()
    await staff.getByRole('row').filter({ hasText: 'María Prueba' }).getByRole('link', { name: 'Ver detalle' }).click()
    await staff.getByRole('button', { name: 'Confirmar', exact: true }).click()
    await staff.getByRole('button', { name: 'Aplicar cambio', exact: true }).click()
    await expect(page.getByText('Confirmada', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Reprogramar', exact: true }).click()
    await selectTime(page, '11:00')
    // El servidor guarda, pero la respuesta se pierde. El snapshot no debe borrar
    // la solicitud original: reintentar debe recuperar exactamente esa operación.
    const rescheduleRequests = []
    await page.route('**/booking', async route => {
      const input = route.request().postDataJSON()
      if (input?.action === 'reschedule') {
        rescheduleRequests.push(input)
        if (rescheduleRequests.length === 1) {
          const response = await route.fetch()
          expect(response.ok()).toBe(true)
          await new Promise(resolve => setTimeout(resolve, 500))
          return route.abort('failed')
        }
      }
      return route.continue()
    })
    await page.getByRole('button', { name: 'Guardar nuevo horario', exact: true }).click()
    await page.getByRole('button', { name: 'Reintentar confirmación', exact: true }).click()
    await expect(page).toHaveURL(originalUrl)
    expect(rescheduleRequests).toHaveLength(2)
    expect(rescheduleRequests[1]).toEqual(rescheduleRequests[0])
    await page.unroute('**/booking')
    await expect(page.getByText('11:00', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Cancelar cita', exact: true }).click()
    await page.getByLabel('Motivo (opcional)').fill('Cambio de planes')
    await page.getByRole('button', { name: 'Aplicar cambio', exact: true }).click()
    await expect(page.getByText('Cancelada', { exact: true })).toBeVisible()

    await staff.goto('/reservas/nueva')
    await staff.getByRole('button', { name: /Consulta integral/ }).click()
    await staff.getByRole('button', { name: /Ana Agenda/ }).click()
    await selectTime(staff, '11:00')
    await staff.getByLabel('Nombre completo', { exact: true }).fill('Manuel Teléfono')
    await staff.getByLabel('Teléfono', { exact: true }).fill('70000002')
    await staff.getByRole('button', { name: 'Confirmar reserva', exact: true }).click()
    await expect(staff.getByRole('heading', { name: 'Detalle de reserva' })).toBeVisible()
    await expect(staff.getByText('Manuel Teléfono', { exact: true })).toBeVisible()

    await login(pro, 'professional')
    await pro.getByRole('link', { name: 'Reservas', exact: true }).click()
    await expect(pro.getByRole('link', { name: 'Reserva manual', exact: true })).toHaveCount(0)
    await pro.getByRole('row').filter({ hasText: 'Manuel Teléfono' }).getByRole('link', { name: 'Ver detalle' }).click()
    await pro.getByRole('button', { name: 'Confirmar', exact: true }).click()
    await pro.getByRole('button', { name: 'Aplicar cambio', exact: true }).click()
    await expect(staff.getByText('Estado: Confirmada', { exact: true })).toBeVisible()

    await staff.getByRole('link', { name: 'Agenda', exact: true }).click()
    await staff.getByLabel('Fecha de agenda').fill(date)
    for (const label of ['Día', 'Semana', 'Mes']) {
      await staff.getByRole('button', { name: label, exact: true }).click()
      await expect(staff.getByText('Manuel Teléfono', { exact: true })).toBeVisible()
      await expect(staff.getByText('María Prueba', { exact: true })).toHaveCount(0)
    }
    await staff.screenshot({ path: 'test-results/sprint2-agenda.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/cliente/reservar?servicio=${serviceId}`)
    await page.getByRole('button', { name: /Ana Agenda/ }).click()
    await selectTime(page, '12:00')
    await expect(page.locator('.client-site')).toHaveCSS('--brand', '#7c3aed')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: 'test-results/sprint2-confirm-mobile.png', fullPage: true })
    await page.getByRole('button', { name: 'Confirmar reserva', exact: true }).click()
    await expect(page.getByRole('heading', { name: '¡Solicitud registrada!' })).toBeVisible()
    expect(errors).toEqual([])
  } finally { await staffContext.close(); await proContext.close() }
})
