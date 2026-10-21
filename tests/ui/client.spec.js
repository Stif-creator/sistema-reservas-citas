import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDocs, query, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test('client layouts use real scoped data and live branding on desktop and mobile', async ({ page }) => {
  test.setTimeout(180000)
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
        description: 'Un espacio para cuidarte y disfrutar de tu tiempo.', appearance: { primaryColor: '#7c3aed', secondaryColor: '#f0e7ff', accentColor: '#c2410c', surfaceColor: '#fff7ed' },
        contact: { phone: '+59170000000', whatsapp: '+59171234567', email: 'hola@example.test' },
        location: { addressLine: 'Calle de Prueba 123', city: 'La Paz', stateRegion: 'La Paz', countryCode: 'BO', latitude: -16.5, longitude: -68.15 },
        weeklyHours: { '1': [{ start: '09:00', end: '17:00' }], '2': [], '3': [], '4': [], '5': [], '6': [], '7': [] },
        settings: { publicPageEnabled: true, timezone: 'America/La_Paz', currencyCode: 'BOB' } })
      await setDoc(doc(db, 'users', `about-professional-${suffix}`), { status: 'active', firstName: 'Ana', lastName: 'Pérez' })
      await setDoc(doc(db, 'memberships', `${businessId}_about-professional-${suffix}`), { businessId, userId: `about-professional-${suffix}`, role: 'professional', status: 'active' })
      await setDoc(doc(db, 'professionals', `about-professional-${suffix}`), { businessId, userId: `about-professional-${suffix}`, displayName: 'Ana Pérez', jobTitle: 'Especialista', bio: 'Atención cercana y personalizada.', serviceIds: [`${businessId}-massage`], isActive: true })
      for (let index = 2; index <= 4; index += 1) {
        const userId = `about-professional-${index}-${suffix}`
        await setDoc(doc(db, 'memberships', `${businessId}_${userId}`), { businessId, userId, role: 'professional', status: 'active' })
        await setDoc(doc(db, 'professionals', userId), { businessId, userId, displayName: `Profesional ${index}`, jobTitle: 'Atención especializada', bio: `Descripción del profesional ${index}.`, isActive: true })
      }
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
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Nosotros', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/b/${businessId}/nosotros$`))
    await expect(page.getByRole('heading', { name: 'Nuestra historia' })).toBeVisible()
    await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'businesses', businessId), { about: { title: 'Somos Estudio Violeta', story: 'Una historia cercana.', mission: 'Escucharte.', values: 'Respeto\nCercanía' } }))
    await expect(page.getByRole('heading', { name: 'Somos Estudio Violeta' })).toBeVisible()
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Contacto', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/b/${businessId}/contacto$`))
    await page.getByLabel('Nombre completo').fill('María Prueba')
    await page.getByLabel('Correo electrónico').fill('cliente@example.test')
    await page.getByLabel('Asunto').fill('Consulta & horarios')
    await page.getByRole('textbox', { name: /Mensaje/ }).fill('¿Atienden el sábado?')
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
    await expect(page.locator('.client-home-copy h1')).toContainText('María.')
    await expect(page.getByRole('heading', { name: 'Masaje relajante', exact: true })).toBeVisible()
    await expect(page.getByText('Servicio privado', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Servicio inactivo', { exact: true })).toHaveCount(0)
    const homeFavorite = page.getByRole('button', { name: 'Agregar a favoritos: Masaje relajante', exact: true })
    await expect(homeFavorite).toBeEnabled()
    await homeFavorite.click()
    await expect(page.getByRole('button', { name: 'Quitar de favoritos: Masaje relajante', exact: true })).toBeVisible()

    // The customer catalog is independent of publication of the external website.
    let uid
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      uid = (await getDocs(query(collection(db, 'users'), where('email', '==', email)))).docs[0].id
      await updateDoc(doc(db, 'businesses', businessId), { 'settings.publicPageEnabled': false, 'appearance.primaryColor': '#eab308', 'appearance.secondaryColor': '#fff6cc', 'appearance.accentColor': '#be123c', 'appearance.surfaceColor': '#fef3c7' })
    })
    await expect(page.locator('.client-site')).toHaveCSS('--brand', '#eab308')
    await expect(page.locator('.client-site')).toHaveCSS('--on-brand', '#101b30')
    await expect(page.locator('.client-site')).toHaveCSS('--brand-accent', '#be123c')
    await expect(page.locator('.client-site')).toHaveCSS('--brand-surface', '#fef3c7')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Masaje relajante', exact: true })).toBeVisible()
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Servicios', exact: true }).click()
    await page.getByRole('button', { name: 'Peluquería', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Corte de cabello' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Masaje relajante' })).toHaveCount(0)
    await page.getByRole('button', { name: /^Todos/ }).click()
    await expect(page.getByRole('button', { name: 'Quitar de favoritos: Masaje relajante', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Quitar de favoritos: Masaje relajante', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Agregar a favoritos: Masaje relajante', exact: true })).toBeVisible()
    await page.getByRole('searchbox', { name: 'Buscar servicios' }).fill('no existe')
    await expect(page.getByRole('heading', { name: 'No hay servicios para mostrar' })).toBeVisible()
    await page.getByRole('searchbox', { name: 'Buscar servicios' }).fill('masaje')
    await page.getByRole('link', { name: 'Ver detalle', exact: true }).first().click()
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

    await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'businesses', businessId), { 'appearance.primaryColor': '#7c3aed', 'appearance.secondaryColor': '#f0e7ff', 'appearance.accentColor': '#c2410c', 'appearance.surfaceColor': '#fff7ed' }))
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 })
      for (const [path, title, name] of [
        ['/cliente', 'Qué gusto verte', 'home'], ['/cliente/servicios', 'Servicios', 'services'],
        [`/cliente/servicios/${businessId}-massage`, 'Masaje relajante', 'service-detail'],
        ['/cliente/reservas', 'Mis reservas', 'reservations'], [`/cliente/reservas/own-${suffix}`, 'Detalle de reserva', 'reservation-detail'],
        ['/cliente/perfil', 'Mi perfil', 'profile'],
        ['/cliente/nosotros', 'Somos Estudio Violeta', 'about'],
        ['/cliente/contacto', 'Hablemos de tu próxima visita', 'contact'],
      ]) {
        await page.goto(path)
        await expect(page.getByRole('heading', { name: title, exact: false }).first()).toBeVisible()
        await expect(page.locator('.client-site')).toHaveCSS('--brand', '#7c3aed')
        await expect(page.locator('.client-site')).toHaveCSS('--brand-accent', '#c2410c')
        await expect(page.locator('.client-site')).toHaveCSS('--brand-surface', '#fff7ed')
        await expect(page.locator('header.site-header')).toHaveCount(1)
        await expect(page.locator('footer')).toHaveCount(1)
        await expect(page.getByRole('main')).toHaveCount(1)
        await expect(page.getByRole('alert')).toHaveCount(0)
        if (path === '/cliente/nosotros') {
          await expect(page.locator('.client-about-story-copy h2')).toHaveText('Nuestra historia')
          await expect(page.locator('.client-about-story-copy')).toContainText('Una historia cercana.')
          await expect(page.locator('.client-about-mission')).toContainText('Escucharte.')
          await expect(page.locator('.client-about-values h2')).toHaveText('Nuestros valores')
          await expect(page.locator('.client-about-person-card')).toHaveCount(3)
          await expect(page.locator('.client-about-person-card').filter({ hasText: 'Ana Pérez' })).toContainText('Atención cercana y personalizada.')
          await page.getByRole('link', { name: 'Ver todos los profesionales' }).click()
          await expect(page).toHaveURL('/cliente/profesionales')
          await expect(page.locator('.client-about-person-card')).toHaveCount(4)
          await expect(page.locator('.client-about-person-card').filter({ hasText: 'Descripción del profesional 4.' })).toBeVisible()
          await expect(page.locator('.client-site')).toHaveCSS('--brand', '#7c3aed')
          await page.getByRole('link', { name: 'Volver a Nosotros' }).click()
          await expect(page).toHaveURL('/cliente/nosotros')
          await expect(page.locator('.client-about-contact-card').filter({ hasText: 'Ubicación' })).toContainText('Calle de Prueba 123, La Paz, La Paz, BO')
          await expect(page.locator('.client-about-contact-card').filter({ hasText: 'Horario de atención' })).toContainText('09:00–17:00')
          await expect(page.getByRole('link', { name: 'Conoce nuestros servicios' })).toHaveAttribute('href', '/cliente/servicios')
          await expect(page.getByRole('link', { name: 'Contáctanos' }).first()).toHaveAttribute('href', '/cliente/contacto')
          await expect(page.locator('.client-about-hero')).toBeVisible()
        }
        if (path === '/cliente/contacto' && width === 1440) {
          await expect(page.getByRole('link', { name: 'Reservar una cita' })).toHaveAttribute('href', '/cliente/reservar')
          await expect(page.locator('.contact-details-grid a[href="tel:+59170000000"]')).toBeVisible()
          await expect(page.locator('.contact-details-grid a[href="mailto:hola@example.test"]')).toBeVisible()
          await expect(page.getByRole('heading', { name: 'Horarios de atención' })).toBeVisible()
          await expect(page.getByTitle('Ubicación de Estudio Violeta')).toHaveAttribute('src', /openstreetmap\.org\/export\/embed/)
          await expect(page.getByRole('link', { name: 'Abrir mapa' })).toHaveAttribute('href', /openstreetmap\.org\/\?mlat=/)
          await expect(page.getByRole('link', { name: '© OpenStreetMap contributors' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
          await page.getByRole('button', { name: 'Envíanos un mensaje' }).click()
          await expect(page.locator('#contact-form')).toBeInViewport()
          await expect(page.locator('.contact-direct-whatsapp')).toHaveAttribute('href', 'https://wa.me/59171234567')
          const messageInput = page.getByLabel('Mensaje')
          await expect(page.locator('.contact-character-count')).toHaveText('0/2000')
          await messageInput.fill('Necesito información sobre sus servicios.')
          await expect(page.locator('.contact-character-count')).toHaveText('41/2000')
          await page.getByLabel('Nombre completo').fill('María Prueba')
          await page.getByLabel('Correo electrónico').fill('maria@example.test')
          await page.getByLabel('Teléfono (opcional)').fill('70000001')
          await page.getByLabel('Asunto').fill('Consulta de servicios')
          await page.getByRole('button', { name: 'Preparar mensaje' }).click()
          await expect(page.locator('.contact-prepared')).toContainText('Mensaje preparado')
          await expect(page.getByRole('link', { name: 'Abrir correo' })).toHaveAttribute('href', /^mailto:hola@example\.test\?subject=/)
          await expect(page.locator('.contact-prepared').getByRole('link', { name: 'Abrir WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/59171234567\?text=/)
          await expect(page.locator('.contact-prepared').getByRole('link', { name: 'Abrir WhatsApp' })).toHaveAttribute('target', '_blank')
        }
        const layout = await page.evaluate(() => ({
          fits: document.documentElement.scrollWidth <= innerWidth,
          overflow: [...document.querySelectorAll('body *')].filter(element => element.getBoundingClientRect().right > innerWidth + 1)
            .slice(0, 8).map(element => `${element.tagName.toLowerCase()}.${String(element.className).replaceAll(' ', '.')}`),
        }))
        expect(layout.fits, `${path} at ${width}px overflows: ${layout.overflow.join(', ')}`).toBe(true)
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
