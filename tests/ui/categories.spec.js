import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test('category manager creates, edits, filters and toggles categories without breaking linked history', async ({ page }) => {
  const id = `categories-${Date.now()}`, email = `${id}@example.test`, password = 'Category-test-123!'
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
      const db = context.firestore()
      await setDoc(doc(db, 'users', uid), { id: uid, auth_uid: uid, firstName: 'Alex', lastName: 'Admin', email, status: 'active', globalRole: 'user', businessIds: [id], defaultBusinessId: id, onboardingComplete: true })
      await setDoc(doc(db, 'memberships', `${id}_${uid}`), { userId: uid, businessId: id, role: 'admin', status: 'active' })
      await setDoc(doc(db, 'businesses', id), { id, name: 'Consultorio de prueba', status: 'active', settings: { timezone: 'America/La_Paz', publicPageEnabled: true } })
      await setDoc(doc(db, 'categories', 'care'), { id: 'care', businessId: id, name: 'Odontología general', description: 'Servicios odontológicos.', displayOrder: 1, isActive: true, image: { url: null, publicId: null } })
      await setDoc(doc(db, 'categories', 'inactive-care'), { id: 'inactive-care', businessId: id, name: 'Cirugía dental', description: '', displayOrder: 2, isActive: false, image: { url: null, publicId: null } })
      await setDoc(doc(db, 'services', 'care-service'), { id: 'care-service', businessId: id, categoryId: 'care', name: 'Consulta', isActive: true, isPublic: true })
      await setDoc(doc(db, 'reservations', 'care-history'), { id: 'care-history', businessId: id, serviceId: 'care-service', serviceName: 'Consulta', status: 'completed' })
    })

    await page.goto('/login')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(page).toHaveURL(/dashboard$/)
    await page.goto('/categorias')
    await expect(page.getByRole('heading', { name: 'Categorías' })).toBeVisible()
    await expect(page.locator('.categories-table tbody tr')).toHaveCount(2)

    await page.getByLabel('Estado').selectOption('active')
    await expect(page.locator('.categories-table tbody tr')).toHaveCount(1)
    await page.getByLabel('Estado').selectOption('inactive')
    await expect(page.locator('.categories-table tbody tr')).toHaveCount(1)
    await page.getByLabel('Estado').selectOption('all')

    await page.getByLabel('Buscar categorías').fill('cirugía')
    await expect(page.locator('.categories-table tbody tr')).toHaveCount(1)
    await page.getByLabel('Buscar categorías').fill('')

    await page.getByRole('row', { name: /Odontología general/ }).getByRole('button', { name: 'Editar' }).click()
    await page.getByLabel('Nombre').fill('Cambio sin guardar')
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
    const discard = page.getByRole('alertdialog')
    await expect(discard).toBeVisible()
    await discard.getByRole('button', { name: 'Cancelar' }).click()
    await expect(page.getByRole('dialog', { name: 'Editar categoría' })).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar cambios' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.getByRole('row', { name: /Odontología general/ }).getByRole('button', { name: 'Editar' }).click()
    await expect(page.getByRole('dialog', { name: 'Editar categoría' })).toBeVisible()
    await page.getByLabel('Nombre').fill('Odontología general actualizada')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Categoría actualizada')).toBeVisible()
    await expect(page.getByText('Odontología general actualizada')).toBeVisible()

    await page.getByRole('button', { name: 'Nueva categoría' }).click()
    await page.getByRole('button', { name: 'Crear categoría' }).click()
    await expect(page.getByText('El nombre es obligatorio.')).toBeVisible()
    await page.getByLabel('Nombre').fill(' odontología   GENERAL ACTUALIZADA ')
    await page.getByRole('button', { name: 'Crear categoría' }).click()
    await expect(page.getByText('Ya existe una categoría con ese nombre en este negocio.')).toBeVisible()
    await page.getByLabel('Nombre').fill('Ortopedia')
    await page.locator('.category-active-toggle .category-switch').click()
    await expect(page.locator('.category-active-toggle input')).not.toBeChecked()
    await page.getByRole('button', { name: 'Crear categoría' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText('Ortopedia')).toBeVisible()

    await page.getByLabel('Estado').selectOption('inactive')
    await expect(page.locator('.categories-table tbody tr')).toHaveCount(2)
    await page.getByLabel('Estado').selectOption('active')
    await expect(page.locator('.categories-table tbody tr')).toHaveCount(1)
    await page.getByLabel('Estado').selectOption('all')

    const serviceRow = page.getByRole('row', { name: /Odontología general actualizada/ })
    await serviceRow.getByRole('button', { name: 'Desactivar' }).click()
    const confirmation = page.getByRole('alertdialog')
    await expect(confirmation).toContainText('Los servicios asociados y las reservas existentes se conservarán')
    await confirmation.getByRole('button', { name: 'Desactivar categoría' }).click()
    await expect(page.getByText('Categoría desactivada')).toBeVisible()
    await page.getByRole('row', { name: /Odontología general actualizada/ }).getByRole('button', { name: 'Activar' }).click()
    await expect(page.getByText('Categoría activada')).toBeVisible()

    let serviceData, reservationData
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      serviceData = (await getDoc(doc(db, 'services', 'care-service'))).data()
      reservationData = (await getDoc(doc(db, 'reservations', 'care-history'))).data()
    })
    expect(serviceData.categoryId).toBe('care')
    expect(serviceData.isActive).toBe(true)
    expect(reservationData.serviceId).toBe('care-service')

    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  } finally { await env.cleanup() }
})
