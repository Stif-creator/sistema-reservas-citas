import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test.use({ actionTimeout:15000, navigationTimeout:20000 })

test('Sprint 3 public booking resumes after login, preferences, admin clients and professional agenda', async ({ page, browser }) => {
  test.setTimeout(180000)
  const suffix = Date.now()
  const businessId = `sprint3-${suffix}`
  const serviceId = `service-${suffix}`, professionalId = `legacy-pro-${suffix}`
  const password = 'test-password'
  const accounts = {}
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  for (const role of ['admin', 'client', 'professional']) {
    const email = `${role}-sprint3-${suffix}@example.test`
    const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
    })
    expect(response.ok).toBe(true)
    accounts[role] = { email, uid: (await response.json()).localId }
  }
  const date = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const hours = Object.fromEntries(Array.from({ length: 7 }, (_, index) => [String(index + 1), [{ start: '09:00', end: '17:00' }]]))
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await setDoc(doc(db, 'businesses', businessId), { ownerUserId: accounts.admin.uid, name: 'Negocio Reservas', status: 'active', weeklyHours: hours,
      location: { addressLine: 'Calle Prueba 123', city: 'La Paz', latitude: -16.5, longitude: -68.15 },
      appearance: { primaryColor: '#7c3aed', secondaryColor: '#f0e7ff' },
      settings: { publicPageEnabled: true, timezone: 'America/La_Paz', currencyCode: 'BOB', minAdvanceMinutes: 0, maxAdvanceDays: 90, bookingIntervalMinutes: 30, cancellationLimitHours: 24, autoConfirmBookings: false } })
    for (const [role, account] of Object.entries(accounts)) {
      await setDoc(doc(db, 'users', account.uid), { id: account.uid, auth_uid: account.uid, firstName: role === 'client' ? 'María' : role === 'admin' ? 'Dueña' : 'Ana', lastName: 'Prueba', email: account.email, phone: '70000000', status: 'active', globalRole: 'user', businessIds: [businessId], onboardingComplete: true })
      await setDoc(doc(db, 'memberships', `${businessId}_${account.uid}`), { userId: account.uid, businessId, role, status: 'active', permissions: {} })
    }
    await setDoc(doc(db, 'clients', `client-${suffix}`), { businessId, userId: accounts.client.uid, firstName: 'María', lastName: 'Prueba', email: accounts.client.email, phone: '70000000' })
    await setDoc(doc(db, 'categories', `category-${suffix}`), { businessId, name: 'Bienestar', isActive: true })
    await setDoc(doc(db, 'services', serviceId), { businessId, name: 'Consulta integral', description: 'Atención personalizada.', price: 100, durationMinutes: 30, currencyCode: 'BOB', categoryId: `category-${suffix}`, isActive: true, isPublic: true })
    await setDoc(doc(db, 'services', `other-${serviceId}`), { businessId, name: 'Otro servicio', description: 'Otro servicio del catálogo.', price: 120, durationMinutes: 30, currencyCode: 'BOB', categoryId: `category-${suffix}`, isActive: true, isPublic: true })
    await setDoc(doc(db, 'professionals', professionalId), { businessId, userId: accounts.professional.uid, displayName: 'Ana Agenda', jobTitle: 'Especialista', serviceIds: [serviceId], isActive: true, weeklyHours: hours })
  })
  await env.cleanup()
  const staffContext = await browser.newContext()
  const proContext = await browser.newContext()
  const staff = await staffContext.newPage(), pro = await proContext.newPage()
  async function login(target, role) {
    await target.goto('http://127.0.0.1:4173/login')
    await target.getByLabel('Correo electrónico').fill(accounts[role].email)
    await target.getByLabel('Contraseña', { exact: true }).fill(password)
    await target.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(target).toHaveURL(role === 'client' ? /\/cliente$/ : /\/dashboard$/)
  }
  async function selectTime(target, label) {
    await target.getByLabel('Fecha de la cita').fill(date)
    await target.getByRole('group', { name: 'Horarios disponibles' }).getByRole('button', { name: label, exact: true }).click()
    await target.getByRole('button', { name: 'Continuar', exact: true }).click()
  }
  try {
    await page.goto(`/b/${businessId}`)
    await expect(page.getByRole('heading', { name:'Ana Agenda' })).toBeVisible({ timeout:20000 })
    await page.goto(`/b/${businessId}/contacto`)
    await expect(page.getByTitle('Ubicación de Negocio Reservas')).toHaveAttribute('src', /openstreetmap/)
    await page.goto(`/b/${businessId}/reservar`)
    await page.getByRole('button', { name:/Consulta integral/ }).click()
    await page.getByRole('button', { name:/Ana Agenda/ }).click()
    await selectTime(page, '10:00')
    await page.getByRole('link', { name:'Iniciar sesión para confirmar', exact:true }).click()
    await page.getByLabel('Correo electrónico').fill(accounts.client.email)
    await page.getByLabel('Contraseña', { exact:true }).fill(password)
    await page.getByRole('button', { name:'Iniciar sesión', exact:true }).click()
    await expect(page).toHaveURL(new RegExp(`/b/${businessId}/reservar$`))
    await expect(page.getByLabel('Fecha de la cita')).toHaveValue(date)
    await expect(page.getByRole('button', { name:'10:00', exact:true })).toHaveAttribute('aria-pressed','true')
    await page.getByRole('button', { name:'Continuar', exact:true }).click()
    await page.getByRole('button', { name:'Confirmar reserva', exact:true }).click()
    await expect(page.getByRole('heading', { name:'¡Solicitud registrada!' })).toBeVisible({ timeout:20000 })
    let notificationHubCalls = 0
    await page.route('**/booking', route => {
      if (route.request().postDataJSON()?.action === 'hub') { notificationHubCalls++; return route.fulfill({ status:502, body:'Gateway unavailable' }) }
      return route.continue()
    })
    await page.goto('/cliente/avisos')
    await expect(page.getByRole('heading', { name:/Cita pendiente/ })).toBeVisible({ timeout:20000 })
    await page.getByRole('button', { name:'Marcar como leído' }).click()
    await expect(page.getByRole('button', { name:'Marcar como leído' })).toHaveCount(0)
    expect(notificationHubCalls).toBe(0)
    await page.unroute('**/booking')
    await page.goto('/cliente/favoritos')
    await page.getByRole('button', { name:/♡ Consulta integral/ }).click()
    await expect(page.getByRole('button', { name:'Quitar favorito' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name:'Quitar favorito' })).toBeVisible()
    await page.getByRole('combobox', { name:'Servicio', exact:true }).selectOption(serviceId)
    await page.getByRole('combobox', { name:'Profesional', exact:true }).selectOption(professionalId)
    await page.getByLabel('Fecha de interés').fill(date)
    await page.getByRole('button', { name:'Registrar interés' }).click()
    await page.getByRole('button', { name:'Retirar de la lista' }).click()
    await expect(page.getByText('No tienes solicitudes en espera.')).toBeVisible()
    let clientApiCalls = 0
    await staff.route('**/booking', route => {
      if (route.request().postDataJSON()?.action === 'clients') { clientApiCalls++; return route.fulfill({ status:502, body:'Gateway unavailable' }) }
      return route.continue()
    })
    await login(staff, 'admin')
    await expect(staff.getByRole('heading', { name:'Actividad del negocio' })).toBeVisible()
    await staff.goto('/clientes')
    await staff.getByRole('button', { name:/Editar y ver historial/ }).click()
    await staff.getByLabel('Teléfono', { exact:true }).fill('70000099')
    await staff.getByRole('button', { name:'Guardar cliente' }).click()
    await expect(staff.getByText('Datos de contacto guardados.')).toBeVisible()
    await expect(staff.getByRole('heading', { name:'Historial del cliente' })).toBeVisible()
    expect(clientApiCalls).toBe(0)
    await staff.unroute('**/booking')
    // A failed hub request must not hide the services, which come from Firestore.
    let hubOffline = true, optionsCalls = 0
    await staff.route('**/booking', async route => {
      const action = route.request().postDataJSON()?.action
      if (action === 'options') optionsCalls++
      if (action === 'hub' && hubOffline) return route.fulfill({ status:500, contentType:'application/json', body:JSON.stringify({ error:{ code:'internal', message:'Server error' } }) })
      return route.continue()
    })
    await staff.goto('/promociones')
    await expect(staff.getByRole('alert')).toContainText('error al cargar los datos')
    await staff.getByRole('combobox', { name:'Servicio', exact:true }).selectOption(serviceId)
    expect(optionsCalls).toBe(0)
    hubOffline = false
    await staff.getByRole('button', { name:'Actualizar datos', exact:true }).click()
    await expect(staff.getByRole('alert')).toHaveCount(0)
    await staff.unroute('**/booking')
    await staff.getByLabel('Título', { exact:true }).fill('Oferta de prueba')
    await staff.getByRole('combobox', { name:'Servicio', exact:true }).selectOption(serviceId)
    await staff.getByLabel('Desde', { exact:true }).fill(new Date(Date.now()-86400000).toISOString().slice(0,10))
    await staff.getByLabel('Hasta (incluido)').fill(date)
    await staff.getByRole('button', { name:'Guardar promoción' }).click()
    await expect(staff.getByText('Promoción guardada.')).toBeVisible()
    await staff.getByLabel('Horas de anticipación').fill('48')
    await staff.getByRole('button', { name:'Guardar anticipación' }).click()
    await expect(staff.getByText('Anticipación de recordatorios guardada.')).toBeVisible()
    await login(pro, 'professional')
    await expect(pro.getByRole('heading', { name: 'Mis próximas reservas', exact: true })).toBeVisible()
    await expect(pro.getByRole('link', { name: /Consulta integral/ })).toHaveCount(1)
    await pro.goto('/agenda')
    await expect(pro.getByRole('heading', { name:'Mi agenda profesional' })).toBeVisible()
    await pro.getByLabel('Fecha de agenda').fill(date)
    await expect(pro.locator('.agenda-appointment')).toHaveCount(1)
    await expect(pro.locator('.assigned-service-card')).toHaveCount(1)
    await pro.locator('.assigned-services').screenshot({path:'test-results/assigned-services-desktop.png'})
    await pro.setViewportSize({width:390,height:844})
    await pro.locator('.assigned-services').screenshot({path:'test-results/assigned-services-mobile.png', animations:'disabled'})
    await pro.setViewportSize({width:1280,height:720})
    await page.goto('/cliente/servicios')
    await expect(page.locator('.client-service-card')).toHaveCount(2)
    await page.getByRole('button', { name:'Quitar de favoritos: Consulta integral', exact:true }).click()
    await expect(page.getByRole('button', { name:'Agregar a favoritos: Consulta integral', exact:true })).toBeVisible()
    await page.getByRole('button', { name:'Agregar a favoritos: Consulta integral', exact:true }).click()
    await page.reload()
    await expect(page.getByRole('button', { name:'Quitar de favoritos: Consulta integral', exact:true })).toBeVisible()
    await page.getByRole('combobox', { name:'Filtrar servicios por profesional' }).selectOption(professionalId)
    await expect(page.locator('.client-service-card')).toHaveCount(1)
    await page.getByRole('combobox', { name:'Filtrar servicios por profesional' }).selectOption('')
    await page.getByRole('button', { name:'Solo favoritos', exact:true }).click()
    await expect(page.locator('.client-service-card')).toHaveCount(1)
    await page.screenshot({ path:'test-results/client-services-social.png', fullPage:true })
    await page.goto('/cliente/reservas')
    const detailPath = await page.getByRole('link', { name:'Ver detalles', exact:true }).getAttribute('href')
    await page.goto(detailPath)
    await expect(page.getByRole('button', { name:'Publicar valoración' })).toHaveCount(0)
    const reviewEnv = await initializeTestEnvironment({ projectId:'demo-citaspro', firestore:{ host:'127.0.0.1', port:8080, rules:await readFile('firestore.rules','utf8') } })
    try { await reviewEnv.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(),'reservations',detailPath.split('/').pop()), { status:'completed' })) } finally { await reviewEnv.cleanup() }
    await page.getByLabel('Calificación del servicio').selectOption('4')
    await page.getByLabel('Calificación del profesional').selectOption('5')
    await page.getByLabel('Comentario', { exact:true }).fill('Excelente atención y puntualidad.')
    await page.getByRole('button', { name:'Publicar valoración', exact:true }).click()
    await expect(page.getByText(/Valoración publicada/)).toBeVisible()
    await page.goto(`/cliente/servicios/${serviceId}`)
    await expect(page.locator('.client-detail-social')).toContainText('4,0/5')
    await expect(page.locator('.client-professional-card')).toContainText('5,0/5')
    await expect(page.locator('.client-review-card')).toContainText('Excelente atención y puntualidad.')
    await page.screenshot({ path:'test-results/client-service-reviews.png', fullPage:true })
    await page.goto(`/b/${businessId}`)
    await expect(page.getByRole('heading', { name:'Oferta de prueba' })).toBeVisible()
    await page.setViewportSize({ width:390, height:844 })
    await page.goto('/cliente/favoritos')
    await expect(page.getByRole('heading', { name:'Favoritos y lista de espera' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path:'test-results/sprint3-mobile.png', fullPage:true })
    expect(errors).toEqual([])
  } finally { await Promise.allSettled([staffContext.close(), proContext.close()]) }
})
