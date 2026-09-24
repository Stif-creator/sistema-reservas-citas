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
    await setDoc(doc(db, 'services', 'massage'), {
      id: 'massage',
      businessId: 'violeta',
      name: 'Masaje relajante',
      description: 'Una pausa para reconectar contigo.',
      price: 150,
      durationMinutes: 60,
      currencyCode: 'BOB',
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
    await expect(page.getByRole('heading', { name: 'Nuestros servicios' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Masaje relajante' })).toBeVisible()
    await expect(page.locator('.public-site')).toHaveCSS('--brand', '#7c3aed')
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

test('owner registration, branding changes, professional approval and logout work end to end', async ({
  page,
  browser,
}) => {
  test.setTimeout(60000)
  const ownerEmail = `owner-${Date.now()}@example.test`
  await page.goto('/crear-negocio')
  await page.getByLabel('Nombre', { exact: true }).fill('Ana')
  await page.getByLabel('Apellido', { exact: true }).fill('Perez')
  await page.getByLabel('Correo electrónico').fill(ownerEmail)
  await page.getByLabel('Teléfono').fill('+59170000000')
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password')
  await page.getByLabel('Confirmar contraseña').fill('test-password')
  await page.getByLabel('Nombre del negocio').fill('Mi Estudio')
  await page.getByRole('button', { name: 'Crear mi negocio' }).click()
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible({
    timeout: 20000,
  })
  await page.getByRole('link', { name: 'Configuración', exact: true }).click()
  await page.getByLabel('Color primario').fill('#eab308')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Cambios guardados.', { exact: true })).toBeVisible()
  const url = await page.locator('a[target="_blank"]').getAttribute('href')
  await page.goto(url)
  await expect(page.locator('.public-site')).toHaveCSS('--brand', '#eab308')
  await expect(page.locator('.public-site')).toHaveCSS('--on-brand', '#101b30')
  const professionalContext = await browser.newContext()
  const professionalPage = await professionalContext.newPage()
  await professionalPage.goto(`http://127.0.0.1:4173${url}/registro`)
  await professionalPage.getByLabel('Nombre', { exact: true }).fill('Luis')
  await professionalPage.getByLabel('Apellido', { exact: true }).fill('Perez')
  await professionalPage
    .getByLabel('Correo electrónico')
    .fill(`approval-${Date.now()}@example.test`)
  await professionalPage.getByLabel('Teléfono').fill('+59170000001')
  await professionalPage.getByLabel('Contraseña', { exact: true }).fill('test-password')
  await professionalPage.getByLabel('Confirmar contraseña').fill('test-password')
  await professionalPage.getByLabel('Quiero registrarme como').selectOption('professional')
  await professionalPage.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(
    professionalPage.getByText(
      'Tu solicitud está pendiente de aprobación por el administrador del negocio.'
    )
  ).toBeVisible({ timeout: 20000 })
  await page.goto('/profesionales')
  await page.getByRole('button', { name: 'Más acciones' }).click()
  await page.getByRole('button', { name: 'Activar', exact: true }).click()
  await expect(professionalPage.getByRole('heading', { name: 'Hola, Luis' })).toBeVisible()
  await page.getByRole('button', { name: 'Más acciones' }).click()
  await page.getByRole('button', { name: 'Desactivar', exact: true }).click()
  await expect(
    professionalPage.getByText(
      'Tu cuenta o membresía no está activa. Contacta al administrador del negocio.'
    )
  ).toBeVisible()
  await professionalContext.close()
  await page.goto('/dashboard')
  await page.getByTitle('Cerrar sesión').click()
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible()
  await page.getByLabel('Correo electrónico').fill(ownerEmail)
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password')
  await page.getByLabel('Recordarme').uncheck()
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()
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
