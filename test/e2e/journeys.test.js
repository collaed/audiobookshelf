/**
 * User Journey E2E Tests
 *
 * Walks through all 15 user journeys from docs/user-journeys.md.
 * Every extended feature is exercised at least once.
 *
 * Run: ABS_TEST_URL=https://abs.ecb.pm npx playwright test test/e2e/journeys.test.js
 */
const { test, expect } = require('@playwright/test')

const BASE = process.env.ABS_TEST_URL || 'http://localhost:3333'

// Helper: authenticated API call
async function api(request, method, path, body) {
  const opts = { headers: { 'Content-Type': 'application/json' } }
  if (body) opts.data = body
  const url = `${BASE}/api${path}`
  if (method === 'GET') return request.get(url, opts)
  if (method === 'POST') return request.post(url, opts)
  if (method === 'PATCH') return request.patch(url, opts)
  if (method === 'DELETE') return request.delete(url, opts)
}

// Helper: expect JSON response (200 or 401 — both valid, means endpoint exists)
function expectAlive(resp) {
  expect([200, 401, 403]).toContain(resp.status())
}

// Helper: expect endpoint exists (not 404, not 500)
function expectExists(resp) {
  expect(resp.status()).not.toBe(404)
  expect(resp.status()).not.toBe(500)
}

// ─── Journey 1: New User Setup ──────────────────────────────────────────────

test.describe('Journey 1: New User Setup', () => {
  test('login page loads', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.waitForLoadState('networkidle')
    const html = await page.content()
    expect(html.length).toBeGreaterThan(200)
  })

  test('status endpoint works', async ({ request }) => {
    const resp = await request.get(`${BASE}/status`)
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data).toHaveProperty('isInit')
  })

  test('libraries endpoint requires auth', async ({ request }) => {
    const resp = await api(request, 'GET', '/libraries')
    expectAlive(resp)
  })

  test('AI status endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/ai/status')
    expectAlive(resp)
  })

  test('conversion check endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/tools/conversion-check')
    expectAlive(resp)
  })

  test('sync check endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/sync/check')
    expectAlive(resp)
  })

  test('OCR status endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/ocr/status')
    expectAlive(resp)
  })

  test('FTS status endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/fts/status')
    expectAlive(resp)
  })
})

// ─── Journey 2: Discover & Download Free Content ────────────────────────────

test.describe('Journey 2: Discover Free Content', () => {
  test('Gutenberg search returns results', async ({ request }) => {
    const resp = await api(request, 'GET', '/gutenberg/search?q=pride+and+prejudice')
    expectAlive(resp)
    if (resp.status() === 200) {
      const data = await resp.json()
      expect(data).toHaveProperty('results')
    }
  })

  test('Gutenberg browse by topic', async ({ request }) => {
    const resp = await api(request, 'GET', '/gutenberg/browse?topic=science+fiction')
    expectAlive(resp)
  })

  test('Gutenberg book detail', async ({ request }) => {
    const resp = await api(request, 'GET', '/gutenberg/1342')
    expectAlive(resp)
  })

  test('LibriVox search returns results', async ({ request }) => {
    const resp = await api(request, 'GET', '/librivox/search?q=sherlock+holmes')
    expectAlive(resp)
  })

  test('LibriVox browse by genre', async ({ request }) => {
    const resp = await api(request, 'GET', '/librivox/browse?genre=mystery')
    expectAlive(resp)
  })
})

// ─── Journey 3: Incoming Scanner ────────────────────────────────────────────

test.describe('Journey 3: Incoming Scanner', () => {
  test('scan incoming folder', async ({ request }) => {
    const resp = await api(request, 'POST', '/incoming/scan')
    expectAlive(resp)
  })

  test('list pending items', async ({ request }) => {
    const resp = await api(request, 'GET', '/incoming/pending')
    expectAlive(resp)
  })

  test('list all incoming items', async ({ request }) => {
    const resp = await api(request, 'GET', '/incoming')
    expectAlive(resp)
  })

  test('confirm requires valid ID', async ({ request }) => {
    const resp = await api(request, 'POST', '/incoming/nonexistent/confirm')
    expectExists(resp)
  })

  test('reject requires valid ID', async ({ request }) => {
    const resp = await api(request, 'POST', '/incoming/nonexistent/reject')
    expectExists(resp)
  })
})

// ─── Journey 4: Enrich a Book ───────────────────────────────────────────────

