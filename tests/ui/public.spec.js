import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test.beforeAll(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-citaspro',
    firestore: {
      rules: await readFile('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'businesses', 'violeta'), {
      id: 'violeta',
      ownerUserId: 'owner-fixture',
      name: 'Estudio Violeta',
      description: 'Un espacio para cuidarte y disfrutar de tu tiempo.',
      status: 'active',
      settings: {
        publicPageEnabled: true,
        timezone: 'America/La_Paz',
        currencyCode: 'BOB',
      },
      appearance: { primaryColor: '#7c3aed', secondaryColor: '#f0e7ff' },
      contact: { phone: '+59170000000' },
    })
    await setDoc(doc(db, 'categories', 'massage-category'), { id: 'massage-category', businessId: 'violeta', name: 'Bienestar', isActive: true, displayOrder: 1 })
    await setDoc(doc(db, 'services', 'massage'), {
      id: 'massage',
      businessId: 'violeta',
      name: 'Masaje relajante',
      description: 'Una pausa para reconectar contigo.',
      price: 150,
      durationMinutes: 60,
      currencyCode: 'BOB',
      categoryId: 'massage-category',
      isActive: true,
      isPublic: true,
    })
  })
  await env.cleanup()
})

test('business identity persists across home, login and registration on desktop and mobile', async ({
  page,
}) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/b/violeta')
    await expect(page.getByRole('heading', { name: 'Servicios disponibles' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Masaje relajante' })).toBeVisible()
    await expect(page.locator('.public-site')).toHaveCSS('--brand', '#7c3aed')
    await expect(page.getByLabel('Filtrar por categoría')).toHaveValue('')
    await page.getByLabel('Filtrar por categoría').selectOption('massage-category')
    await expect(page.locator('.business-service-card')).toHaveCount(1)
    await expect(page.locator('#profesionales')).toBeAttached()
    await expect(page.locator('#promociones')).toBeAttached()
    await expect(page.locator('#opiniones')).toBeAttached()
    if (viewport.width < 1050) await page.getByRole('button', { name: 'Abrir menú' }).click()
    await expect(page.getByRole('link', { name: 'Volver a CitasPro' })).toHaveAttribute('href', '/negocios')
    await expect(page.locator('.business-service-card').getByRole('link', { name: /Reservar/ })).toHaveAttribute('href', '/b/violeta/reservar?servicio=massage')
    await page.getByRole('searchbox', { name: 'Buscar servicios' }).fill('no existe')
    await expect(page.getByText('No hay servicios que coincidan con tu búsqueda.')).toBeVisible()
    await page.getByRole('searchbox', { name: 'Buscar servicios' }).fill('masaje')
    await expect(page.getByRole('heading', { name: 'Masaje relajante' })).toBeVisible()
    await page.screenshot({
      path: `test-results/home-${viewport.width}.png`,
      fullPage: true,
    })
    await page.getByRole('link', { name: 'Iniciar sesión', exact: true }).click()
    await expect(page).toHaveURL(/\/b\/violeta\/login$/)
    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible()
    await expect(page.locator('.public-site')).toHaveCSS('--brand', '#7c3aed')
    await page.getByLabel('Contraseña', { exact: true }).fill('test-password')
    await page.getByRole('button', { name: 'Mostrar contraseña' }).click()
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute('type', 'text')
    await page.screenshot({
      path: `test-results/login-${viewport.width}.png`,
      fullPage: true,
    })
    await page.getByRole('link', { name: 'Regístrate aquí' }).click()
    await expect(page).toHaveURL(/\/b\/violeta\/registro$/)
    await expect(page.getByRole('heading', { name: 'Crea tu cuenta' })).toBeVisible()
    await expect(page.locator('.public-site')).toHaveCSS('--brand', '#7c3aed')
    await expect(page.getByLabel('Negocio', { exact: true })).toHaveCount(0)
    await page.screenshot({
      path: `test-results/register-${viewport.width}.png`,
      fullPage: true,
    })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true)
  }
  expect(errors).toEqual([])
})

test('public business registration submits a review request and never asks for an admin password', async ({ page }) => {
  let submitted
  await page.route('**/business-requests', async route => {
    submitted = route.request().postDataJSON()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ok: true, requestId: 'request-test-id', trackingToken: 'a'.repeat(43) } }) })
  })
  await page.goto('/crear-negocio')
  await expect(page.getByRole('heading', { name: 'Solicita registrar tu negocio' })).toBeVisible()
  await page.getByLabel('Nombre *').fill('Ana')
  await page.getByLabel('Apellido *').fill('Perez')
  await page.getByLabel('Correo electrónico *').fill(`owner-${Date.now()}@example.test`)
  await page.getByLabel('Teléfono *').fill('+59170000000')
  await page.getByLabel('Nombre del negocio *').fill('Mi Estudio')
  await page.getByLabel('Categoría / rubro *').selectOption('Belleza y bienestar')
  await page.getByLabel('Ciudad *').fill('La Paz')
  await page.getByLabel('Descripción *').fill('Servicios profesionales de belleza para todos.')
  await page.locator('.request-terms input').check()
  await page.getByRole('button', { name: 'Enviar solicitud' }).click()
  await expect(page.getByRole('heading', { name: 'Solicitud enviada' })).toBeVisible()
  expect(submitted.business.name).toBe('Mi Estudio')
  expect(submitted.termsAccepted).toBe(true)
  expect(submitted).not.toHaveProperty('password')
})

test('professional registration waits for approval and password mismatch is rejected', async ({
  page,
}) => {
  await page.goto('/b/violeta/registro')
  await page.getByLabel('Nombre', { exact: true }).fill('Luis')
  await page.getByLabel('Apellido', { exact: true }).fill('Perez')
  await page.getByLabel('Correo electrónico').fill(`pro-${Date.now()}@example.test`)
  await page.getByLabel('Teléfono').fill('+59170000001')
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password')
  await page.getByLabel('Confirmar contraseña').fill('different-password')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Las contraseñas no coinciden.')).toBeVisible()
  await page.getByLabel('Confirmar contraseña').fill('test-password')
  await page.getByLabel('Quiero registrarme como').selectOption('professional')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(
    page.getByText('Tu solicitud está pendiente de aprobación por el administrador del negocio.')
  ).toBeVisible({ timeout: 20000 })
})

test('public client registration remains available after business registration changes', async ({ page }) => {
  await page.goto('/b/violeta/registro')
  await page.getByLabel('Nombre', { exact: true }).fill('Clara')
  await page.getByLabel('Apellido', { exact: true }).fill('Lopez')
  await page.getByLabel('Correo electrónico').fill(`client-${Date.now()}@example.test`)
  await page.getByLabel('Teléfono').fill('+59170000002')
  await page.getByLabel('Contraseña', { exact: true }).fill('client-password')
  await page.getByLabel('Confirmar contraseña').fill('client-password')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByRole('heading', { name: /verte, Clara/ })).toBeVisible({ timeout: 20000 })
})
