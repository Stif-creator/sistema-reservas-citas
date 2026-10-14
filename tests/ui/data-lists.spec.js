import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, deleteDoc } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test('lists search across pages, update live and keep categories separate', async ({ page }) => {
  test.setTimeout(120000)
  const id = `lists-${Date.now()}`, email = `${id}@example.test`, password = 'test-password'
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  expect(response.ok).toBe(true)
  const { localId: uid } = await response.json()
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      await setDoc(doc(db, 'businesses', id), { ownerUserId: uid, name: 'Negocio Listas', status: 'active', settings: { currencyCode: 'BOB', timezone: 'America/La_Paz' } })
      await setDoc(doc(db, 'users', uid), { firstName: 'Ana', lastName: 'Listas', email, status: 'active', globalRole: 'user', businessIds: [id], onboardingComplete: true })
      await setDoc(doc(db, 'memberships', `${id}_${uid}`), { userId: uid, businessId: id, role: 'admin', status: 'active', permissions: {} })
      await setDoc(doc(db, 'categories', id), { businessId: id, name: 'Odontología', displayOrder: 1, isActive: true })
      for (let i = 1; i <= 23; i++) {
        await setDoc(doc(db, 'services', `${id}-${i}`), { businessId: id, categoryId: id, name: `Consulta ${String(i).padStart(2, '0')}`, price: 100, durationMinutes: 30, isActive: true })
      }
    })
    await page.goto('/login')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(page).toHaveURL(/dashboard/)
    await page.getByRole('link', { name: 'Servicios', exact: true }).click()
    const list = page.getByRole('region', { name: 'Servicios', exact: true })
    await expect(list.locator('tbody tr')).toHaveCount(10)
    await list.getByRole('button', { name: 'Siguiente' }).click()
    await expect(list).toContainText('Página 2 de 3')
    await expect(list.locator('tbody tr').first()).toContainText('Consulta 11')
    await list.getByRole('searchbox').fill('consulta 23')
    await expect(list.locator('tbody tr')).toHaveCount(1)
    await expect(list).toContainText('Página 1 de 1')
    await list.getByRole('searchbox').fill('odontologia')
    await expect(list.locator('tbody tr')).toHaveCount(10)
    await list.getByRole('combobox').selectOption('25')
    await expect(list.locator('tbody tr')).toHaveCount(23)
    await list.getByRole('searchbox').fill('inexistente')
    await expect(list.getByText('No hay resultados para esta selección.')).toBeVisible()
    await list.getByRole('searchbox').fill('nueva')
    await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'services', `${id}-live`), { businessId: id, categoryId: id, name: 'Nueva consulta', price: 90, durationMinutes: 30, isActive: true }))
    await expect(list.locator('tbody tr')).toHaveCount(1)
    await env.withSecurityRulesDisabled(context => deleteDoc(doc(context.firestore(), 'services', `${id}-live`)))
    await expect(list.locator('tbody tr')).toHaveCount(0)
    await expect(page.locator('#catName')).toHaveCount(0)
    await list.getByRole('searchbox').fill('')
    await page.getByRole('searchbox', { name: 'Buscar en las listas de esta página' }).fill('Consulta 23')
    await expect(list.locator('tbody tr')).toHaveCount(1)
    await page.getByRole('link', { name: 'Categorías', exact: true }).click()
    await expect(page.locator('#catName')).toBeVisible()
    await expect(page.locator('#svcName')).toHaveCount(0)
    await page.getByRole('region', { name: 'Categorías', exact: true }).getByRole('searchbox').fill('odontologia')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  } finally { await env.cleanup() }
})