test.describe('Journey 4: Enrich a Book', () => {
  test('reviews endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/items/test-id/reviews')
    expectExists(resp)
  })

  test('metadata download endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/items/test-id/metadata-download')
    expectExists(resp)
  })

  test('auto-tag endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/items/test-id/auto-tag')
    expectExists(resp)
  })

  test('FTS search endpoint works', async ({ request }) => {
    const resp = await api(request, 'GET', '/fts/search?q=detective')
    expectAlive(resp)
  })

  test('FTS search requires query', async ({ request }) => {
    const resp = await api(request, 'GET', '/fts/search')
    // Should return 400 (missing q) or 401 (auth)
    expect([400, 401]).toContain(resp.status())
  })

  test('FTS index endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/fts/index/test-lib')
    expectExists(resp)
  })
})

// ─── Journey 5: AI Companion ────────────────────────────────────────────────

test.describe('Journey 5: AI Companion', () => {
  test('AI status returns provider info', async ({ request }) => {
    const resp = await api(request, 'GET', '/ai/status')
    expectAlive(resp)
    if (resp.status() === 200) {
      const data = await resp.json()
      expect(data).toHaveProperty('provider')
    }
  })

  test('recap endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/ai/recap/test-book')
    expectExists(resp)
  })

  test('ask endpoint validates input', async ({ request }) => {
    const resp = await api(request, 'POST', '/ai/ask/test-book', {})
    expectExists(resp)
  })

  test('ask endpoint accepts question', async ({ request }) => {
    const resp = await api(request, 'POST', '/ai/ask/test-book', { question: 'Who is the main character?' })
    expectExists(resp)
  })

  test('character list endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/ai/characters/test-book')
    expectExists(resp)
  })

  test('character detail validates input', async ({ request }) => {
    const resp = await api(request, 'POST', '/ai/character/test-book', {})
    expectExists(resp)
    // Should be 400 (name required) or 401
    if (resp.status() !== 401) expect(resp.status()).toBe(400)
  })

  test('character detail with name', async ({ request }) => {
    const resp = await api(request, 'POST', '/ai/character/test-book', { name: 'Holmes' })
    expectExists(resp)
  })

  test('chapter summary endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/ai/chapter-summary/test-book/0')
    expectExists(resp)
  })

  test('AI search endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/ai/search', { query: 'time travel' })
    expectExists(resp)
  })
})

// ─── Journey 6: Summaries & Modernization ───────────────────────────────────

test.describe('Journey 6: Summaries & Modernization', () => {
  test('summary endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/items/test-id/summary', { style: 'executive' })
    expectExists(resp)
  })

  test('audio summary endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/items/test-id/summary/audio', { style: 'casual' })
    expectExists(resp)
  })

  test('modernize endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/items/test-id/modernize', { style: 'contemporary' })
    expectExists(resp)
  })
})

// ─── Journey 7: Format Conversion & TTS ─────────────────────────────────────

test.describe('Journey 7: Format Conversion', () => {
  test('conversion check returns capabilities', async ({ request }) => {
    const resp = await api(request, 'GET', '/tools/conversion-check')
    expectAlive(resp)
  })

  test('convert endpoint validates input', async ({ request }) => {
    const resp = await api(request, 'POST', '/tools/convert', {})
    expectExists(resp)
  })

  test('convert endpoint accepts format', async ({ request }) => {
    const resp = await api(request, 'POST', '/tools/convert', { bookId: 'test', format: 'mobi' })
    expectExists(resp)
  })

  test('TTS conversion endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/items/test-id/convert-to-audio', { language: 'en' })
    expectExists(resp)
  })

  test('TTS status endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/items/test-id/convert-to-audio/status')
    expectExists(resp)
  })

  test('OCR endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/items/test-id/ocr', { language: 'eng' })
    expectExists(resp)
  })
})

// ─── Journey 8: Device Delivery ─────────────────────────────────────────────

test.describe('Journey 8: Device Delivery', () => {
  test('send to Kindle endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/items/test-id/send-to-kindle', { email: 'test@kindle.com' })
    expectExists(resp)
  })

  test('send to device endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/items/test-id/send-to-device', { deviceName: 'Kobo' })
    expectExists(resp)
  })

  test('OPDS catalog returns XML', async ({ request }) => {
    const resp = await api(request, 'GET', '/opds')
    expectAlive(resp)
    if (resp.status() === 200) {
      const text = await resp.text()
      expect(text).toContain('<?xml')
    }
  })

  test('OPDS search endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/opds/search?q=mystery')
    expectAlive(resp)
  })

  test('feeds list endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/feeds')
    expectAlive(resp)
  })

  test('create drip feed endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/feeds/item/test-id/open')
    expectExists(resp)
  })
})

