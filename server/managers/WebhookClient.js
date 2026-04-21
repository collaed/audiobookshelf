const crypto = require('crypto')
const axios = require('axios').default
const Logger = require('../Logger')

/**
 * Webhook integration with L'Intello.
 * Receives events and triggers ABS actions.
 */
class WebhookClient {
  constructor() {
    this.secret = process.env.WEBHOOK_SECRET || 'abs_webhook_2026'
    this.intelloUrl = process.env.INTELLO_URL || 'http://intello:8000'
    this.intelloToken = process.env.INTELLO_TOKEN || ''
  }

  verifySignature(payload, signature) {
    const expected = crypto.createHmac('sha256', this.secret).update(JSON.stringify(payload)).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(signature || ''), Buffer.from(expected))
  }

  async handleWebhook(event, data) {
    Logger.info(`[WebhookClient] Received: ${event}`)
    switch (event) {
      case 'ocr.complete': {
        if (data.job_id && data.result_path) {
          Logger.info(`[WebhookClient] OCR complete for job ${data.job_id}`)
          // Could trigger re-index of the book
          const FtsManager = require('./FtsManager')
          if (data.bookId) await FtsManager.indexBook(data.bookId).catch(() => {})
        }
        break
      }
      case 'literary.analysis_complete': {
        Logger.info(`[WebhookClient] Literary analysis complete: ${data.project_id}`)
        break
      }
      case 'scheduler.task_complete': {
        Logger.info(`[WebhookClient] Scheduled task complete: ${data.task_id}`)
        break
      }
      default:
        Logger.debug(`[WebhookClient] Unknown event: ${event}`)
    }
    return { received: true, event }
  }

  async registerWithIntello(absUrl) {
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (this.intelloToken) headers['Authorization'] = `Bearer ${this.intelloToken}`
      await axios.post(`${this.intelloUrl}/api/webhooks`, {
        url: `${absUrl}/api/webhooks/intello`,
        events: ['ocr.complete', 'literary.analysis_complete', 'scheduler.task_complete'],
        secret: this.secret,
      }, { headers, timeout: 10000 })
      Logger.info(`[WebhookClient] Registered webhook with L'Intello`)
      return true
    } catch (err) {
      Logger.warn(`[WebhookClient] Failed to register: ${err.message}`)
      return false
    }
  }
}

module.exports = new WebhookClient()
