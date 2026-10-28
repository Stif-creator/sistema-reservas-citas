import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
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
    await page.locator('article').filter({ hasText: 'Negocio de supervisión' }).getByRole('link', { name: 'Ver supervisión' }).click()
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