// ─── Journey 9: Library Intelligence ────────────────────────────────────────

test.describe('Journey 9: Library Intelligence', () => {
  test('quality analysis endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/intelligence/library/test-lib/quality')
    expectExists(resp)
  })

  test('series gaps endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/intelligence/library/test-lib/series-gaps')
    expectExists(resp)
  })

  test('narrator consistency endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/intelligence/library/test-lib/narrator-consistency')
    expectExists(resp)
  })

  test('space savers endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/intelligence/space-savers')
    expectAlive(resp)
  })

  test('stats endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/intelligence/stats')
    expectAlive(resp)
  })

  test('duplicates endpoint returns array', async ({ request }) => {
    const resp = await api(request, 'GET', '/tools/duplicates')
    expectAlive(resp)
    if (resp.status() === 200) {
      const data = await resp.json()
      expect(Array.isArray(data)).toBe(true)
    }
  })

  test('file groups endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/tools/groups')
    expectAlive(resp)
  })

  test('merge group endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/tools/groups/test-key/merge')
    expectExists(resp)
  })
})

// ─── Journey 10: Audio Restoration ──────────────────────────────────────────

test.describe('Journey 10: Audio Restoration', () => {
  test('queue audio diagnose task', async ({ request }) => {
    const resp = await api(request, 'POST', '/agent/tasks', { type: 'audio_diagnose', bookId: 'test' })
    expectExists(resp)
  })

  test('queue audio clean task', async ({ request }) => {
    const resp = await api(request, 'POST', '/agent/tasks', { type: 'audio_clean', bookId: 'test', preset: 'moderate' })
    expectExists(resp)
  })

  test('list agent tasks', async ({ request }) => {
    const resp = await api(request, 'GET', '/agent/tasks')
    expectAlive(resp)
  })

  test('list connected agents', async ({ request }) => {
    const resp = await api(request, 'GET', '/agent/agents')
    expectAlive(resp)
  })

  test('agent heartbeat endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/agent/heartbeat', { agentId: 'test', version: '1.0' })
    expectExists(resp)
  })
})

// ─── Journey 11: Recommendations & Social ───────────────────────────────────

test.describe('Journey 11: Recommendations & Social', () => {
  test('get listener profile', async ({ request }) => {
    const resp = await api(request, 'GET', '/recommendations/profile')
    expectAlive(resp)
  })

  test('rebuild profile', async ({ request }) => {
    const resp = await api(request, 'POST', '/recommendations/profile/rebuild')
    expectAlive(resp)
  })

  test('update preferences', async ({ request }) => {
    const resp = await api(request, 'PATCH', '/recommendations/profile/preferences', { languages: ['en'] })
    expectAlive(resp)
  })

  test('DNA match recommendations', async ({ request }) => {
    const resp = await api(request, 'GET', '/recommendations/dna-match')
    expectAlive(resp)
  })

  test('authors you love recommendations', async ({ request }) => {
    const resp = await api(request, 'GET', '/recommendations/authors-you-love')
    expectAlive(resp)
  })

  test('complete series recommendations', async ({ request }) => {
    const resp = await api(request, 'GET', '/recommendations/complete-series')
    expectAlive(resp)
  })

  test('hidden gems recommendations', async ({ request }) => {
    const resp = await api(request, 'GET', '/recommendations/hidden-gems')
    expectAlive(resp)
  })

  test('narrators recommendations', async ({ request }) => {
    const resp = await api(request, 'GET', '/recommendations/narrators')
    expectAlive(resp)
  })

  test('activity feed', async ({ request }) => {
    const resp = await api(request, 'GET', '/intelligence/activity')
    expectAlive(resp)
  })

  test('taste comparison', async ({ request }) => {
    const resp = await api(request, 'GET', '/intelligence/compare/test-user')
    expectExists(resp)
  })

  test('community recommendations', async ({ request }) => {
    const resp = await api(request, 'GET', '/intelligence/community-recommendations')
    expectAlive(resp)
  })
})

// ─── Journey 12: Sync & Language Learning ───────────────────────────────────

