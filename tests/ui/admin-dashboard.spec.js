import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, doc, setDoc } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test('administrator dashboard shows scoped live metrics, pending work and responsive quick actions', async ({ page }) => {
  const id = `admin-dashboard-${Date.now()}`, email = `${id}@example.test`, password = 'Dashboard-test-123!'
  const signup = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  expect(signup.ok).toBe(true)
  const { localId: uid } = await signup.json()
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore(), now = Date.now()
      await setDoc(doc(db, 'users', uid), { id: uid, auth_uid: uid, firstName: 'Alex', lastName: 'Admin', email, status: 'active', globalRole: 'user', businessIds: [id], defaultBusinessId: id, onboardingComplete: true })
      await setDoc(doc(db, 'memberships', `${id}_${uid}`), { userId: uid, businessId: id, role: 'admin', status: 'active' })
      await setDoc(doc(db, 'businesses', id), { id, name: 'Consultorio de prueba', description: 'Atención odontológica', status: 'active', settings: { timezone: 'America/La_Paz' } })
      await setDoc(doc(db, 'clients', `${id}-client`), { businessId: id, firstName: 'María', lastName: 'Cliente', userId: null })
      const reservations = [
        ['confirmed', 'María Cliente', now + 60 * 60_000],
        ['pending', 'Luis Cliente', now + 2 * 60 * 60_000],
        ['cancelled', 'Cancelada Cliente', now + 3 * 60 * 60_000],
        ['completed', 'Finalizada Cliente', now - 60 * 60_000],
      ]
      for (const [status, clientName, start] of reservations) {
        await setDoc(doc(db, 'reservations', `${id}-${status}`), { businessId: id, status, clientName, serviceName: 'Consulta', startAt: Timestamp.fromMillis(start), endAt: Timestamp.fromMillis(start + 30 * 60_000), professionalName: 'Dra. Prueba' })
      }
      await setDoc(doc(db, 'scheduleBlocks', `${id}-block`), { businessId: id, status: 'pending' })
    })
    await page.goto('/login')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(page).toHaveURL(/dashboard$/)
    await expect(page.getByRole('heading', { name: 'Hola, Alex' })).toBeVisible()
    await expect(page.getByRole('main').getByText('Consultorio de prueba')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Pendientes de atención' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Pendientes de atención' }).getByText('Solicitudes de bloqueo')).toBeVisible()
    await expect(page.locator('.pending-work-item').nth(3).locator('strong')).toHaveText('1')
    await expect(page.getByText('Clientes registrados')).toBeVisible()
    await expect(page.getByText('Reservas finalizadas')).toBeVisible()
    const metrics = page.locator('.business-summary-metric')
    await expect(metrics).toHaveCount(4)
    await expect(metrics.nth(0)).toContainText('3')
    await expect(metrics.nth(1)).toContainText('2')
    await expect(metrics.nth(2)).toContainText('1')
    await expect(metrics.nth(3)).toContainText('1')
    await expect(page.getByRole('heading', { name: 'Estado de las reservas' })).toBeVisible()
    await expect(page.locator('.business-status-row')).toHaveCount(8)
    await expect(page.locator('.business-status-row>small').filter({ hasText: '25%' })).toHaveCount(4)
    await expect(page.getByRole('img', { name: /Reservas por día durante los últimos 7 días/ })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Período del gráfico' })).toHaveValue('7')
    await page.getByRole('combobox', { name: 'Período del gráfico' }).selectOption('30')
    await expect(page.getByRole('heading', { name: 'Citas de los últimos 30 días' })).toBeVisible()
    const nextAppointment = page.getByRole('link', { name: /María Cliente.*Consulta/ })
    await expect(nextAppointment).toBeVisible()
    await expect(nextAppointment).toContainText('Confirmada')
    await expect(page.locator('.business-next-list').getByText('Cancelada Cliente')).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Nueva reserva/ })).toHaveAttribute('href', '/reservas/nueva')
    await expect(page.getByRole('link', { name: /Ver agenda/ }).last()).toHaveAttribute('href', '/agenda')
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  } finally { await env.cleanup() }
})
