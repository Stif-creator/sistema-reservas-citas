import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

async function createAccount(email, password) {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  expect(response.ok).toBe(true)
  return (await response.json()).localId
}

async function openSession(page, email, password) {
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page).toHaveURL(/dashboard$/)
}

test('superadmin without a selected business sees the global dashboard safely', async ({ page }) => {
  const id = `platform-empty-${Date.now()}`, email = `${id}@example.test`, password = 'Demo-secret-123!'
  const uid = await createAccount(email, password)
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'users', uid), { id: uid, auth_uid: uid, firstName: 'Plataforma', lastName: 'Global', email, status: 'active', globalRole: 'superadmin', businessIds: [], onboardingComplete: true }))
    await openSession(page, email, password)
    await expect(page.getByRole('heading', { name: 'Resumen de la plataforma' })).toBeVisible()
    await expect(page.getByText('Negocios registrados').first()).toBeVisible()
    await expect(page.getByText('Reservas del período')).toBeVisible()
    expect(errors).toEqual([])
  } finally { await env.cleanup() }
})

test('superadmin uses supervision routes and cannot open business operations', async ({ page }) => {
  const id = `platform-${Date.now()}`, email = `${id}@example.test`, password = 'Demo-secret-123!'
  const uid = await createAccount(email, password)
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      await setDoc(doc(db, 'users', uid), { id: uid, auth_uid: uid, firstName: 'Platform', lastName: 'Test', email, status: 'active', globalRole: 'superadmin', businessIds: [id], onboardingComplete: true })
      await setDoc(doc(db, 'businesses', id), { id, ownerUserId: 'someone-else', name: 'Negocio de supervisión', status: 'active', administratorName: 'Responsable de prueba', administratorEmail: 'admin@example.test', settings: { publicPageEnabled: true } })
    })
    await openSession(page, email, password)
    for (const label of ['Dashboard global', 'Negocios', 'Administradores', 'Estadísticas y reportes', 'Actividad de negocios', 'Seguridad y auditoría', 'Avisos de plataforma', 'Soporte técnico', 'Mi seguridad'])
      await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible()
    for (const label of ['Reservas', 'Agenda', 'Clientes', 'Servicios', 'Profesionales', 'Disponibilidad'])
      await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Superadministrador · Negocio')).toHaveCount(0)
    await page.goto('/negocio')
    await expect(page).toHaveURL(/dashboard$/)
    await page.getByRole('link', { name: 'Negocios', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Negocios registrados' })).toBeVisible()
    await page.getByLabel('Buscar negocios por nombre').fill('Negocio de supervisión')
    await page.locator('article').filter({ hasText: 'Negocio de supervisión' }).getByRole('link', { name: 'Ver detalles' }).click()
    await expect(page.getByRole('heading', { name: 'Negocio de supervisión' })).toBeVisible()
    await expect(page.getByText(/Vista de supervisión/)).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await page.getByRole('link', { name: 'Mi seguridad', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Seguridad de mi cuenta' })).toBeVisible()
    expect(errors).toEqual([])
  } finally { await env.cleanup() }
})

test('platform edits full business configuration with persistence, branding, hours, map and audit', async ({ page, browser }) => {
  test.setTimeout(120000)
  const id = `editor-${Date.now()}`, email = `${id}@example.test`, password = 'Demo-secret-123!'
  const uid = await createAccount(email, password)
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCuoAAAAASUVORK5CYII=', 'base64')
  const uploads = []
  // Provider is mocked; authentication/authorization and signed uploads have server tests.
  await page.route('**/images', async route => {
    const input = route.request().postDataJSON()
    expect(input.businessId).toBe(id)
    expect(route.request().headers().authorization).toMatch(/^Bearer /)
    uploads.push(input.kind)
    const suffix = uploads.filter(kind => kind === input.kind).length > 1 ? '-replacement' : ''
    await route.fulfill({ json: { data: { url: `https://images.example.test/${input.kind}${suffix}.png` } } })
  })
  await page.route('https://images.example.test/**', route => route.fulfill({ contentType: 'image/png', body: png }))
  const visitorContext = await browser.newContext(), visitor = await visitorContext.newPage()
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      await setDoc(doc(db, 'users', uid), { id: uid, auth_uid: uid, firstName: 'Plataforma', email, status: 'active', globalRole: 'superadmin', businessIds: [], onboardingComplete: true })
      await setDoc(doc(db, 'users', `${id}-owner`), { firstName: 'Responsable', lastName: 'Editor', email: 'owner@example.test', status: 'active' })
      await setDoc(doc(db, 'businesses', id), { name: 'Negocio editable', ownerUserId: `${id}-owner`, status: 'active', settings: { publicPageEnabled: true, timezone: 'America/La_Paz' } })
      await setDoc(doc(db, 'memberships', `${id}_${id}-owner`), { businessId: id, userId: `${id}-owner`, role: 'admin', status: 'active', firstName: 'Responsable', lastName: 'Editor', email: 'owner@example.test' })
    })
    await openSession(page, email, password)
    await page.goto(`/plataforma/negocios/${id}/editar`)
    await expect(page.getByRole('heading', { name: 'Editar negocio: Negocio editable' })).toBeVisible()
    await page.getByLabel('Nombre', { exact: true }).fill('Negocio recuperado')
    await page.getByLabel('Descripción', { exact: true }).fill('Configuración recuperada y persistente')
    await page.getByRole('link', { name: 'Volver al negocio', exact: true }).click()
    await expect(page.getByRole('alertdialog')).toContainText('sin guardar')
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click()
    await page.getByRole('tab', { name: 'Apariencia' }).click()
    await page.getByRole('button', { name: 'Restablecer colores predeterminados' }).click()
    for (const [label, color] of [['Color primario', '#123456'], ['Color secundario', '#abcdef'], ['Color de acento', '#884422'], ['Color de superficie', '#f8fafc']]) await page.getByLabel(label, { exact: true }).fill(color)
    await expect(page.locator('#settings-panel-appearance .settings-preview')).toHaveCSS('--brand', '#123456')
    await page.getByRole('tab', { name: 'Imágenes', exact: true }).click()
    for (const label of ['Logo', 'Portada']) {
      await page.getByLabel(label, { exact: true }).setInputFiles({ name: `${label}.png`, mimeType: 'image/png', buffer: png })
      await expect(page.getByAltText(`Vista previa: ${label}`, { exact: true })).toBeVisible()
    }
    await page.getByRole('tab', { name: 'Página nosotros' }).click()
    for (const [label, text] of [['Título de Nosotros', 'Nuestra historia'], ['Nuestra historia', 'Historia guardada'], ['Nuestra misión', 'Atención cercana'], ['Nuestra visión (opcional)', 'Crecer con calidad'], ['Valores de tu negocio (uno por línea)', 'Respeto\nClaridad']]) await page.getByLabel(label, { exact: true }).fill(text)
    await page.getByRole('tab', { name: 'Contacto', exact: true }).click()
    for (const [label, text] of [['Teléfono', '+59176543210'], ['WhatsApp', '+59176543211'], ['Email', 'public@example.test'], ['Dirección', 'Calle de prueba 10'], ['Ciudad', 'La Paz'], ['Departamento / Región', 'La Paz'], ['País (código ISO)', 'BO'], ['Latitud del mapa', '-16.5'], ['Longitud del mapa', '-68.15']]) await page.getByLabel(label, { exact: true }).fill(text)
    await page.getByRole('button', { name: 'Colocar marcador en el centro del mapa' }).click()
    await expect(page.locator('.location-picker-marker')).toBeVisible()
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    await expect(page.getByText('Cambios guardados.', { exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Horarios' }).click()
    await page.getByRole('switch', { name: 'Abrir Lunes', exact: true }).click()
    await page.getByLabel('Lunes, fin de franja 1').fill('08:00')
    await page.getByRole('button', { name: 'Guardar horario', exact: true }).click()
    await expect(page.getByText('Completa las franjas, coloca el fin después del inicio y evita horarios superpuestos.')).toBeVisible()
    await page.getByLabel('Lunes, fin de franja 1').fill('12:00')
    await page.getByRole('button', { name: 'Agregar franja', exact: true }).first().click()
    await page.getByLabel('Lunes, inicio de franja 2').fill('14:00')
    await page.getByLabel('Lunes, fin de franja 2').fill('18:00')
    await page.getByRole('button', { name: 'Guardar horario', exact: true }).click()
    await expect(page.getByText('Horario guardado.', { exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Administración' }).click()
    await expect(page.getByRole('cell', { name: 'owner@example.test' })).toBeVisible()
    await page.getByRole('link', { name: 'Volver al negocio', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/plataforma/negocios/${id}$`))
    await page.getByRole('link', { name: 'Editar negocio', exact: true }).click()
    await page.reload()
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Negocio recuperado')
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore(), data = (await getDoc(doc(db, 'businesses', id))).data()
      expect(data.appearance.primaryColor).toBe('#123456')
      expect(data.about.vision).toBe('Crecer con calidad')
      expect(data.logo.url).toBe('https://images.example.test/logo.png')
      expect(data.location.latitude).toBeCloseTo(-16.5, 1)
      expect(data.weeklyHours['1']).toHaveLength(2)
      expect(data.ownerUserId).toBe(`${id}-owner`)
      expect((await getDocs(query(collection(db, 'auditLogs'), where('businessId', '==', id)))).size).toBeGreaterThanOrEqual(2)
    })
    await visitor.goto(`/b/${id}`)
    await expect(visitor.locator('.public-site')).toHaveCSS('--brand', '#123456')
    await expect(visitor.getByText('Negocio recuperado').first()).toBeVisible()
    await page.getByRole('tab', { name: 'Imágenes', exact: true }).click()
    await page.getByLabel('Portada', { exact: true }).setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: png })
    await expect(page.getByAltText('Vista previa: Portada', { exact: true })).toHaveAttribute('src', 'https://images.example.test/cover-replacement.png')
    await page.getByRole('button', { name: 'Quitar imagen', exact: true }).first().click()
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    await expect(page.getByText('Cambios guardados.', { exact: true })).toBeVisible()
    await page.reload()
    await page.getByRole('tab', { name: 'Imágenes', exact: true }).click()
    await expect(page.getByAltText('Vista previa: Logo', { exact: true })).toHaveCount(0)
    await expect(page.getByAltText('Vista previa: Portada', { exact: true })).toHaveAttribute('src', 'https://images.example.test/cover-replacement.png')
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: 'test-results/platform-editor-mobile.png', fullPage: true, animations: 'disabled' })
    expect(uploads).toEqual(['logo', 'cover', 'cover'])
    expect(errors).toEqual([])
  } finally { await visitorContext.close(); await env.cleanup() }
})

test('superadmin saves all four business colors and they persist on the public page', async ({ page }) => {
  const id = `colors-${Date.now()}`, email = `${id}@example.test`, password = 'Demo-secret-123!'
  const uid = await createAccount(email, password)
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  const colors = {
    'Color primario': '#123456',
    'Color secundario': '#abcdef',
    'Color de acento': '#884422',
    'Color de superficie': '#f8fafc',
  }
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      await setDoc(doc(db, 'users', uid), { id: uid, auth_uid: uid, email, status: 'active', globalRole: 'superadmin', businessIds: [], onboardingComplete: true })
      await setDoc(doc(db, 'businesses', id), {
        id,
        ownerUserId: `${id}-owner`,
        name: 'Negocio de colores',
        status: 'active',
        settings: { publicPageEnabled: true },
        appearance: { primaryColor: '#1672ed', secondaryColor: '#eaf3ff', accentColor: '#d97706', surfaceColor: '#f4f6f8' },
      })
    })
    await openSession(page, email, password)
    await page.goto(`/plataforma/negocios/${id}/editar`)
    await page.getByRole('tab', { name: 'Apariencia' }).click()
    for (const [label, color] of Object.entries(colors)) await page.getByLabel(label, { exact: true }).fill(color)
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    await expect(page.getByText('Cambios guardados.', { exact: true })).toBeVisible()

    await page.reload()
    await page.getByRole('tab', { name: 'Apariencia' }).click()
    for (const [label, color] of Object.entries(colors)) await expect(page.getByLabel(label, { exact: true })).toHaveValue(color)
    await page.goto(`/b/${id}`)
    await expect(page.locator('.public-site')).toHaveCSS('--brand', colors['Color primario'])
  } finally { await env.cleanup() }
})

test('platform search and state filters paginate across all businesses', async ({ page }) => {
  const id = `paging-${Date.now()}`, email = `${id}@example.test`, password = 'Demo-secret-123!'
  const uid = await createAccount(email, password)
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      await setDoc(doc(db, 'users', uid), { email, status: 'active', globalRole: 'superadmin', businessIds: [], onboardingComplete: true })
      await Promise.all(Array.from({ length: 23 }, (_, i) => setDoc(doc(db, 'businesses', `${id}-${i}`), { name: `${id} ${String(i).padStart(2, '0')}`, status: i === 22 ? 'deleted' : 'active', settings: { publicPageEnabled: false } })))
    })
    await openSession(page, email, password)
    await page.getByRole('link', { name: 'Negocios', exact: true }).click()
    await page.getByLabel('Buscar negocios por nombre').fill(id)
    await expect(page.locator('.platform-business-row')).toHaveCount(10)
    await expect(page.getByRole('heading', { name: `${id} 00`, exact: true })).toBeVisible()
    const pagination = page.getByRole('navigation', { name: 'Paginación de negocios' })
    await pagination.getByRole('button', { name: 'Siguiente' }).click()
    await expect(page.getByRole('heading', { name: `${id} 10`, exact: true })).toBeVisible()
    await pagination.getByRole('button', { name: 'Siguiente' }).click()
    await expect(page.locator('.platform-business-row')).toHaveCount(2)
    await expect(pagination.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
    await pagination.getByRole('button', { name: 'Anterior' }).click()
    await expect(page.getByRole('heading', { name: `${id} 10`, exact: true })).toBeVisible()
    await page.getByLabel('Filtrar por estado del negocio').selectOption('deleted')
    await expect(page.locator('.platform-business-row')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: `${id} 22`, exact: true })).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally { await env.cleanup() }
})

test('business roles cannot enter the platform editor by URL', async ({ browser }) => {
  test.setTimeout(90000)
  const id = `editor-access-${Date.now()}`, password = 'Demo-secret-123!'
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  try {
    for (const role of ['admin', 'professional', 'client']) {
      const email = `${role}-${id}@example.test`, uid = await createAccount(email, password)
      await env.withSecurityRulesDisabled(async context => {
        const db = context.firestore()
        await setDoc(doc(db, 'users', uid), { email, firstName: role, status: 'active', globalRole: 'user', businessIds: [id], defaultBusinessId: id, onboardingComplete: true })
        await setDoc(doc(db, 'businesses', id), { name: 'Control de acceso', ownerUserId: 'other', status: 'active', settings: { publicPageEnabled: true } })
        await setDoc(doc(db, 'memberships', `${id}_${uid}`), { businessId: id, userId: uid, role, status: 'active' })
      })
      const context = await browser.newContext(), page = await context.newPage()
      try {
        await page.goto('/login')
        await page.getByLabel('Correo electrónico').fill(email)
        await page.getByLabel('Contraseña', { exact: true }).fill(password)
        await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
        await expect(page).toHaveURL(role === 'client' ? /cliente$/ : /dashboard$/)
        await page.goto(`/plataforma/negocios/${id}/editar`)
        await expect(page).toHaveURL(role === 'client' ? /cliente$/ : /dashboard$/)
        await expect(page.getByRole('heading', { name: /Editar negocio:/ })).toHaveCount(0)
      } finally { await context.close() }
    }
  } finally { await env.cleanup() }
})