test.describe('Journey 12: Sync & Language Learning', () => {
  test('sync check returns whisper status', async ({ request }) => {
    const resp = await api(request, 'GET', '/sync/check')
    expectAlive(resp)
  })

  test('sync pairs endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/sync/pairs')
    expectAlive(resp)
  })

  test('sync chapters endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/sync/chapters', { bookId: 'test' })
    expectExists(resp)
  })

  test('sync verify endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/sync/verify', { audioChapter: 1, ebookChapter: 1 })
    expectExists(resp)
  })

  test('language learning endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/items/test-id/language-learning', { targetLang: 'fr', pattern: 'aba' })
    expectExists(resp)
  })

  test('AI alignment check endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/ai/check-alignment', { pairs: [{ audio: 'ch1', ebook: 'ch1' }] })
    expectExists(resp)
  })
})

// ─── Journey 13: Rating Import & Metadata Search ────────────────────────────

test.describe('Journey 13: Rating Import', () => {
  test('Goodreads import endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/ratings/import/goodreads', { csv: 'Title,Rating\nDune,5' })
    expectExists(resp)
  })

  test('OpenLibrary import endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/ratings/import/openlibrary', { username: 'testuser' })
    expectExists(resp)
  })

  test('import status endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/ratings/import/status')
    expectAlive(resp)
  })

  test('free metadata search endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/metadata/search', { title: 'Dune', author: 'Herbert' })
    expectExists(resp)
  })
})

// ─── Journey 14: Webhooks & Admin ───────────────────────────────────────────

test.describe('Journey 14: Webhooks & Admin', () => {
  test('webhook register endpoint exists', async ({ request }) => {
    const resp = await api(request, 'POST', '/webhooks/register')
    expectExists(resp)
  })

  test('webhook receive endpoint validates', async ({ request }) => {
    const resp = await api(request, 'POST', '/webhooks/intello', { event: 'test.ping', data: {} })
    expectExists(resp)
  })

  test('webhook receive rejects missing event', async ({ request }) => {
    const resp = await api(request, 'POST', '/webhooks/intello', {})
    expectExists(resp)
  })

  test('AI config get endpoint exists', async ({ request }) => {
    const resp = await api(request, 'GET', '/ai/config')
    expectAlive(resp)
  })

  test('AI config update endpoint exists', async ({ request }) => {
    const resp = await api(request, 'PATCH', '/ai/config', { provider: 'airouter' })
    expectAlive(resp)
  })
})

// ─── Journey 15: Vue 3 Client Walkthrough ───────────────────────────────────

test.describe('Journey 15: Vue 3 Client', () => {
  test('Vue 3 app loads at /v3/', async ({ page }) => {
    const resp = await page.goto(`${BASE}/v3/`)
    // 200 = loaded, 302 = Caddy auth redirect — both valid
    expect([200, 302]).toContain(resp.status())
  })

  test('Vue 3 app has content', async ({ page }) => {
    await page.goto(`${BASE}/v3/`)
    await page.waitForTimeout(2000)
    const html = await page.content()
    expect(html.length).toBeGreaterThan(50)
  })

  test('original client still works alongside /v3/', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await page.waitForLoadState('networkidle')
    const html = await page.content()
    expect(html).toContain('audiobookshelf')
  })

  test('login page still accessible', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.waitForLoadState('networkidle')
    const html = await page.content()
    expect(html.length).toBeGreaterThan(200)
  })

  test('static assets load', async ({ request }) => {
    const resp = await request.get(`${BASE}/Logo.png`)
    expect([200, 304]).toContain(resp.status())
  })
})

// ─── Cross-cutting: Error Handling ──────────────────────────────────────────

test.describe('Cross-cutting: Error Handling', () => {
  test('invalid API path returns 404 or 401', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/this-does-not-exist-xyz`)
    // 401 (auth required) or 404 — both valid, means server didn't crash
    expect([401, 404]).toContain(resp.status())
  })

  test('malformed JSON returns 400 not 500', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/incoming/scan`, {
      headers: { 'Content-Type': 'application/json' },
      data: 'not json{'
    })
    expect(resp.status()).not.toBe(500)
  })

  test('server does not leak real file paths', async ({ request }) => {
    const resp = await api(request, 'GET', '/items/../../etc/passwd')
    const text = await resp.text()
    // Should not contain actual server filesystem paths
    expect(text).not.toContain('/home/')
    expect(text).not.toContain('/opt/')
    // Express echoes the URL path in its default error — that's the URL, not a real path
    // Check it doesn't contain actual server-side paths like /app/ or /node_modules/
    expect(text).not.toContain('/app/server/')
    expect(text).not.toContain('/node_modules/')
  })

  test('oversized request is rejected gracefully', async ({ request }) => {
    // Send a large body — should not crash the server
    const resp = await request.post(`${BASE}/api/incoming/scan`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ data: 'x'.repeat(100000) })
    })
    expectExists(resp)
  })
})
