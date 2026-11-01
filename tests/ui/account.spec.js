import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

async function createAccount(email, password) {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  expect(response.ok).toBe(true)
  return (await response.json()).localId
}

async function login(page, email, password) {
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page).toHaveURL(/dashboard$/)
  await page.goto('/seguridad')
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible()
}

test('admin, professional and superadmin update their own account profile with the shared screen', async ({ page }) => {
  test.setTimeout(90000)
  const suffix = Date.now(), password = 'Demo-secret-123!'
  const roles = ['admin', 'professional', 'superadmin']
  const accounts = await Promise.all(roles.map(async role => {
    const email = `${role}-${suffix}@example.test`
    return { role, email, uid: await createAccount(email, password) }
  }))
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: {
    host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8'),
  } })
  const uploaded = []
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCuoAAAAASUVORK5CYII=', 'base64')
  await page.route('**/images', async route => {
    const payload = route.request().postDataJSON()
    uploaded.push(payload)
    await route.fulfill({ json: { data: { url: `https://res.cloudinary.com/test-cloud/image/upload/${payload.kind}-account.png` } } })
  })
  await page.route('https://res.cloudinary.com/**', route => route.fulfill({ contentType: 'image/png', body: png }))
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      await setDoc(doc(db, 'businesses', `account-${suffix}`), { id: `account-${suffix}`, name: 'Negocio de prueba', ownerUserId: accounts[0].uid, status: 'active', settings: { publicPageEnabled: false } })
      for (const { role, email, uid } of accounts) {
        const user = { id: uid, auth_uid: uid, firstName: 'Nombre', lastName: role, email, phone: '+591 70000000', status: 'active', globalRole: role === 'superadmin' ? 'superadmin' : 'user', businessIds: role === 'superadmin' ? [] : [`account-${suffix}`], onboardingComplete: true, photoUrl: null }
        await setDoc(doc(db, 'users', uid), user)
        if (role !== 'superadmin') await setDoc(doc(db, 'memberships', `account-${suffix}_${uid}`), { businessId: `account-${suffix}`, userId: uid, role, status: 'active' })
        if (role === 'professional') await setDoc(doc(db, 'professionals', `account-${suffix}_${uid}`), { businessId: `account-${suffix}`, userId: uid, displayName: 'Nombre profesional', photo: { url: 'https://images.example.test/commercial.png', publicId: 'commercial' }, isActive: true })
      }
    })
    for (const account of accounts) {
      await login(page, account.email, password)
      await expect(page.getByRole('tab', { name: 'Datos personales' })).toHaveAttribute('aria-selected', 'true')
      await page.setViewportSize({ width: 390, height: 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.setViewportSize({ width: 1440, height: 900 })
      await expect(page.getByLabel('Correo electrónico')).toHaveValue(account.email)
      await expect(page.getByLabel('Correo electrónico')).toHaveAttribute('readonly', '')
      await page.getByLabel('Nombre *').fill(`Actualizado ${account.role}`)
      await page.getByLabel('Apellido *').fill('Perfil')
      await page.getByLabel('Teléfono').fill('')
      await page.getByRole('tab', { name: 'Seguridad' }).click()
      await expect(page.getByRole('alertdialog', { name: '¿Descartar los cambios?' })).toBeVisible()
      await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar', exact: true }).click()
      await expect(page.getByRole('tab', { name: 'Datos personales' })).toHaveAttribute('aria-selected', 'true')
      if (account.role === 'professional') await expect(page.getByText(/foto comercial.*por separado/i)).toBeVisible()
      if (account.role === 'superadmin') await expect(page.getByText('Negocio de prueba')).toHaveCount(0)
      await page.getByRole('button', { name: 'Guardar cambios' }).click()
      await expect(page.getByRole('status')).toContainText('Tus datos personales se guardaron correctamente.')
      if (account.role !== 'superadmin') await expect(page.getByRole('button', { name: new RegExp(`Actualizado ${account.role} Perfil`) })).toBeVisible()
      expect((await getDoc(doc(env.authenticatedContext(account.uid).firestore(), 'users', account.uid))).data().firstName).toBe(`Actualizado ${account.role}`)
      if (account.role === 'admin') {
        await page.getByLabel('Seleccionar foto de perfil').setInputFiles({ name: 'avatar.gif', mimeType: 'image/gif', buffer: Buffer.from('gif') })
        await expect(page.getByRole('alert')).toContainText('JPG, PNG o WebP')
        await page.getByLabel('Seleccionar foto de perfil').setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) })
        await expect(page.getByRole('alert')).toContainText('máximo 2 MB')
        await page.getByLabel('Seleccionar foto de perfil').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png })
        await expect(page.getByRole('img', { name: 'Vista previa de tu foto de perfil' })).toHaveAttribute('src', /^blob:/)
        await page.getByRole('button', { name: 'Guardar cambios' }).click()
        await expect(page.getByRole('status')).toContainText('Tus datos personales se guardaron correctamente.')
        expect(uploaded.at(-1).kind).toBe('profile')
        expect(uploaded.at(-1).businessId).toBe(`account-${suffix}`)
        await page.getByRole('button', { name: 'Quitar foto' }).click()
        await page.getByRole('button', { name: 'Guardar cambios' }).click()
        await expect(page.getByRole('status')).toContainText('Tus datos personales se guardaron correctamente.')
        expect((await getDoc(doc(env.authenticatedContext(account.uid).firestore(), 'users', account.uid))).data().photoUrl).toBeNull()
      }
      if (account.role === 'professional') {
        let commercialPhoto
        await env.withSecurityRulesDisabled(async context => {
          commercialPhoto = (await getDoc(doc(context.firestore(), 'professionals', `account-${suffix}_${account.uid}`))).data().photo.url
        })
        expect(commercialPhoto).toBe('https://images.example.test/commercial.png')
      }
      if (account.role === 'superadmin') {
        await page.getByLabel('Seleccionar foto de perfil').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png })
        await page.getByRole('button', { name: 'Guardar cambios' }).click()
        await expect(page.getByRole('status')).toContainText('Tus datos personales se guardaron correctamente.')
        expect(uploaded.at(-1).businessId).toBeNull()
      }
      await page.getByRole('tab', { name: 'Seguridad' }).click()
      await expect(page.getByRole('tabpanel', { name: 'Seguridad' })).toBeVisible()
      if (account.role === 'admin') {
        await page.getByRole('button', { name: 'Mostrar contraseña actual' }).click()
        await expect(page.locator('input[name="current"]')).toHaveAttribute('type', 'text')
        await page.getByRole('button', { name: 'Ocultar contraseña actual' }).click()
      }
      await page.locator('input[name="current"]').fill(account.role === 'superadmin' ? password : 'Wrong-secret-123!')
      await page.locator('input[name="password"]').fill('Demo-secret-456!')
      await page.locator('input[name="confirm"]').fill(account.role === 'professional' ? 'Demo-secret-789!' : 'Demo-secret-456!')
      await page.getByRole('button', { name: 'Cambiar contraseña', exact: true }).click()
      if (account.role === 'professional') {
        await expect(page.getByRole('alert')).toContainText('no coinciden')
        await page.locator('input[name="confirm"]').fill('Demo-secret-456!')
        await page.getByRole('button', { name: 'Cambiar contraseña', exact: true }).click()
      }
      if (account.role === 'superadmin') await expect(page.getByRole('dialog', { name: 'Contraseña actualizada' })).toBeVisible()
      else await expect(page.getByRole('alert')).toContainText('contraseña actual no es correcta')
      if (account.role === 'superadmin') await page.getByRole('button', { name: 'Entendido' }).click()
      await page.getByRole('button', { name: /Cerrar sesión/ }).last().click()
      if (await page.getByRole('alertdialog', { name: '¿Descartar los cambios?' }).count()) {
        await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar cambios' }).click()
      }
      await expect(page).toHaveURL(/login$/)
    }
    expect(uploaded.map(item => item.businessId)).toEqual([`account-${suffix}`, null])
  } finally { await env.cleanup() }
})
