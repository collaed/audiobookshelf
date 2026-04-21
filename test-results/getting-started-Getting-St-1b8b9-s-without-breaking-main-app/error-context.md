# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: getting-started.test.js >> Getting Started Guide — Full User Flow >> Step 5: Our /v3/ client loads without breaking main app
- Location: test/e2e/getting-started.test.js:105:3

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "__nuxt"
Received string:    "<!DOCTYPE html><html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">
<title>ECB Login</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center}
.box{background:#1e293b;padding:2rem;border-radius:12px;width:100%;max-width:380px}h1{font-size:1.4rem;margin-bottom:1.5rem;text-align:center}
input{width:100%;padding:.7rem;margin:.3rem 0 .8rem;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:1rem}
button{width:100%;padding:.7rem;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:1rem;cursor:pointer}
button:hover{background:#2563eb}.err{color:#fca5a5;text-align:center;margin-bottom:1rem}</style></head>
<body><div class=\"box\"><h1>🔐 ECB Tools</h1>
<form method=\"POST\"><input type=\"hidden\" name=\"rd\" value=\"https://abs.ecb.pm/v3/\">
<input name=\"user\" placeholder=\"Identifiant\" required=\"\" autofocus=\"\">
<input name=\"pass\" type=\"password\" placeholder=\"Mot de passe\" required=\"\">
<button type=\"submit\">Connexion</button></form></div></body></html>"
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - heading "🔐 ECB Tools" [level=1] [ref=e3]
  - generic [ref=e4]:
    - textbox "Identifiant" [active] [ref=e5]
    - textbox "Mot de passe" [ref=e6]
    - button "Connexion" [ref=e7] [cursor=pointer]
```

# Test source

```ts
  17  |  */
  18  | const { test, expect } = require('@playwright/test')
  19  | 
  20  | const BASE = process.env.ABS_TEST_URL || 'http://localhost:13378'
  21  | const USER = process.env.ABS_USER || 'ecb'
  22  | const PASS = process.env.ABS_PASS || ''
  23  | 
  24  | test.describe('Getting Started Guide — Full User Flow', () => {
  25  | 
  26  |   test('Step 1: Login page loads correctly', async ({ page }) => {
  27  |     await page.goto(`${BASE}/login`)
  28  |     await page.waitForLoadState('networkidle')
  29  | 
  30  |     // Should see the ABS logo and login form
  31  |     const logo = page.locator('img[alt*="Audiobookshelf"]')
  32  |     await expect(logo).toBeVisible({ timeout: 10000 })
  33  | 
  34  |     // Should have username and password inputs
  35  |     const usernameInput = page.locator('input[name="username"]')
  36  |     const passwordInput = page.locator('input[name="password"]')
  37  |     await expect(usernameInput).toBeVisible()
  38  |     await expect(passwordInput).toBeVisible()
  39  | 
  40  |     // Should have a submit button
  41  |     const submitBtn = page.locator('button[type="submit"]')
  42  |     await expect(submitBtn).toBeVisible()
  43  |   })
  44  | 
  45  |   test('Step 2: Can log in successfully', async ({ page }) => {
  46  |     test.skip(!PASS, 'ABS_PASS not set — skipping login test')
  47  | 
  48  |     await page.goto(`${BASE}/login`)
  49  |     await page.waitForLoadState('networkidle')
  50  | 
  51  |     await page.fill('input[name="username"]', USER)
  52  |     await page.fill('input[name="password"]', PASS)
  53  |     await page.click('button[type="submit"]')
  54  | 
  55  |     // Should redirect to library or home page
  56  |     await page.waitForURL(/\/(library|$)/, { timeout: 10000 })
  57  | 
  58  |     // Should see the app bar / navigation
  59  |     const appContent = page.locator('#app-content, #__nuxt')
  60  |     await expect(appContent).toBeVisible()
  61  |   })
  62  | 
  63  |   test('Step 3: Library view loads after login', async ({ page }) => {
  64  |     test.skip(!PASS, 'ABS_PASS not set')
  65  | 
  66  |     // Login first
  67  |     await page.goto(`${BASE}/login`)
  68  |     await page.waitForLoadState('networkidle')
  69  |     await page.fill('input[name="username"]', USER)
  70  |     await page.fill('input[name="password"]', PASS)
  71  |     await page.click('button[type="submit"]')
  72  |     await page.waitForURL(/\/(library|$)/, { timeout: 10000 })
  73  | 
  74  |     // Should see the bookshelf or library content
  75  |     await page.waitForTimeout(3000)
  76  |     const html = await page.content()
  77  | 
  78  |     // Should NOT show an error
  79  |     expect(html).not.toContain('Internal Server Error')
  80  |     expect(html).not.toContain('ENOENT')
  81  | 
  82  |     // Should have the ABS UI structure
  83  |     expect(html).toContain('__nuxt')
  84  |   })
  85  | 
  86  |   test('Step 4: Settings page is accessible', async ({ page }) => {
  87  |     test.skip(!PASS, 'ABS_PASS not set')
  88  | 
  89  |     await page.goto(`${BASE}/login`)
  90  |     await page.waitForLoadState('networkidle')
  91  |     await page.fill('input[name="username"]', USER)
  92  |     await page.fill('input[name="password"]', PASS)
  93  |     await page.click('button[type="submit"]')
  94  |     await page.waitForURL(/\/(library|$)/, { timeout: 10000 })
  95  | 
  96  |     // Navigate to settings
  97  |     await page.goto(`${BASE}/config`)
  98  |     await page.waitForLoadState('networkidle')
  99  |     await page.waitForTimeout(2000)
  100 | 
  101 |     const html = await page.content()
  102 |     expect(html).not.toContain('Internal Server Error')
  103 |   })
  104 | 
  105 |   test('Step 5: Our /v3/ client loads without breaking main app', async ({ page }) => {
  106 |     // Visit main app first
  107 |     await page.goto(`${BASE}/login`)
  108 |     await page.waitForLoadState('networkidle')
  109 |     const mainHtml = await page.content()
  110 |     expect(mainHtml).toContain('__nuxt')
  111 | 
  112 |     // Visit v3 client
  113 |     await page.goto(`${BASE}/v3/`)
  114 |     await page.waitForLoadState('networkidle')
  115 |     await page.waitForTimeout(2000)
  116 |     const v3Html = await page.content()
> 117 |     expect(v3Html).toContain('__nuxt')
      |                    ^ Error: expect(received).toContain(expected) // indexOf
  118 | 
  119 |     // Go back to main — should still work
  120 |     await page.goto(`${BASE}/login`)
  121 |     await page.waitForLoadState('networkidle')
  122 |     const afterHtml = await page.content()
  123 |     expect(afterHtml).toContain('input')
  124 |     expect(afterHtml).toContain('password')
  125 |   })
  126 | 
  127 |   test('Step 6: API health check during browsing', async ({ page, request }) => {
  128 |     // While the UI is being used, APIs should respond correctly
  129 |     const status = await request.get(`${BASE}/status`)
  130 |     expect(status.ok()).toBeTruthy()
  131 |     const body = await status.json()
  132 |     expect(body).toHaveProperty('isInit')
  133 |     expect(body.isInit).toBe(true)
  134 | 
  135 |     // Our new endpoints should also respond
  136 |     const aiStatus = await request.get(`${BASE}/api/ai/status`)
  137 |     expect(aiStatus.status()).not.toBe(500)
  138 | 
  139 |     const ocrStatus = await request.get(`${BASE}/api/ocr/status`)
  140 |     expect(ocrStatus.status()).not.toBe(500)
  141 | 
  142 |     const syncCheck = await request.get(`${BASE}/api/sync/check`)
  143 |     expect(syncCheck.status()).not.toBe(500)
  144 |   })
  145 | 
  146 |   test('Step 7: Upload page is functional', async ({ page }) => {
  147 |     test.skip(!PASS, 'ABS_PASS not set')
  148 | 
  149 |     await page.goto(`${BASE}/login`)
  150 |     await page.waitForLoadState('networkidle')
  151 |     await page.fill('input[name="username"]', USER)
  152 |     await page.fill('input[name="password"]', PASS)
  153 |     await page.click('button[type="submit"]')
  154 |     await page.waitForURL(/\/(library|$)/, { timeout: 10000 })
  155 | 
  156 |     // Navigate to upload
  157 |     await page.goto(`${BASE}/upload`)
  158 |     await page.waitForLoadState('networkidle')
  159 |     await page.waitForTimeout(2000)
  160 | 
  161 |     const html = await page.content()
  162 |     // Upload page should mention drag and drop or file selection
  163 |     expect(html).not.toContain('Internal Server Error')
  164 |     // Should have the upload UI
  165 |     expect(html.length).toBeGreaterThan(1000)
  166 |   })
  167 | })
  168 | 
```