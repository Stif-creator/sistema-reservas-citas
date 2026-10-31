import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, doc, getDoc, setDoc } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

async function createAccount(email, password) {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  expect(response.ok).toBe(true)
  return (await response.json()).localId
}

async function login(page, email, password) {
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page).toHaveURL(/dashboard$/)
}

test('service editor previews live changes, preserves cancelled edits and manages images', async ({ page }) => {
  const businessId = `services-${Date.now()}`, email = `${businessId}@example.test`, password = 'Services-test-123!'
  const uid = await createAccount(email, password)
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      await setDoc(doc(db, 'users', uid), { id: uid, auth_uid: uid, firstName: 'Alex', lastName: 'Admin', email, status: 'active', globalRole: 'user', businessIds: [businessId], defaultBusinessId: businessId, onboardingComplete: true })
      await setDoc(doc(db, 'memberships', `${businessId}_${uid}`), { userId: uid, businessId, role: 'admin', status: 'active' })
      await setDoc(doc(db, 'businesses', businessId), { id: businessId, name: 'Clínica de prueba', status: 'active', settings: { timezone: 'America/La_Paz', currencyCode: 'BOB' } })
      await setDoc(doc(db, 'categories', 'dentistry'), { id: 'dentistry', businessId, name: 'Odontología', description: '', isActive: true, displayOrder: 1 })
      await setDoc(doc(db, 'categories', 'children'), { id: 'children', businessId, name: 'Odontopediatría', description: '', isActive: true, displayOrder: 2 })
      await setDoc(doc(db, 'categories', 'inactive'), { id: 'inactive', businessId, name: 'Cirugía dental', description: '', isActive: false, displayOrder: 3 })
      await setDoc(doc(db, 'professionals', 'professional-one'), { id: 'professional-one', businessId, userId: 'professional-user', displayName: 'Camila Vargas', isActive: true, serviceIds: ['consultation'] })
      await setDoc(doc(db, 'services', 'consultation'), {
        id: 'consultation', businessId, name: 'Consulta dental', description: 'Evaluación inicial.', categoryId: 'dentistry', price: 100,
        durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 10, isActive: true, isPublic: true,
        image: { url: null, publicId: null }, professionalIds: ['professional-one'], currencyCode: 'BOB', createdAt: Timestamp.now(),
      })
    })

    let imageRequest = 0
    await page.route('**/images', async route => {
      imageRequest++
      await new Promise(resolve => setTimeout(resolve, 250))
      if (imageRequest === 1) return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: { message: 'No se pudo subir la imagen de prueba.' } }) })
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { url: 'https://cdn.example.test/service-preview.png' } }) })
    })

    await login(page, email, password)
    await page.goto('/servicios')
    await expect(page.getByRole('heading', { name: 'Servicios' })).toBeVisible()
    const row = page.getByRole('row', { name: /Consulta dental/ })
    await expect(row).toBeVisible()

    await row.getByRole('button', { name: 'Detalle' }).click()
    const details = page.getByRole('dialog', { name: 'Consulta dental' })
    await expect(details.getByText('Camila Vargas')).toBeVisible()
    await expect(details.getByText(/Creado el/)).toBeVisible()
    await expect(details.getByText(/Actualizado el/)).toHaveCount(0)
    await details.getByRole('button', { name: 'Editar servicio' }).click()

    const editor = page.getByRole('dialog', { name: 'Editar servicio' })
    const preview = editor.locator('.service-preview')
    await expect(preview.getByRole('heading', { name: 'Consulta dental' })).toBeVisible()
    await page.getByLabel('Nombre del servicio').fill('Consulta infantil')
    await page.getByLabel('Categoría', { exact: true }).selectOption('children')
    await page.getByLabel('Descripción').fill('Atención dental para niñas y niños.')
    await page.getByLabel('Precio (BOB)').fill('125')
    await page.getByLabel('Duración (minutos)').fill('45')
    await page.getByLabel('Margen antes (minutos)').fill('5')
    await page.getByLabel('Margen después (minutos)').fill('15')
    await page.locator('input[name="isActive"]').uncheck()
    await expect(preview.getByRole('heading', { name: 'Consulta infantil' })).toBeVisible()
    await expect(preview).toContainText('Odontopediatría')
    await expect(preview).toContainText('125 BOB')
    await expect(preview).toContainText('45 minutos')
    await expect(preview).toContainText('Inactivo')

    const fileInput = editor.locator('.service-image-upload input[type="file"]')
    const testFile = { name: 'preview.png', mimeType: 'image/png', buffer: Buffer.from('test image payload') }
    await fileInput.setInputFiles(testFile)
    await expect(editor.getByRole('status').filter({ hasText: 'Subiendo imagen' })).toBeVisible()
    await expect(editor.getByRole('alert')).toContainText('No se pudo subir la imagen de prueba.')
    await expect(preview.locator('.service-image img')).toHaveCount(0)
    await fileInput.setInputFiles(testFile)
    await expect(preview.locator('.service-image img')).toHaveAttribute('src', 'https://cdn.example.test/service-preview.png')
    await editor.getByRole('button', { name: 'Quitar imagen' }).click()
    await expect(preview.locator('.service-image img')).toHaveCount(0)

    await editor.getByRole('button', { name: 'Cancelar' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar cambios' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    let original
    await env.withSecurityRulesDisabled(async context => { original = (await getDoc(doc(context.firestore(), 'services', 'consultation'))).data() })
    expect(original.name).toBe('Consulta dental')
    expect(original.categoryId).toBe('dentistry')
    expect(original.price).toBe(100)
    expect(original.image.url).toBeNull()

    await page.getByRole('row', { name: /Consulta dental/ }).getByRole('button', { name: 'Editar' }).click()
    await page.getByLabel('Nombre del servicio').fill('Consulta familiar')
    await page.getByLabel('Categoría', { exact: true }).selectOption('children')
    await page.getByLabel('Precio (BOB)').fill('130')
    await page.getByLabel('Duración (minutos)').fill('50')
    await page.getByLabel('Margen antes (minutos)').fill('5')
    await page.getByLabel('Margen después (minutos)').fill('15')
    await page.locator('input[name="isActive"]').uncheck()
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Servicio actualizado')).toBeVisible()
    await expect(page.getByRole('row', { name: /Consulta familiar/ })).toBeVisible()
    let saved
    await env.withSecurityRulesDisabled(async context => { saved = (await getDoc(doc(context.firestore(), 'services', 'consultation'))).data() })
    expect(saved.name).toBe('Consulta familiar')
    expect(saved.categoryId).toBe('children')
    expect(saved.price).toBe(130)
    expect(saved.durationMinutes).toBe(50)
    expect(saved.bufferBeforeMinutes).toBe(5)
    expect(saved.bufferAfterMinutes).toBe(15)
    expect(saved.isActive).toBe(false)

    await page.getByRole('button', { name: 'Nuevo servicio' }).click()
    const createDialog = page.getByRole('dialog', { name: 'Nuevo servicio' })
    await expect(page.locator('label[for="service-price"]')).toContainText('BOB')
    await page.getByLabel('Nombre del servicio').fill('Limpieza dental')
    await page.getByLabel('Categoría', { exact: true }).selectOption('dentistry')
    await page.getByLabel('Descripción').fill('Limpieza preventiva.')
    await page.getByLabel('Precio (BOB)').fill('90')
    await page.getByLabel('Duración (minutos)').fill('25')
    await expect(createDialog.locator('.service-preview')).toContainText('Limpieza dental')
    await expect(createDialog.locator('.service-associated')).toContainText('todavía no tiene profesionales asignados')
    await expect(page.getByLabel('Categoría', { exact: true }).locator('option[value="inactive"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Crear servicio' }).click()
    await expect(page.getByText('Servicio creado')).toBeVisible()
    await expect(page.getByRole('row', { name: /Limpieza dental/ })).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('row', { name: /Limpieza dental/ }).getByRole('button', { name: 'Editar' }).click()
    const mobileDialog = page.getByRole('dialog', { name: 'Editar servicio' })
    await expect(mobileDialog.getByRole('button', { name: 'Guardar cambios' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await mobileDialog.getByRole('button', { name: 'Cancelar' }).click()
    await expect(mobileDialog).toHaveCount(0)
    expect(errors).toEqual([])
  } finally { await env.cleanup() }
})

test('professionals can inspect assigned services without administrator actions', async ({ page }) => {
  const businessId = `professional-services-${Date.now()}`, email = `${businessId}@example.test`, password = 'Professional-test-123!'
  const uid = await createAccount(email, password)
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore(), profileId = `${businessId}_${uid}`
      await setDoc(doc(db, 'users', uid), { id: uid, auth_uid: uid, firstName: 'Camila', lastName: 'Vargas', email, status: 'active', globalRole: 'user', businessIds: [businessId], defaultBusinessId: businessId, onboardingComplete: true })
      await setDoc(doc(db, 'memberships', `${businessId}_${uid}`), { userId: uid, businessId, role: 'professional', status: 'active', professionalId: profileId })
      await setDoc(doc(db, 'businesses', businessId), { id: businessId, name: 'Clínica de prueba', status: 'active', settings: { timezone: 'America/La_Paz', currencyCode: 'BOB' } })
      await setDoc(doc(db, 'categories', 'professional-category'), { id: 'professional-category', businessId, name: 'Odontología', isActive: true, displayOrder: 1 })
      await setDoc(doc(db, 'professionals', profileId), { id: profileId, businessId, userId: uid, displayName: 'Camila Vargas', isActive: true, serviceIds: ['assigned-service'] })
      await setDoc(doc(db, 'services', 'assigned-service'), { id: 'assigned-service', businessId, name: 'Consulta', description: '', categoryId: 'professional-category', price: 70, durationMinutes: 25, isActive: true, isPublic: true, professionalIds: [profileId] })
    })
    await login(page, email, password)
    await page.goto('/mis-servicios')
    await expect(page.getByRole('heading', { name: 'Mis servicios' })).toBeVisible()
    await expect(page.locator('.service-readonly')).toBeVisible()
    await page.getByRole('button', { name: 'Ver detalles' }).click()
    const details = page.getByRole('dialog', { name: 'Consulta' })
    await expect(details.getByText('Asignado a tu perfil')).toBeVisible()
    await expect(details.getByRole('button', { name: 'Editar servicio' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  } finally { await env.cleanup() }
})
