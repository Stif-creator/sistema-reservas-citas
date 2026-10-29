import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, Timestamp } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

async function createAccount(email, password) {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  expect(response.ok).toBe(true)
  return (await response.json()).localId
}

test('superadmin support searches paginated businesses and shows read-only verified diagnostics', async ({ page }) => {
  const suffix = Date.now(), uid = await createAccount(`support-${suffix}@example.test`, 'Demo-secret-123!')
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  const businessId = `support-${suffix}-30`, incompleteId = `support-${suffix}-incomplete`, now = Timestamp.now()
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      await setDoc(doc(db, 'users', uid), { id: uid, auth_uid: uid, firstName: 'Support', lastName: 'Admin', email: `support-${suffix}@example.test`, status: 'active', globalRole: 'superadmin', businessIds: [], onboardingComplete: true })
      for (let index = 0; index <= 30; index += 1) {
        const id = `support-${suffix}-${String(index).padStart(2, '0')}`
        await setDoc(doc(db, 'businesses', id), { id, name: `Soporte Demo ${String(index).padStart(2, '0')}`, status: 'active', ownerUserId: 'owner', settings: { publicPageEnabled: true },
          weeklyHours: { '1': [{ start: '09:00', end: '17:00' }] }, contact: { phone: '+59170000000' },
          location: { addressLine: 'Calle Demo 10', city: 'La Paz', latitude: -16.5, longitude: -68.1 },
          logo: { url: 'https://example.test/logo.png' }, cover: { url: 'https://example.test/cover.png' },
          appearance: { primaryColor: '#1672ed', secondaryColor: '#eaf3ff' } })
      }
      await setDoc(doc(db, 'businesses', incompleteId), { id: incompleteId, name: `Soporte Incompleto ${suffix}`, status: 'inactive', settings: { publicPageEnabled: false } })
      await setDoc(doc(db, 'memberships', `${businessId}_professional`), { businessId, userId: 'support-professional', role: 'professional', status: 'active' })
      await setDoc(doc(db, 'services', `${businessId}_service`), { businessId, name: 'Servicio publicado', isActive: true, isPublic: true })
      await setDoc(doc(db, 'reservations', `${businessId}_reservation`), { businessId, createdAt: now, status: 'confirmed', clientName: 'Cliente privado de prueba' })
      await setDoc(doc(db, 'auditLogs', `${businessId}_audit`), { businessId, actorUserId: uid, action: 'businessUpdate', beforeName: 'Nombre anterior', afterName: 'Soporte Demo 30', createdAt: now })
    })
    await page.goto('/login')
    await page.getByLabel('Correo electrónico').fill(`support-${suffix}@example.test`)
    await page.getByLabel('Contraseña', { exact: true }).fill('Demo-secret-123!')
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(page).toHaveURL(/dashboard$/)
    await page.goto('/plataforma/soporte')
    await expect(page.getByRole('button', { name: 'Cargar más negocios' })).toBeVisible()
    await page.getByRole('button', { name: 'Cargar más negocios' }).click()
    await expect.poll(async () => page.getByLabel('Seleccionar negocio para diagnóstico').locator('option').count()).toBeGreaterThan(30)
    await page.getByLabel('Buscar negocio por nombre').fill('Soporte Demo 30')
    await expect.poll(() => page.getByLabel('Seleccionar negocio para diagnóstico').locator('option').allTextContents()).toContain('Soporte Demo 30')
    await page.getByLabel('Seleccionar negocio para diagnóstico').selectOption(businessId)
    await expect(page.getByRole('heading', { name: 'Soporte Demo 30' })).toBeVisible()
    await expect(page.getByText('1', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Actividad administrativa disponible en el historial.')).toHaveCount(0)
    await expect(page.getByText('Configuración actualizada')).toBeVisible()
    await expect(page.getByText('Cliente privado de prueba')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Editar negocio' })).toHaveAttribute('href', `/plataforma/negocios/${businessId}/editar`)
    await expect(page.getByRole('link', { name: 'Página pública Abrir página en otra pestaña' })).toHaveAttribute('target', '_blank')
    await page.getByRole('button', { name: 'Actualizar diagnóstico' }).click()
    await expect(page.getByText('Reservas del período')).toBeVisible()
    await page.getByLabel('Buscar negocio por nombre').fill('Soporte Incompleto')
    await expect.poll(() => page.getByLabel('Seleccionar negocio para diagnóstico').locator('option').allTextContents()).toContain(`Soporte Incompleto ${suffix}`)
    await page.getByLabel('Seleccionar negocio para diagnóstico').selectOption(incompleteId)
    await expect(page.getByRole('heading', { name: `Soporte Incompleto ${suffix}` })).toBeVisible()
    await expect(page.getByText('Horarios incompletos')).toBeVisible()
    await expect(page.getByText('Página pública desactivada')).toBeVisible()
    await expect(page.getByText('Datos de contacto').locator('..').getByText('Incompleto')).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    await env.cleanup()
  }
})
