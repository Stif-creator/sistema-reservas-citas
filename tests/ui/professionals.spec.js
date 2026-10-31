import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test('professional manager shows a live profile preview and retains synchronized service assignments', async ({ page }) => {
  const businessId = `professionals-${Date.now()}`
  const email = `${businessId}@example.test`
  const password = 'Professionals-test-123!'
  const signup = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  expect(signup.ok).toBe(true)
  const { localId: uid } = await signup.json()
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      await setDoc(doc(db, 'users', uid), { id: uid, auth_uid: uid, firstName: 'Admin', lastName: 'Prueba', email, status: 'active', globalRole: 'user', businessIds: [businessId], defaultBusinessId: businessId, onboardingComplete: true })
      await setDoc(doc(db, 'memberships', `${businessId}_${uid}`), { userId: uid, businessId, role: 'admin', status: 'active' })
      await setDoc(doc(db, 'memberships', `${businessId}_pro`), { userId: 'pro', businessId, role: 'professional', status: 'active' })
      await setDoc(doc(db, 'businesses', businessId), { id: businessId, name: 'Consultorio de prueba', status: 'active', settings: { timezone: 'America/La_Paz' } })
      await setDoc(doc(db, 'categories', `${businessId}-care`), { id: `${businessId}-care`, businessId, name: 'Odontología', isActive: true })
      await setDoc(doc(db, 'professionals', `${businessId}-profile`), { id: `${businessId}-profile`, businessId, userId: 'pro', displayName: 'Camila Vargas', email: 'camila@example.test', isActive: true, jobTitle: 'Odontopediatría', phone: '', bio: 'Perfil de prueba.', serviceIds: [], weeklyHours: {} })
      await setDoc(doc(db, 'services', `${businessId}-service`), { id: `${businessId}-service`, businessId, name: 'Consulta dental', categoryId: `${businessId}-care`, price: 100, durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, isActive: true, professionalIds: [] })
    })

    await page.goto('/login')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(page).toHaveURL(/dashboard$/)
    await page.goto('/profesionales')
    await expect(page.getByRole('heading', { name: 'Profesionales' })).toBeVisible()
    await page.getByRole('button', { name: 'Gestionar' }).click()

    const dialog = page.getByRole('dialog', { name: 'Gestionar profesional' })
    await expect(dialog.locator('.professional-editor-identity')).toContainText('Camila Vargas')
    await dialog.getByLabel('Puesto').fill('Odontología infantil')
    await expect(dialog.locator('.professional-summary-card:not(.hours-summary)')).toContainText('Odontología infantil')
    await dialog.getByRole('button', { name: 'Guardar perfil' }).click()
    await expect(dialog.getByText('Perfil actualizado.')).toBeVisible()

    await dialog.getByRole('tab', { name: 'Servicios' }).click()
    await dialog.locator('label').filter({ hasText: 'Consulta dental' }).locator('input[type="checkbox"]').check()
    await dialog.getByRole('button', { name: 'Guardar servicios' }).click()
    await expect(dialog.getByText('Servicios asignados actualizados.')).toBeVisible()

    const db = env.authenticatedContext(uid).firestore()
    expect((await getDoc(doc(db, 'professionals', `${businessId}-profile`))).data().serviceIds).toEqual([`${businessId}-service`])
    expect((await getDoc(doc(db, 'services', `${businessId}-service`))).data().professionalIds).toEqual([`${businessId}-profile`])

    await dialog.getByRole('tab', { name: 'Horarios' }).click()
    await expect(dialog.getByText('Resumen de horario')).toBeVisible()
    await expect(dialog.locator('.hours-day-summary p')).toHaveCount(7)
    await dialog.getByRole('switch', { name: 'Abrir Lunes' }).click()
    await dialog.getByLabel('Lunes, inicio de franja 1').fill('09:00')
    await dialog.getByLabel('Lunes, fin de franja 1').fill('13:00')
    await dialog.getByRole('button', { name: 'Copiar a otros días' }).click()
    await dialog.getByLabel('Martes', { exact: true }).check()
    await dialog.getByRole('button', { name: 'Confirmar y copiar' }).click()
    const copyConfirmation = page.getByRole('alertdialog')
    await expect(copyConfirmation).toContainText('Martes')
    await copyConfirmation.getByRole('button', { name: 'Confirmar copia' }).click()
    await expect(dialog.locator('.hours-day-summary')).toContainText('09:00–13:00')
  } finally {
    await env.cleanup()
  }
})
