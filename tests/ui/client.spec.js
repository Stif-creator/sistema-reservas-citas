import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDocs, query, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test('client layouts use real scoped data and live branding on desktop and mobile', async ({ page }) => {
  test.setTimeout(90000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const suffix = Date.now()
  const businessId = `client-design-${suffix}`
  const email = `cliente-${suffix}@example.test`
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: {
    host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8'),
  } })
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      await setDoc(doc(db, 'businesses', businessId), { name: 'Estudio Violeta', ownerUserId: 'test-owner', status: 'active',
        description: 'Un espacio para cuidarte y disfrutar de tu tiempo.', appearance: { primaryColor: '#7c3aed', secondaryColor: '#f0e7ff' },
        contact: { phone: '+59170000000', email: 'hola@example.test' }, settings: { publicPageEnabled: true, timezone: 'America/La_Paz', currencyCode: 'BOB' } })
      for (const [id, name] of [['care', 'Bienestar'], ['hair', 'Peluquería']]) {
        await setDoc(doc(db, 'categories', `${businessId}-${id}`), { businessId, name, isActive: true, displayOrder: 1 })
      }
      for (const [id, name, categoryId, isActive, isPublic] of [
        ['massage', 'Masaje relajante', 'care', true, true], ['haircut', 'Corte de cabello', 'hair', true, true],
        ['hidden', 'Servicio privado', 'care', true, false], ['inactive', 'Servicio inactivo', 'care', false, true],
      ]) await setDoc(doc(db, 'services', `${businessId}-${id}`), { businessId, name, categoryId: `${businessId}-${categoryId}`, price: 150,
        durationMinutes: 60, description: 'Una pausa para reconectar contigo.', currencyCode: 'BOB', isActive, isPublic })
    })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`/b/${businessId}`)
    await expect(page.locator('#nosotros, #contacto')).toHaveCount(0)
    await page.getByRole('link', { name: 'Nosotros', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/b/${businessId}/nosotros$`))
    await expect(page.getByRole('heading', { name: 'Nuestra historia' })).toBeVisible()
    await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'businesses', businessId), { about: { title: 'Somos Estudio Violeta', story: 'Una historia cercana.', mission: 'Escucharte.', values: 'Respeto\nCercanía' } }))
    await expect(page.getByRole('heading', { name: 'Somos Estudio Violeta' })).toBeVisible()
    await page.getByRole('link', { name: 'Contacto', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/b/${businessId}/contacto$`))
    await page.getByLabel('Nombre completo').fill('María Prueba')
    await page.getByLabel('Correo electrónico').fill('cliente@example.test')
    await page.getByLabel('Asunto').fill('Consulta & horarios')
    await page.getByLabel('Mensaje', { exact: true }).fill('¿Atienden el sábado?')
    await page.getByRole('button', { name: 'Preparar mensaje' }).click()
    const draft = await page.getByRole('link', { name: 'Abrir correo', exact: true }).getAttribute('href')
    expect(draft).toContain('mailto:hola@example.test?subject=')
    expect(decodeURIComponent(draft)).toContain('Consulta & horarios')
    expect(decodeURIComponent(draft)).toContain('¿Atienden el sábado?')
    await page.goto(`/b/${businessId}/registro`)
    await page.getByLabel('Nombre', { exact: true }).fill('María')
    await page.getByLabel('Apellido', { exact: true }).fill('Flores')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Teléfono').fill('70000001')
    await page.getByLabel('Contraseña', { exact: true }).fill('test-password')
    await page.getByLabel('Confirmar contraseña').fill('test-password')
    await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
    await expect(page).toHaveURL(/\/cliente$/)
    await expect(page.getByRole('heading', { name: 'Hola, María.', exact: false })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Masaje relajante', exact: true })).toBeVisible()
    await expect(page.getByText('Servicio privado', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Servicio inactivo', { exact: true })).toHaveCount(0)

    // The customer catalog is independent of publication of the external website.
    let uid
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      uid = (await getDocs(query(collection(db, 'users'), where('email', '==', email)))).docs[0].id
      await updateDoc(doc(db, 'businesses', businessId), { 'settings.publicPageEnabled': false, 'appearance.primaryColor': '#eab308', 'appearance.secondaryColor': '#fff6cc' })
    })
    await expect(page.locator('.client-site')).toHaveCSS('--brand', '#eab308')
    await expect(page.locator('.client-site')).toHaveCSS('--on-brand', '#101b30')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Masaje relajante', exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Servicios', exact: true }).click()
    await page.getByRole('button', { name: 'Peluquería', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Corte de cabello' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Masaje relajante' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Todos', exact: true }).click()
    await page.getByRole('searchbox', { name: 'Buscar servicios' }).fill('no existe')
    await expect(page.getByRole('heading', { name: 'No hay servicios para mostrar' })).toBeVisible()
    await page.getByRole('searchbox', { name: 'Buscar servicios' }).fill('masaje')
    await page.getByRole('link', { name: 'Ver servicio', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Masaje relajante' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Reservar cita', exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Mis reservas', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Tu próxima visita empieza aquí' })).toBeVisible()

    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      const data = { businessId, clientUserId: uid, serviceId: `${businessId}-massage`, serviceName: 'Masaje relajante', professionalName: 'Ana Pérez',
        startAt: Timestamp.fromMillis(Date.now() + 86400000), endAt: Timestamp.fromMillis(Date.now() + 90000000), status: 'confirmed', price: 150, currencyCode: 'BOB' }
      await setDoc(doc(db, 'reservations', `own-${suffix}`), data)
      await setDoc(doc(db, 'reservations', `other-${suffix}`), { ...data, clientUserId: 'another-client', serviceName: 'Cita de otra persona' })
    })
    await expect(page.getByRole('heading', { name: 'Masaje relajante' })).toBeVisible()
    await expect(page.getByText('Cita de otra persona')).toHaveCount(0)
    await page.getByRole('link', { name: 'Ver detalles', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Detalle de reserva' })).toBeVisible()
    await expect(page.getByText('Ana Pérez', { exact: true })).toBeVisible()
    await page.goto(`/cliente/reservas/other-${suffix}`)
    await expect(page.getByRole('heading', { name: 'Reserva no disponible' })).toBeVisible()

    await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'businesses', businessId), { 'appearance.primaryColor': '#7c3aed', 'appearance.secondaryColor': '#f0e7ff' }))
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 })
      for (const [path, title, name] of [
        ['/cliente', 'Hola, María.', 'home'], ['/cliente/servicios', 'Servicios', 'services'],
        [`/cliente/servicios/${businessId}-massage`, 'Masaje relajante', 'service-detail'],
        ['/cliente/reservas', 'Mis reservas', 'reservations'], [`/cliente/reservas/own-${suffix}`, 'Detalle de reserva', 'reservation-detail'],
        ['/cliente/perfil', 'Mi perfil', 'profile'],
        ['/cliente/nosotros', 'Somos Estudio Violeta', 'about'],
        ['/cliente/contacto', 'Hablemos de tu próxima visita', 'contact'],
      ]) {
        await page.goto(path)
        await expect(page.getByRole('heading', { name: title, exact: false }).first()).toBeVisible()
        await expect(page.locator('.client-site')).toHaveCSS('--brand', '#7c3aed')
        await expect(page.locator('header')).toHaveCount(1)
        await expect(page.locator('footer')).toHaveCount(1)
        await expect(page.getByRole('main')).toHaveCount(1)
        await expect(page.getByRole('alert')).toHaveCount(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: `test-results/client-${name}-${width}.png`, fullPage: true })
      }
      if (width === 390) {
        await page.getByRole('button', { name: 'Abrir menú' }).click()
        await expect(page.getByRole('button', { name: 'Cerrar menú' })).toHaveAttribute('aria-expanded', 'true')
        await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Servicios', exact: true }).click()
        await expect(page.getByRole('heading', { name: 'Servicios', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-expanded', 'false')
      }
    }
    await page.goto('/usuarios')
    await expect(page).toHaveURL(/\/cliente$/)
    await page.goto('/cliente/perfil')
    await expect(page.getByText(email, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible()
    await page.goto('/cliente/perfil')
    await expect(page).toHaveURL(/\/login$/)
    expect(errors).toEqual([])
  } finally { await env.cleanup() }
})
