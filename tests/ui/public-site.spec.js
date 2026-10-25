import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test('institutional pages are public, connected and use only public directory data', async ({ page }) => {
  const suffix = Date.now().toString()
  const publicId = `public-${suffix}`
  const privateId = `private-${suffix}`
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: {
    host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8'),
  } })
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      await setDoc(doc(db, 'businesses', publicId), {
        id: publicId, name: 'Taller Horizonte', description: 'Reparación y mantenimiento de bicicletas.',
        status: 'active', settings: { publicPageEnabled: true }, category: 'Taller',
        location: { city: 'La Paz', countryCode: 'BO' }, ownerUserId: 'private-owner',
        contact: { email: 'private@example.test' },
      })
      await setDoc(doc(db, 'businesses', privateId), {
        id: privateId, name: 'Negocio privado', status: 'active', settings: { publicPageEnabled: false },
      })
    })

    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Encuentra y reserva servicios/ })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Negocios' })).toHaveAttribute('href', '/negocios')
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Negocios' }).click()
    await expect(page.getByRole('heading', { name: 'Encuentra tu próximo servicio' })).toBeVisible()
    await expect(page.getByRole('article').filter({ hasText: 'Taller Horizonte' })).toBeVisible()
    await expect(page.getByText('Negocio privado')).toHaveCount(0)
    await expect(page.getByText('private@example.test')).toHaveCount(0)
    await page.getByLabel('Filtrar por actividad').selectOption('Taller')
    await page.getByLabel('Filtrar por ubicación').selectOption('La Paz')
    await expect(page.getByRole('article').filter({ hasText: 'Taller Horizonte' })).toBeVisible()
    await page.getByRole('article').filter({ hasText: 'Taller Horizonte' }).getByRole('link', { name: 'Ver negocio' }).click()
    await expect(page).toHaveURL(new RegExp(`/b/${publicId}$`))
    await expect(page.getByRole('banner').getByRole('link', { name: /Taller Horizonte/ })).toBeVisible()

    await page.goto('/nosotros')
    await expect(page.getByRole('heading', { name: /Tu tiempo/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Hacer más fácil organizar tus citas' })).toBeVisible()
    await expect(page.getByText('Sonrisa Andina')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Explorar negocios' }).first()).toHaveAttribute('href', '/negocios')

    await page.goto('/contacto')
    await expect(page.getByRole('heading', { name: /¿Necesitas ayuda/ })).toBeVisible()
    await expect(page.locator('#contenido').getByRole('link', { name: 'Explorar negocios' })).toHaveAttribute('href', '/negocios')
    await expect(page.locator('form')).toHaveCount(0)

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeVisible()
    expect(await page.locator('.platform-contact-page').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  } finally {
    await env.cleanup()
  }
})
