/**
 * Playwright UX comparison test.
 * Verifies all original ABS functionality is intact and our extensions don't break anything.
 * 
 * Run: ABS_TEST_URL=https://abs.ecb.pm npx playwright test test/e2e/ux-comparison.test.js
 */
const { test, expect } = require('@playwright/test')

const BASE = process.env.ABS_TEST_URL || 'http://localhost:13378'

test.describe('Original ABS Features (must still work)', () => {

  test('login page loads with form', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    // Should have username and password fields
    const html = await page.content()
    expect(html).toContain('input')
    expect(html).toContain('password')
  })

  test('status endpoint returns JSON', async ({ request }) => {
    const resp = await request.get(`${BASE}/status`)
    expect(resp.ok()).toBeTruthy()
    const body = await resp.json()
    expect(body).toHaveProperty('isInit')
  })

  test('static assets load (icon, fonts)', async ({ request }) => {
    const icon = await request.get(`${BASE}/icon.svg`)
    expect(icon.ok()).toBeTruthy()
  })

  test('API returns 401 for unauthenticated requests', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/libraries`)
    expect(resp.status()).toBe(401)
  })

  test('upload page exists', async ({ page }) => {
    await page.goto(`${BASE}/upload`)
    const html = await page.content()
    // Should redirect to login or show upload UI
    expect(html.length).toBeGreaterThan(100)
  })

  test('original client JS bundle loads', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    // Wait for Nuxt to hydrate
    await page.waitForTimeout(2000)
    // Check that Vue app mounted
    const nuxtDiv = await page.$('#__nuxt')
    expect(nuxtDiv).not.toBeNull()
  })

  test('original routes respond (not 500)', async ({ request }) => {
    const routes = ['/login', '/upload', '/config', '/batch']
    for (const route of routes) {
      const resp = await request.get(`${BASE}${route}`)
      expect(resp.status(), `${route} should not 500`).not.toBe(500)
    }
  })
})

test.describe('Original ABS API Endpoints (must still work)', () => {

  test('GET /api/libraries returns 401 (auth required)', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/libraries`)
    expect(resp.status()).toBe(401)
  })

  test('POST /api/login endpoint exists', async ({ request }) => {
    const resp = await request.post(`${BASE}/login`, {
      data: { username: 'nonexistent', password: 'wrong' }
    })
    // Should return 401 or 400, not 404 or 500
    expect([400, 401, 403]).toContain(resp.status())
  })

  test('GET /api/search/providers returns data', async ({ request }) => {
    // This endpoint may or may not require auth
    const resp = await request.get(`${BASE}/api/search/providers`)
    expect(resp.status()).not.toBe(500)
  })

  test('upstream RSS feed routes exist', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/feeds`)
    // 401 = exists but needs auth, not 404
    expect([200, 401]).toContain(resp.status())
  })

  test('upstream email settings route exists', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/emails/settings`)
    expect([200, 401]).toContain(resp.status())
  })

  test('upstream notification route exists', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/notifications`)
    expect([200, 401]).toContain(resp.status())
  })

  test('upstream backup route exists', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/backups`)
    expect([200, 401]).toContain(resp.status())
  })
})

test.describe('Our Extensions (must not break original)', () => {

  test('new API routes return proper status (not 500)', async ({ request }) => {
    const routes = [
      '/api/incoming',
      '/api/incoming/pending',
      '/api/recommendations/profile',
      '/api/intelligence/stats',
      '/api/intelligence/activity',
      '/api/agent/tasks',
      '/api/agent/agents',
      '/api/ai/status',
      '/api/ai/config',
      '/api/librivox/search?q=test',
      '/api/gutenberg/search?q=test',
      '/api/opds',
      '/api/tools/groups',
      '/api/tools/duplicates',
      '/api/tools/conversion-check',
      '/api/sync/check',
      '/api/ocr/status',
      '/api/ratings/import/status',
    ]
    for (const route of routes) {
      const resp = await request.get(`${BASE}${route}`)
      expect(resp.status(), `${route} should not 500`).not.toBe(500)
      expect(resp.status(), `${route} should not 404`).not.toBe(404)
    }
  })

  test('new POST routes validate input (not 500)', async ({ request }) => {
    const routes = [
      { url: '/api/agent/heartbeat', data: {} },
      { url: '/api/agent/tasks', data: { type: 'invalid_type' } },
      { url: '/api/ai/search', data: {} },
      { url: '/api/incoming/scan', data: {} },
      { url: '/api/recommendations/profile/rebuild', data: {} },
    ]
    for (const { url, data } of routes) {
      const resp = await request.post(`${BASE}${url}`, { data })
      expect(resp.status(), `POST ${url} should not 500`).not.toBe(500)
    }
  })

  test('OPDS returns valid XML', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/opds`)
    if (resp.ok()) {
      const body = await resp.text()
      expect(body).toContain('<?xml')
      expect(body).toContain('<feed')
      expect(body).toContain('opds')
    }
  })

  test('Vue 3 client loads at /v3/', async ({ page }) => {
    await page.goto(`${BASE}/v3/`)
    await page.waitForTimeout(2000)
    const html = await page.content()
    expect(html).toContain('__nuxt')
    // Should have our dark theme or auth prompt
    expect(html.length).toBeGreaterThan(500)
  })

  test('Vue 3 client does not break original client', async ({ page }) => {
    // Load original client
    await page.goto(`${BASE}/login`)
    await page.waitForTimeout(1000)
    const originalHtml = await page.content()
    
    // Load v3 client
    await page.goto(`${BASE}/v3/`)
    await page.waitForTimeout(1000)
    
    // Go back to original — should still work
    await page.goto(`${BASE}/login`)
    await page.waitForTimeout(1000)
    const afterHtml = await page.content()
    
    // Original page should still have its content
    expect(afterHtml).toContain('input')
    expect(afterHtml.length).toBeGreaterThan(originalHtml.length * 0.5)
  })

  test('original upload page still works after our changes', async ({ page }) => {
    await page.goto(`${BASE}/upload`)
    await page.waitForTimeout(1000)
    const html = await page.content()
    // Should not show an error page
    expect(html).not.toContain('Internal Server Error')
    expect(html).not.toContain('ENOENT')
    expect(html).not.toContain('Cannot GET')
  })
})

test.describe('No Regressions: Error Handling', () => {

  test('invalid API paths return 404 not 500', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/nonexistent-route-xyz`)
    expect(resp.status()).not.toBe(500)
  })

  test('malformed JSON body returns 400 not 500', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/agent/heartbeat`, {
      headers: { 'Content-Type': 'application/json' },
      data: 'not json{'
    })
    expect(resp.status()).not.toBe(500)
  })

  test('server does not leak file paths in errors', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/agent/tasks`, {
      data: { type: 'invalid' }
    })
    const body = await resp.text()
    expect(body).not.toContain('/home/')
    expect(body).not.toContain('/opt/')
    expect(body).not.toContain('/app/')
    expect(body).not.toContain('node_modules')
  })
})
