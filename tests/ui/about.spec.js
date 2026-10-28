import { test, expect } from '@playwright/test'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'

test('about uses saved content, optional vision, responsive layout and contrasting live themes', async ({ page, browser }) => {
  test.setTimeout(180000)
  const suffix = Date.now()
  const businessId = `about-${suffix}`
  const accounts = {}
  const password = 'test-password'
  for (const role of ['admin', 'client', 'superadmin']) {
    const email = `about-${role}-${suffix}@example.test`
    const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
    })
    expect(response.ok).toBe(true)
    accounts[role] = { email, uid: (await response.json()).localId }
  }
  const env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  const adminContext = await browser.newContext()
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore()
      await setDoc(doc(db, 'businesses', businessId), { id: businessId, name: 'Taller Horizonte', ownerUserId: accounts.admin.uid, status: 'active',
        description: 'Información del taller de prueba.', about: { title: 'Conoce nuestro taller', story: 'Historia configurada por el negocio.', mission: 'Misión configurada.', values: 'Claridad\nRespeto\nPuntualidad' },
        settings: { publicPageEnabled: true, timezone: 'America/La_Paz', currencyCode: 'BOB' } })
      for (const [role, account] of Object.entries(accounts)) {
        await setDoc(doc(db, 'users', account.uid), { id: account.uid, auth_uid: account.uid, firstName: role, lastName: 'Prueba', email: account.email, status: 'active', globalRole: role === 'superadmin' ? 'superadmin' : 'user', businessIds: [businessId], onboardingComplete: true })
        if (role !== 'superadmin') await setDoc(doc(db, 'memberships', `${businessId}_${account.uid}`), { businessId, userId: account.uid, role, status: 'active' })
      }
    })
    async function login(target, role) {
      await target.goto('http://127.0.0.1:4173/login')
      await target.getByLabel('Correo electrónico').fill(accounts[role].email)
      await target.getByLabel('Contraseña', { exact: true }).fill(password)
      await target.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
      await expect(target).toHaveURL(role === 'client' ? /\/cliente$/ : /\/dashboard$/)
    }
    await login(page, 'client')
    await page.goto('/cliente/nosotros')
    await expect(page.getByRole('heading', { name: 'Conoce nuestro taller' })).toBeVisible()
    await expect(page.locator('.client-about-vision, .client-about-team, .client-about-contact')).toHaveCount(0)
    await expect(page.locator('.client-about-art')).toBeVisible()
    await expect(page.locator('.client-about-value-card')).toHaveCount(3)
    await expect(page.locator('.client-site')).toHaveCSS('--brand', '#1672ed')

    // Save via the real administrator form; the customer receives the snapshot live.
    const admin = await adminContext.newPage()
    await login(admin, 'admin')
    await admin.goto('http://127.0.0.1:4173/negocio')
    await admin.getByRole('tab', { name: 'Página nosotros', exact: true }).click()
    await admin.getByLabel('Nuestra visión (opcional)').fill('Visión escrita por la administración.')
    await admin.getByLabel('Valores de tu negocio (uno por línea)').fill('Atención cercana\nCalidad en cada servicio\nRespeto por tu tiempo')
    await admin.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    await expect(admin.getByText('Cambios guardados.', { exact: true })).toBeVisible()
    await expect(page.locator('.client-about-vision')).toContainText('Visión escrita por la administración.')
    await expect(page.locator('.client-about-value-card')).toContainText(['Atención cercana', 'Calidad en cada servicio', 'Respeto por tu tiempo'])
    await env.withSecurityRulesDisabled(async context => {
      const about = (await getDoc(doc(context.firestore(), 'businesses', businessId))).data().about
      expect(about.vision).toBe('Visión escrita por la administración.')
      expect(about.values).toBe('Atención cercana\nCalidad en cada servicio\nRespeto por tu tiempo')
    })
    const superadmin = await adminContext.newPage()
    await login(superadmin, 'superadmin')
    await superadmin.goto('/negocio')
    await expect(superadmin).toHaveURL(/dashboard$/)
    await expect(superadmin.getByRole('heading', { name: 'Resumen de la plataforma' })).toBeVisible()
    await superadmin.goto('/negocio')
    await expect(superadmin).toHaveURL(/dashboard$/)

    for (const [name, appearance] of Object.entries({
      dark: { primaryColor: '#151329', secondaryColor: '#101010', accentColor: '#24122e', surfaceColor: '#172526' },
      light: { primaryColor: '#fff1a6', secondaryColor: '#fff9dc', accentColor: '#ffe9ed', surfaceColor: '#ffffff' },
    })) {
      await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'businesses', businessId), { appearance }))
      await expect(page.locator('.client-site')).toHaveCSS('--brand', appearance.primaryColor)
      await page.waitForTimeout(350) // Let the CSS color transition settle before measuring contrast.
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        // Read actual computed colors, including inherited styles from client/public layouts.
        const contrast = await page.locator('.client-about-page').evaluate(root => {
          const luminance = css => {
            const raw = css.match(/[\d.]+/g).slice(0, 3).map(Number)
            const channels = (css.startsWith('color(srgb') ? raw : raw.map(v => v / 255)).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
            return channels.reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
          }
          return ['.client-about-mission h2', '.client-about-mission p', '.client-about-vision h2', '.client-about-vision p', '.client-about-cta h2', '.client-about-cta p', '.client-about-cta a', '.client-about-actions a', '.client-about-kicker'].map(selector => {
            const element = root.querySelector(selector)
            let background = element
            while (getComputedStyle(background).backgroundColor === 'rgba(0, 0, 0, 0)') background = background.parentElement
            const fg = luminance(getComputedStyle(element).color), bg = luminance(getComputedStyle(background).backgroundColor)
            return { selector, ratio: (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05), foreground: getComputedStyle(element).color, background: getComputedStyle(background).backgroundColor, elementBackground: getComputedStyle(element).backgroundColor }
          })
        })
        for (const item of contrast) expect(item.ratio, `${name} ${width}: ${item.selector}`).toBeGreaterThanOrEqual(4.5)
        await page.screenshot({ path: `test-results/about-${name}-${width}.png`, fullPage: true })
      }
    }
    // Existing local asset stands in for a configured business image, without external requests.
    await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'businesses', businessId), { cover: { url: 'http://127.0.0.1:4173/favicon.svg' } }))
    await expect(page.locator('.client-about-hero-image > img')).toHaveAttribute('src', 'http://127.0.0.1:4173/favicon.svg')
    await expect.poll(() => page.locator('.client-about-hero-image > img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true)
    await expect(page.locator('.client-about-story-image > img')).toHaveAttribute('src', 'http://127.0.0.1:4173/favicon.svg')
    await page.getByRole('link', { name: 'Conoce nuestros servicios' }).click()
    await expect(page).toHaveURL(/\/cliente\/servicios$/)
    await page.goto('/cliente/nosotros')
    await page.locator('.client-about-cta').getByRole('link', { name: 'Contáctanos' }).click()
    await expect(page).toHaveURL(/\/cliente\/contacto$/)
    await page.goto('/cliente/nosotros')
    await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'businesses', businessId), { about: {}, description: '' }))
    await expect(page.locator('.client-about-story, .client-about-purpose, .client-about-values')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Nosotros', exact: true })).toBeVisible()
  } finally {
    await adminContext.close()
    await env.cleanup()
  }
})
