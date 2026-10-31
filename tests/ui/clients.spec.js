import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, Timestamp } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test('clients keep scoped access, searchable pagination, stable selection and isolated history', async ({ page, browser }) => {
  test.setTimeout(90000)
  const suffix = Date.now()
  const businessId = `clients-${suffix}`
  const emptyBusinessId = `clients-empty-${suffix}`
  const credentials = {}
  for (const role of ['admin', 'professional', 'other_professional', 'empty_admin']) {
    const email = `${role}-${suffix}@example.test`
    const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-password', returnSecureToken: true }),
    })
    expect(response.ok).toBe(true)
    credentials[role] = { email, uid: (await response.json()).localId }
  }

  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    for (const [id, owner] of [[businessId, credentials.admin.uid], [emptyBusinessId, credentials.empty_admin.uid]]) {
      await setDoc(doc(db, 'businesses', id), { ownerUserId: owner, name: id, status: 'active', settings: { timezone: 'America/La_Paz' } })
    }
    for (const [role, account] of Object.entries(credentials)) {
      const business = role === 'empty_admin' ? emptyBusinessId : businessId
      const memberRole = role === 'admin' || role === 'empty_admin' ? 'admin' : 'professional'
      await setDoc(doc(db, 'users', account.uid), { id: account.uid, auth_uid: account.uid, firstName: role, lastName: 'Clientes', email: account.email, status: 'active', globalRole: 'user', businessIds: [business], onboardingComplete: true })
      await setDoc(doc(db, 'memberships', `${business}_${account.uid}`), { userId: account.uid, businessId: business, role: memberRole, status: 'active', permissions: {} })
    }
    await setDoc(doc(db, 'professionals', `profile-${suffix}`), { businessId, userId: credentials.professional.uid, displayName: 'Profesional Uno', isActive: true })
    await setDoc(doc(db, 'professionals', `profile-other-${suffix}`), { businessId, userId: credentials.other_professional.uid, displayName: 'Profesional Dos', isActive: true })
    const mariaId = `client-maria-${suffix}`
    await setDoc(doc(db, 'clients', mariaId), { id: mariaId, businessId, userId: null, firstName: 'María', lastName: 'Prueba', email: `maria-${suffix}@example.test`, phone: '7000000000', status: 'active', createdAt: Timestamp.fromMillis(Date.now() - 86400000) })
    for (let index = 1; index <= 12; index++) {
      const clientId = `client-${suffix}-${index}`
      await setDoc(doc(db, 'clients', clientId), { id: clientId, businessId, userId: null, firstName: `Cliente ${index}`, lastName: 'Manual', phone: `700000${String(index).padStart(2, '0')}`, email: `manual-${index}-${suffix}@example.test`, status: index % 2 === 0 ? 'inactive' : 'active', createdAt: Timestamp.fromMillis(Date.now() - index * 86400000) })
    }
    const startAt = Timestamp.fromMillis(Date.now() + 86400000)
    for (const [id, professionalUserId, clientId, professionalName] of [
      [`appointment-${suffix}`, credentials.professional.uid, mariaId, 'Profesional Uno'],
      [`appointment-other-${suffix}`, credentials.other_professional.uid, `client-${suffix}-1`, 'Profesional Dos'],
    ]) await setDoc(doc(db, 'reservations', id), { id, businessId, clientId, status: 'confirmed', serviceName: 'Consulta integral', professionalName, professionalUserId, startAt, endAt: Timestamp.fromMillis(startAt.toMillis() + 1800000), timeZone: 'America/La_Paz' })
  })
  await env.cleanup()

  async function login(target, role) {
    await target.goto('/login')
    await target.getByLabel('Correo electrónico').fill(credentials[role].email)
    await target.getByLabel('Contraseña', { exact: true }).fill('test-password')
    await target.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(target).toHaveURL(/\/dashboard$/)
  }

  await login(page, 'admin')
  await page.goto('/clientes')
  const clientList = page.getByRole('region', { name: 'Listado de clientes' })
  await expect(clientList).toContainText('de 13 registros')
  await expect(page.getByText('Total de clientes')).toBeVisible()
  await clientList.getByRole('button', { name: 'Página siguiente' }).click()
  await expect(clientList).toContainText('Página 2 de 2')
  const firstVisible = await clientList.locator('.clients-row strong').first().innerText()
  await expect(page.locator('.clients-detail-identity h2')).toHaveText(firstVisible)

  const search = page.getByRole('searchbox', { name: 'Buscar clientes' })
  await search.fill('70000001')
  await expect(clientList.getByText('Cliente 1 Manual', { exact: true })).toBeVisible()
  await search.fill(`manual-2-${suffix}@example.test`)
  await expect(clientList.getByText('Cliente 2 Manual', { exact: true })).toBeVisible()
  await search.fill('')
  await page.getByLabel('Estado').selectOption('inactive')
  await expect(clientList.getByText('Cliente 2 Manual', { exact: true })).toBeVisible()
  await page.getByLabel('Estado').selectOption('all')
  await page.getByLabel('Ordenar por').selectOption('name')
  await expect(clientList.locator('.clients-row strong').first()).toHaveText('Cliente 1 Manual')
  await page.getByLabel('Ordenar por').selectOption('recent')
  await search.fill('María')
  await expect(page.locator('.clients-detail-identity h2')).toHaveText('María Prueba')

  let delayHistory = false
  await page.route('**/booking', async route => {
    if (route.request().postDataJSON()?.action === 'clientHistory' && delayHistory) await new Promise(resolve => setTimeout(resolve, 700))
    return route.continue()
  })
  const historyTab = page.getByRole('tab', { name: 'Historial de citas' })
  await historyTab.click()
  await expect(page.getByText('Consulta integral', { exact: true })).toBeVisible()
  await search.fill('Cliente 1 Manual')
  await search.fill('María')
  delayHistory = true
  await historyTab.click()
  await expect(page.getByRole('status').filter({ hasText: 'Cargando historial' })).toBeVisible()
  await search.fill('Cliente 1 Manual')
  await expect(page.locator('.clients-detail-identity h2')).toHaveText('Cliente 1 Manual')
  await page.waitForTimeout(900)
  await expect(page.locator('.clients-detail-content')).not.toContainText('Consulta integral')

  delayHistory = false
  await search.fill('María')
  await page.getByRole('button', { name: 'Editar cliente' }).click()
  const phone = page.getByLabel('Teléfono')
  await phone.fill('123')
  expect(await phone.evaluate(input => input.checkValidity())).toBe(false)
  await phone.fill('7000000123')
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toContainText('cambios sin guardar')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar cambios' }).click()
  await page.getByRole('button', { name: 'Editar cliente' }).click()
  await page.getByLabel('Teléfono').fill('7000000123')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Cliente actualizado' })).toBeVisible()
  await expect(page.locator('.clients-detail-contact')).toContainText('7000000123')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  const professionalContext = await browser.newContext()
  const professionalPage = await professionalContext.newPage()
  try {
    await login(professionalPage, 'professional')
    await professionalPage.goto('/clientes')
    const professionalList = professionalPage.getByRole('region', { name: 'Listado de clientes' })
    await expect(professionalList).toContainText('de 1 registros')
    await expect(professionalList.getByText('María Prueba', { exact: true })).toBeVisible()
    await professionalList.getByRole('button', { name: 'Ver detalles de María Prueba' }).click()
    await professionalPage.getByRole('tab', { name: 'Historial de citas' }).click()
    await expect(professionalPage.getByText('Consulta integral', { exact: true })).toBeVisible()
  } finally { await professionalContext.close() }

  const emptyContext = await browser.newContext()
  const emptyPage = await emptyContext.newPage()
  try {
    await login(emptyPage, 'empty_admin')
    await emptyPage.goto('/clientes')
    await expect(emptyPage.getByText('Aún no hay clientes registrados.')).toBeVisible()
    await expect(emptyPage.getByText('Total de clientes')).toBeVisible()
  } finally { await emptyContext.close() }
})
