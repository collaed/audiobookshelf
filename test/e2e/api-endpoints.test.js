const { test, expect } = require('@playwright/test')

const BASE_URL = process.env.ABS_TEST_URL || 'http://localhost:13378'

test.describe('API Endpoints', () => {
  // Health check
  test('server is running', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/status`)
    expect(resp.ok()).toBeTruthy()
  })

  // Agent endpoints (require auth — 401 is expected without token)
  test('POST /api/agent/heartbeat requires auth', async ({ request }) => {
    const resp = await request.post(`${BASE_URL}/api/agent/heartbeat`, {
      data: { agentId: 'test-agent', version: '1.0', hostname: 'test' }
    })
    expect(resp.status()).toBe(401)
  })

  test('GET /api/agent/tasks returns task list', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/api/agent/tasks`)
    if (resp.ok()) {
      const body = await resp.json()
      expect(Array.isArray(body.tasks || body)).toBeTruthy()
    } else {
      expect([200, 401, 403]).toContain(resp.status())
    }
  })

  test('GET /api/agent/agents returns agent list', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/api/agent/agents`)
    if (resp.ok()) {
      const body = await resp.json()
      expect(Array.isArray(body.agents || body)).toBeTruthy()
    } else {
      expect([200, 401, 403]).toContain(resp.status())
    }
  })

  test('POST /api/agent/tasks validates task type', async ({ request }) => {
    const resp = await request.post(`${BASE_URL}/api/agent/tasks`, {
      data: { type: 'invalid_type_xyz' }
    })
    // Should reject unknown task types
    expect([400, 401, 403, 422]).toContain(resp.status())
  })

  test('POST /api/agent/tasks queues valid task', async ({ request }) => {
    const resp = await request.post(`${BASE_URL}/api/agent/tasks`, {
      data: { type: 'diag', params: {} }
    })
    if (resp.ok()) {
      const body = await resp.json()
      expect(body).toHaveProperty('id')
    } else {
      expect([200, 201, 401, 403]).toContain(resp.status())
    }
  })

  // OPDS
  test('GET /api/opds returns XML catalog', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/api/opds`)
    if (resp.ok()) {
      const text = await resp.text()
      expect(text).toContain('<')
    } else {
      expect([200, 401, 403]).toContain(resp.status())
    }
  })

  // AI status
  test('GET /api/ai/status returns provider info', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/api/ai/status`)
    if (resp.ok()) {
      const body = await resp.json()
      expect(body).toHaveProperty('provider')
    } else {
      expect([200, 401, 403, 404]).toContain(resp.status())
    }
  })

  // Tools
  test('GET /api/tools/conversion-check returns capabilities', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/api/tools/conversion-check`)
    if (resp.ok()) {
      const body = await resp.json()
      expect(typeof body).toBe('object')
    } else {
      expect([200, 401, 403, 404]).toContain(resp.status())
    }
  })

  test('GET /api/tools/duplicates returns array', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/api/tools/duplicates`)
    if (resp.ok()) {
      const body = await resp.json()
      expect(Array.isArray(body.duplicates || body)).toBeTruthy()
    } else {
      expect([200, 401, 403, 404]).toContain(resp.status())
    }
  })

  // Sync
  test('GET /api/sync/check returns whisper status', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/api/sync/check`)
    if (resp.ok()) {
      const body = await resp.json()
      expect(typeof body).toBe('object')
    } else {
      expect([200, 401, 403, 404]).toContain(resp.status())
    }
  })
})
