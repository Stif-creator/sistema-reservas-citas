import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, Timestamp } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

async function createAccount(suffix) {
  const email = `notices-${suffix}@example.test`
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test-password', returnSecureToken: true }),
  })
  if (!response.ok) throw new Error(`No se pudo crear el usuario de prueba: ${response.status}`)
  return { email, uid: (await response.json()).localId }
}

test('admin, profesional y superadmin reciben vistas con alcance y contenido separados', async ({ browser }) => {
  test.setTimeout(90000)
  const suffix = Date.now()
  const [admin, professional, superadmin] = await Promise.all(['admin', 'professional', 'superadmin'].map(role => createAccount(`${role}-${suffix}`)))
  const businessId = `notices-role-${suffix}`
  const otherBusinessId = `notices-other-${suffix}`
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    for (const id of [businessId, otherBusinessId]) await setDoc(doc(db, 'businesses', id), { name: id, ownerUserId: admin.uid, status: 'active', settings: { timezone: 'America/La_Paz' } })
    for (const [account, role] of [[admin, 'admin'], [professional, 'professional']]) {
      await setDoc(doc(db, 'users', account.uid), { id: account.uid, auth_uid: account.uid, email: account.email, firstName: role, status: 'active', globalRole: 'user', onboardingComplete: true, businessIds: [businessId], defaultBusinessId: businessId })
      await setDoc(doc(db, 'memberships', `${businessId}_${account.uid}`), { userId: account.uid, businessId, role, status: 'active', permissions: {} })
    }
    await setDoc(doc(db, 'users', superadmin.uid), { id: superadmin.uid, auth_uid: superadmin.uid, email: superadmin.email, firstName: 'Superadmin', status: 'active', globalRole: 'superadmin', onboardingComplete: true, businessIds: [] })
    const notice = (recipientUserId, id, extra) => setDoc(doc(db, 'notifications', id), { businessId, recipientUserId, title: extra.title, message: extra.message, type: extra.type, read: false, visibleAt: Timestamp.now(), createdAt: Timestamp.now() })
    await notice(admin.uid, `admin-own-${suffix}`, { type: 'change', title: 'Aviso propio del negocio', message: 'Reserva del negocio autorizado.' })
    await setDoc(doc(db, 'notifications', `admin-foreign-${suffix}`), { businessId: otherBusinessId, recipientUserId: admin.uid, title: 'Aviso de otro negocio', message: 'No debe aparecer.', type: 'change', read: false, visibleAt: Timestamp.now(), createdAt: Timestamp.now() })
    await notice(professional.uid, `professional-own-${suffix}`, { type: 'change', title: 'Aviso personal asignado', message: 'Cita asignada.' })
    await notice(superadmin.uid, `platform-global-${suffix}`, { type: 'platform', title: 'Nuevo negocio registrado', message: 'Evento global de plataforma.' })
    await notice(superadmin.uid, `superadmin-personal-${suffix}`, { type: 'change', title: 'Aviso personal heredado', message: 'No debe mostrarse en globales.' })
  })
  await env.cleanup()

  async function openCenter(account, label, visibleTitle, hiddenTitle) {
    const page = await browser.newPage()
    await page.goto('/login')
    await page.getByLabel('Correo electrónico').fill(account.email)
    await page.getByLabel('Contraseña', { exact: true }).fill('test-password')
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(page).not.toHaveURL(/\/login$/, { timeout: 15000 })
    await page.goto('/avisos')
    await expect(page.getByRole('heading', { name: 'Avisos y recordatorios' })).toBeVisible()
    await expect(page.getByText(label, { exact: true })).toBeVisible()
    await expect(page.locator('.notice-row').filter({ hasText: visibleTitle })).toHaveCount(1)
    await expect(page.locator('.notice-row').filter({ hasText: hiddenTitle })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Avisos: 1 sin leer' })).toBeVisible()
    return page
  }

  const pages = []
  pages.push(await openCenter(admin, 'AVISOS DEL NEGOCIO', 'Aviso propio del negocio', 'Aviso de otro negocio'))
  pages.push(await openCenter(professional, 'AVISOS PERSONALES', 'Aviso personal asignado', 'Aviso propio del negocio'))
  pages.push(await openCenter(superadmin, 'AVISOS GLOBALES', 'Nuevo negocio registrado', 'Aviso personal heredado'))
  for (const page of pages) {
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.close()
  }
})
