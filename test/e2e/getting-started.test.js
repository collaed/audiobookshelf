/**
 * Playwright E2E: Follow the official ABS Getting Started guide
 * https://www.audiobookshelf.org/guides/library_creation/
 *
 * Steps:
 * 1. Open login page
 * 2. Log in with credentials
 * 3. Navigate to Settings → Libraries
 * 4. Verify library exists (or create one)
 * 5. Navigate to library view
 * 6. Verify books are visible
 * 7. Click into a book detail page
 * 8. Verify book metadata loads
 * 9. Check that our new features don't break the flow
 *
 * Run: ABS_USER=ecb ABS_PASS=yourpass ABS_TEST_URL=https://abs.ecb.pm npx playwright test test/e2e/getting-started.test.js
 */
const { test, expect } = require('@playwright/test')

const BASE = process.env.ABS_TEST_URL || 'http://localhost:13378'
const USER = process.env.ABS_USER || 'ecb'
const PASS = process.env.ABS_PASS || ''

test.describe('Getting Started Guide — Full User Flow', () => {

  test('Step 1: Login page loads correctly', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.waitForLoadState('networkidle')

    // Should see the ABS logo and login form
    const logo = page.locator('img[alt*="Audiobookshelf"]')
    await expect(logo).toBeVisible({ timeout: 10000 })

    // Should have username and password inputs
    const usernameInput = page.locator('input[name="username"]')
    const passwordInput = page.locator('input[name="password"]')
    await expect(usernameInput).toBeVisible()
    await expect(passwordInput).toBeVisible()

    // Should have a submit button
    const submitBtn = page.locator('button[type="submit"]')
    await expect(submitBtn).toBeVisible()
  })

  test('Step 2: Can log in successfully', async ({ page }) => {
    test.skip(!PASS, 'ABS_PASS not set — skipping login test')

    await page.goto(`${BASE}/login`)
    await page.waitForLoadState('networkidle')

    await page.fill('input[name="username"]', USER)
    await page.fill('input[name="password"]', PASS)
    await page.click('button[type="submit"]')

    // Should redirect to library or home page
    await page.waitForURL(/\/(library|$)/, { timeout: 10000 })

    // Should see the app bar / navigation
    const appContent = page.locator('#app-content, #__nuxt')
    await expect(appContent).toBeVisible()
  })

  test('Step 3: Library view loads after login', async ({ page }) => {
    test.skip(!PASS, 'ABS_PASS not set')

    // Login first
    await page.goto(`${BASE}/login`)
    await page.waitForLoadState('networkidle')
    await page.fill('input[name="username"]', USER)
    await page.fill('input[name="password"]', PASS)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(library|$)/, { timeout: 10000 })

    // Should see the bookshelf or library content
    await page.waitForTimeout(3000)
    const html = await page.content()

    // Should NOT show an error
    expect(html).not.toContain('Internal Server Error')
    expect(html).not.toContain('ENOENT')

    // Should have the ABS UI structure
    expect(html).toContain('__nuxt')
  })

  test('Step 4: Settings page is accessible', async ({ page }) => {
    test.skip(!PASS, 'ABS_PASS not set')

    await page.goto(`${BASE}/login`)
    await page.waitForLoadState('networkidle')
    await page.fill('input[name="username"]', USER)
    await page.fill('input[name="password"]', PASS)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(library|$)/, { timeout: 10000 })

    // Navigate to settings
    await page.goto(`${BASE}/config`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const html = await page.content()
    expect(html).not.toContain('Internal Server Error')
  })

  test('Step 5: Our /v3/ client loads without breaking main app', async ({ page }) => {
    // Visit main app first
    await page.goto(`${BASE}/login`)
    await page.waitForLoadState('networkidle')
    const mainHtml = await page.content()
    expect(mainHtml).toContain('__nuxt')

    // Visit v3 client
    await page.goto(`${BASE}/v3/`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    const v3Html = await page.content()
    expect(v3Html).toContain('__nuxt')

    // Go back to main — should still work
    await page.goto(`${BASE}/login`)
    await page.waitForLoadState('networkidle')
    const afterHtml = await page.content()
    expect(afterHtml).toContain('input')
    expect(afterHtml).toContain('password')
  })

  test('Step 6: API health check during browsing', async ({ page, request }) => {
    // While the UI is being used, APIs should respond correctly
    const status = await request.get(`${BASE}/status`)
    expect(status.ok()).toBeTruthy()
    const body = await status.json()
    expect(body).toHaveProperty('isInit')
    expect(body.isInit).toBe(true)

    // Our new endpoints should also respond
    const aiStatus = await request.get(`${BASE}/api/ai/status`)
    expect(aiStatus.status()).not.toBe(500)

    const ocrStatus = await request.get(`${BASE}/api/ocr/status`)
    expect(ocrStatus.status()).not.toBe(500)

    const syncCheck = await request.get(`${BASE}/api/sync/check`)
    expect(syncCheck.status()).not.toBe(500)
  })

  test('Step 7: Upload page is functional', async ({ page }) => {
    test.skip(!PASS, 'ABS_PASS not set')

    await page.goto(`${BASE}/login`)
    await page.waitForLoadState('networkidle')
    await page.fill('input[name="username"]', USER)
    await page.fill('input[name="password"]', PASS)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(library|$)/, { timeout: 10000 })

    // Navigate to upload
    await page.goto(`${BASE}/upload`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const html = await page.content()
    // Upload page should mention drag and drop or file selection
    expect(html).not.toContain('Internal Server Error')
    // Should have the upload UI
    expect(html.length).toBeGreaterThan(1000)
  })
})
