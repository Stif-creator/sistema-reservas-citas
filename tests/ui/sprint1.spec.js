import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test.use({ actionTimeout: 15000 })

test('administrator registers professionals, assigns services/hours, manages roles and applies blocks', async ({ page, browser }) => {
  test.setTimeout(120000)
  const suffix = Date.now()
  const email = `managed-${suffix}@example.test`
  const password = 'test-password'
  const future = new Date()
  future.setUTCDate(future.getUTCDate() + 14)
  while (future.getUTCDay() !== 1) future.setUTCDate(future.getUTCDate() + 1)
  const date = future.toISOString().slice(0, 10)

  await page.goto('/crear-negocio')
  await page.getByLabel('Nombre', { exact: true }).fill('Ana')
  await page.getByLabel('Apellido', { exact: true }).fill('Propietaria')
  await page.getByLabel('Correo electrónico').fill(`admin-${suffix}@example.test`)
  await page.getByLabel('Teléfono').fill('70000000')
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByLabel('Confirmar contraseña').fill(password)
  await page.getByLabel('Nombre del negocio').fill('Negocio Sprint Uno')
  await page.getByRole('button', { name: 'Crear mi negocio' }).click()
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()

  await page.getByRole('link', { name: 'Configuración', exact: true }).click()
  const businessId = (await page.locator('a[target="_blank"]').getAttribute('href')).split('/').pop()
  await page.getByRole('button', { name: 'Agregar franja' }).first().click()
  await page.getByLabel('Lunes, inicio de franja 1').fill('09:00')
  await page.getByLabel('Lunes, fin de franja 1').fill('12:00')
  await page.getByRole('button', { name: 'Guardar horario', exact: true }).click()
  await expect(page.getByText('Horario guardado.', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Servicios', exact: true }).click()
  await page.locator('#catName').fill('Bienestar')
  await page.getByRole('button', { name: 'Crear categoría' }).click()
  await expect(page.getByText('Categoría creada.', { exact: true })).toBeVisible()
  await page.locator('#svcName').fill('Consulta')
  await page.locator('#svcCategoryId').selectOption({ label: 'Bienestar' })
  await page.locator('#svcPrice').fill('100')
  await page.locator('#svcDuration').fill('30')
  await page.getByRole('button', { name: 'Crear servicio' }).click()
  await expect(page.getByText('Servicio creado.', { exact: true })).toBeVisible()

  const publicPage = await browser.newPage()
  await publicPage.goto(`http://127.0.0.1:4173/b/${businessId}`)
  await expect(publicPage.getByRole('heading', { name: 'Consulta', exact: true })).toBeVisible()
  const serviceRow = page.getByRole('row').filter({ hasText: 'Consulta' })
  await serviceRow.getByRole('button', { name: 'Editar', exact: true }).click()
  await page.locator('#svcName').fill('Consulta actualizada')
  await page.locator('#svcPrice').fill('125.50')
  await page.locator('#svcDuration').fill('45')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByText('Servicio actualizado.', { exact: true })).toBeVisible()
  await expect(publicPage.getByRole('heading', { name: 'Consulta actualizada', exact: true })).toBeVisible()
  await publicPage.close()
  await page.reload()
  await expect(serviceRow).toContainText('Consulta actualizada')
  await expect(serviceRow).toContainText('125.5 BOB')
  await expect(serviceRow).toContainText('45 min')
  await serviceRow.getByRole('button', { name: 'Editar', exact: true }).click()
  await page.locator('#svcName').fill('Consulta')
  await page.locator('#svcPrice').fill('100')
  await page.locator('#svcDuration').fill('30')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByText('Servicio actualizado.', { exact: true })).toBeVisible()

  // An old imported document may contain another document's embedded id.
  // Editing it must target its actual Firestore path, not that stored field.
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: {
    host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8'),
  } })
  try {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      const snapshot = await getDocs(query(collection(db, 'services'), where('businessId', '==', businessId)))
      const original = snapshot.docs[0]
      await setDoc(doc(db, 'services', `legacy-${suffix}`), { ...original.data(), id: original.id, name: 'Servicio demo 01' })
    })
  } finally { await env.cleanup() }
  const demoRow = page.getByRole('row').filter({ hasText: 'Servicio demo 01' })
  await demoRow.getByRole('button', { name: 'Editar', exact: true }).click()
  await page.locator('#svcPrice').fill('200')
  await page.locator('#svcDuration').fill('60')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(demoRow).toContainText('200 BOB')
  await expect(demoRow).toContainText('60 min')
  await expect(serviceRow).toContainText('100 BOB')
  await page.reload()
  await expect(demoRow).toContainText('200 BOB')

  await page.getByRole('link', { name: 'Profesionales', exact: true }).click()
  async function fillProfessional() {
    await page.getByLabel('Nombre del profesional', { exact: true }).fill('Luis')
    await page.getByLabel('Apellido del profesional').fill('Prueba')
    await page.getByLabel('Correo del profesional').fill(email)
    await page.getByLabel('Teléfono del profesional').fill('70000001')
    await page.getByLabel('Contraseña inicial', { exact: true }).fill(password)
    await page.getByLabel('Confirmar contraseña inicial').fill(password)
  }
  await fillProfessional()
  await page.getByRole('button', { name: 'Registrar profesional', exact: true }).click()
  await expect(page.getByText('Profesional registrado y activo.', { exact: false })).toBeVisible()
  // A duplicate account fails clearly and leaves the owner signed in.
  await fillProfessional()
  await page.getByRole('button', { name: 'Registrar profesional', exact: true }).click()
  await expect(page.getByText('Ese correo ya está registrado.')).toBeVisible()
  // The existing project includes profiles such as professional_001, with no id field.
  const legacyEnv = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: {
    host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8'),
  } })
  try {
    await legacyEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      const profiles = await getDocs(query(collection(db, 'professionals'), where('businessId', '==', businessId)))
      const original = profiles.docs[0]
      const data = { ...original.data(), serviceIds: ['deleted-service'] }
      delete data.id
      await setDoc(doc(db, 'professionals', `professional_001-${suffix}`), data)
      await deleteDoc(original.ref)
    })
  } finally { await legacyEnv.cleanup() }
  await page.reload()
  await expect(page.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  await page.getByLabel('Consulta', { exact: true }).check()
  await page.getByRole('button', { name: 'Guardar servicios', exact: true }).click()
  await expect(page.getByText('Servicios asignados actualizados.')).toBeVisible()
  await page.getByRole('button', { name: 'Agregar franja' }).first().click()
  await page.getByLabel('Lunes, inicio de franja 1').fill('09:00')
  await page.getByLabel('Lunes, fin de franja 1').fill('12:00')
  await page.getByRole('button', { name: 'Guardar horario', exact: true }).click()
  await expect(page.getByText('Horario guardado.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()

  const context = await browser.newContext()
  const professional = await context.newPage()
  try {
    await professional.goto('http://127.0.0.1:4173/login')
    await professional.getByLabel('Correo electrónico').fill(email)
    await professional.getByLabel('Contraseña', { exact: true }).fill(password)
    await professional.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(professional.getByRole('heading', { name: 'Hola, Luis' })).toBeVisible()
    await professional.goto('http://127.0.0.1:4173/usuarios')
    await expect(professional).toHaveURL(/\/dashboard$/)
    await professional.getByRole('link', { name: 'Disponibilidad', exact: true }).click()
    await professional.getByLabel('Servicio', { exact: true }).selectOption({ label: 'Consulta' })
    await professional.getByLabel('Fecha', { exact: true }).fill(date)
    const available = professional.getByRole('list', { name: 'Horarios disponibles' })
    await expect(available.getByText('10:00', { exact: true })).toBeVisible()

    await page.getByRole('link', { name: 'Bloqueos', exact: true }).click()
    await page.getByLabel('Título', { exact: true }).fill('Reunión')
    await page.getByLabel('Desde', { exact: true }).fill(`${date}T10:00`)
    await page.getByLabel('Hasta', { exact: true }).fill(`${date}T11:00`)
    await page.getByRole('button', { name: 'Crear bloqueo' }).click()
    await expect(page.getByText('Bloqueo creado.', { exact: true })).toBeVisible()
    await expect(available.getByText('10:00', { exact: true })).toHaveCount(0)
    await expect(available.getByText('11:00', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Eliminar', exact: true }).click()
    await expect(available.getByText('10:00', { exact: true })).toBeVisible()

    await page.getByRole('link', { name: 'Usuarios', exact: true }).click()
    await expect(page.getByLabel('Rol de Ana Propietaria')).toBeDisabled()
    const row = page.getByRole('row').filter({ hasText: 'Luis Prueba' })
    await row.getByLabel('Rol de Luis Prueba').selectOption('client')
    await row.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByText('Rol y estado actualizados.', { exact: false })).toBeVisible()
    await expect(professional).toHaveURL(/\/cliente$/)
    await expect(professional.getByRole('link', { name: 'Bloqueos', exact: true })).toHaveCount(0)

    await row.getByLabel('Rol de Luis Prueba').selectOption('admin')
    await row.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(professional.getByRole('link', { name: 'Usuarios', exact: true })).toBeVisible()
    await row.getByLabel('Estado de Luis Prueba').selectOption('inactive')
    await row.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(professional.getByText('Tu cuenta o membresía no está activa.', { exact: false })).toBeVisible()

    await row.getByLabel('Rol de Luis Prueba').selectOption('professional')
    await row.getByLabel('Estado de Luis Prueba').selectOption('active')
    await row.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(professional.getByRole('heading', { name: 'Hola, Luis' })).toBeVisible()
    await professional.getByRole('link', { name: 'Disponibilidad', exact: true }).click()
    await professional.getByLabel('Servicio', { exact: true }).selectOption({ label: 'Consulta' })
    await professional.getByLabel('Fecha', { exact: true }).fill(date)
    await expect(professional.getByRole('list', { name: 'Horarios disponibles' }).getByText('10:00', { exact: true })).toBeVisible()
  } finally { await context.close().catch(() => {}) }
})
