import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test('business users are scoped to memberships and keep counts, filters, search, pagination and mobile layout', async ({ page }) => {
  test.setTimeout(90000)
  const businessId = `users-${Date.now()}`
  const email = `${businessId}@example.test`, password = 'test-password'
  const signup = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  expect(signup.ok).toBe(true)
  const { localId: adminId } = await signup.json()
  const otherBusiness = `${businessId}-other`, professionalId = `professional-${businessId}`
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      await setDoc(doc(db, 'businesses', businessId), { ownerUserId: adminId, name: 'Usuarios test', status: 'active', settings: { timezone: 'America/La_Paz' } })
      await setDoc(doc(db, 'businesses', otherBusiness), { ownerUserId: 'other-owner', status: 'active' })
      await setDoc(doc(db, 'users', adminId), { id: adminId, firstName: 'Admin', lastName: 'Prueba', email, status: 'active', globalRole: 'user', businessIds: [businessId], onboardingComplete: true })
      await setDoc(doc(db, 'memberships', `${businessId}_${adminId}`), { userId: adminId, businessId, role: 'admin', status: 'active', permissions: {} })
      await setDoc(doc(db, 'users', professionalId), { firstName: 'Profesional', lastName: 'Multiempresa', email: `${professionalId}@example.test`, status: 'active', globalRole: 'user', businessIds: [otherBusiness, businessId] })
      await setDoc(doc(db, 'memberships', `${businessId}_${professionalId}`), { userId: professionalId, businessId, role: 'professional', status: 'active' })
      await setDoc(doc(db, 'memberships', `${otherBusiness}_${professionalId}`), { userId: professionalId, businessId: otherBusiness, role: 'professional', status: 'active' })
      for (let index = 1; index <= 12; index++) {
        const userId = `client-${businessId}-${index}`
        await setDoc(doc(db, 'users', userId), { firstName: `Cliente ${String(index).padStart(2, '0')}`, lastName: 'Prueba', email: `${userId}@example.test`, status: 'active', globalRole: 'user', businessIds: [businessId] })
        await setDoc(doc(db, 'memberships', `${businessId}_${userId}`), { userId, businessId, role: 'client', status: index === 12 ? 'inactive' : 'active' })
      }
    })
    await page.goto('/login')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(page).toHaveURL(/dashboard/)
    await page.goto('/usuarios')
    const users = page.getByRole('region', { name: 'Usuarios', exact: true })
    await expect(users.getByRole('row')).toHaveCount(11)
    await expect(page.locator('.admin-summary-item').filter({ hasText: 'Administradores' })).toContainText('1')
    await expect(page.locator('.admin-summary-item').filter({ hasText: 'Profesionales' })).toContainText('1')
    await expect(page.locator('.admin-summary-item').filter({ hasText: 'Clientes' })).toContainText('12')
    await users.getByRole('button', { name: 'Siguiente' }).click()
    await expect(users.getByRole('row')).toHaveCount(5)
    await expect(users).toContainText('Profesional Multiempresa')
    await page.getByLabel('Filtrar por rol').selectOption('professional')
    await expect(users.getByRole('row')).toHaveCount(2)
    await users.getByRole('searchbox').fill('multiempresa')
    await expect(users).toContainText('Profesional Multiempresa')
    await users.getByRole('searchbox').fill('sin coincidencia')
    await expect(users).toContainText('No hay resultados para esta selección.')
    await users.getByRole('searchbox').fill('')
    await page.getByLabel('Filtrar por rol').selectOption('admin')
    await expect(users.getByRole('row')).toHaveCount(2)
    await expect(page.getByText('Cuenta protegida', { exact: true })).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    await env.cleanup()
  }
})
