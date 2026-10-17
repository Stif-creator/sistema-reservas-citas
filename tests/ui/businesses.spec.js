import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test('platform links a business, administrator selects it, suspension and archival are reversible', async ({ page, browser }) => {
  test.setTimeout(120000)
  const id = `businesses-${Date.now()}`, password = 'Test-password-123!'
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  const accounts = {}
  for (const role of ['platform', 'admin']) {
    const email = `${role}-${id}@example.test`
    const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) })
    const { localId } = await response.json()
    accounts[role] = { uid: localId, email }
  }
  const adminContext = await browser.newContext(), admin = await adminContext.newPage()
  async function login(target, email) {
    await target.goto('/login'); await target.getByLabel('Correo electrónico').fill(email)
    await target.getByLabel('Contraseña', { exact: true }).fill(password)
    await target.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(target).toHaveURL(/dashboard/)
  }
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      await setDoc(doc(db, 'businesses', id), { name: 'Negocio anterior', ownerUserId: accounts.admin.uid, status: 'active', settings: { publicPageEnabled: false } })
      for (const [role, account] of Object.entries(accounts)) {
        await setDoc(doc(db, 'users', account.uid), { email: account.email, firstName: role, lastName: 'Test', status: 'active', globalRole: role === 'platform' ? 'superadmin' : 'user', businessIds: [id], onboardingComplete: true })
        await setDoc(doc(db, 'memberships', `${id}_${account.uid}`), { userId: account.uid, businessId: id, role: 'admin', status: 'active' })
      }
    })
    await login(page, accounts.platform.email)
    await page.getByRole('link', { name: 'Gestionar negocios' }).click()
    await page.getByLabel('Nombre del negocio', { exact: true }).fill('Consultorio nuevo')
    await page.getByLabel('Correo del administrador').fill(accounts.admin.email)
    await page.getByRole('button', { name: 'Crear y vincular negocio' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Negocio creado y vinculado' })).toBeVisible()
    await login(admin, accounts.admin.email)
    await admin.getByRole('link', { name: 'Configuración', exact: true }).click()
    await expect(admin.getByLabel('Nombre', { exact: true })).toHaveValue('Consultorio nuevo')
    await expect(admin.getByLabel('Nombre', { exact: true })).toBeDisabled()
    await expect(admin.getByLabel('Color primario')).toBeDisabled()
    await admin.getByLabel('Descripción', { exact: true }).fill('Atención con cita previa')
    await admin.getByLabel('Publicar página del negocio').check()
    await admin.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    await expect(admin.getByText('Cambios guardados.', { exact: true })).toBeVisible()
    const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Consultorio nuevo', exact: true }) })
    await card.getByRole('button', { name: 'Desactivar', exact: true }).click()
    await expect(admin.getByRole('alert')).toContainText('desactivado')
    await card.getByRole('button', { name: 'Eliminar', exact: true }).click()
    await page.getByLabel('Escribe Consultorio nuevo').fill('Consultorio nuevo')
    await page.getByRole('button', { name: 'Confirmar eliminación' }).click()
    await expect(card).toHaveCount(0)
    await page.getByLabel('Mostrar también eliminados').check()
    await expect(card).toContainText('archivado')
    await card.getByRole('button', { name: 'Activar / restaurar' }).click()
    await expect(admin.getByLabel('Descripción', { exact: true })).toHaveValue('Atención con cita previa')
    await admin.getByLabel('Seleccionar negocio').selectOption(id)
    await expect(admin.getByLabel('Nombre', { exact: true })).toHaveValue('Negocio anterior')
    await page.screenshot({ path: 'test-results/platform-businesses.png', fullPage: true })
  } finally { await adminContext.close(); await env.cleanup() }
})
