const { test } = require('@playwright/test')
const BASE = process.env.ABS_TEST_URL || 'https://abs.ecb.pm'

test('01 login page', async ({ page }) => {
  await page.goto(`${BASE}/login`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'screenshots/01-login.png', fullPage: true })
})

test('02 v3 dashboard', async ({ page }) => {
  await page.goto(`${BASE}/v3/`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'screenshots/02-v3-dashboard.png', fullPage: true })
})

test('03 v3 library', async ({ page }) => {
  await page.goto(`${BASE}/v3/library`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'screenshots/03-v3-library.png', fullPage: true })
})

test('04 v3 discover', async ({ page }) => {
  await page.goto(`${BASE}/v3/discover`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'screenshots/04-v3-discover.png', fullPage: true })
})

test('05 v3 settings', async ({ page }) => {
  await page.goto(`${BASE}/v3/settings`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'screenshots/05-v3-settings.png', fullPage: true })
})

test('06 v3 intelligence', async ({ page }) => {
  await page.goto(`${BASE}/v3/intelligence`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'screenshots/06-v3-intelligence.png', fullPage: true })
})

test('07 v3 incoming', async ({ page }) => {
  await page.goto(`${BASE}/v3/incoming`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'screenshots/07-v3-incoming.png', fullPage: true })
})

test('08 v3 language', async ({ page }) => {
  await page.goto(`${BASE}/v3/language`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'screenshots/08-v3-language.png', fullPage: true })
})
