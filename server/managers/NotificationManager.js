const axios = require('axios').default
const Logger = require('../Logger')

/**
 * Notifications — Signal, Gotify, or webhook.
 * Inspired by BrainyCat's Signal integration.
 */
class NotificationManager {
  constructor() {
    this.signalUrl = process.env.SIGNAL_API_URL || ''
    this.signalRecipient = process.env.SIGNAL_RECIPIENT || ''
    this.gotifyUrl = process.env.GOTIFY_URL || ''
    this.gotifyToken = process.env.GOTIFY_TOKEN || ''
  }

  get available() {
    return !!(this.signalUrl || this.gotifyUrl)
  }

  async send(message, title = 'Audiobookshelf') {
    const results = []
    if (this.signalUrl) {
      try {
        await axios.post(`${this.signalUrl}/v2/send`, {
          message, number: this.signalRecipient, recipients: this.signalRecipient ? [this.signalRecipient] : []
        }, { timeout: 10000 })
        results.push({ backend: 'signal', ok: true })
      } catch (err) { results.push({ backend: 'signal', ok: false, error: err.message }) }
    }
    if (this.gotifyUrl && this.gotifyToken) {
      try {
        await axios.post(`${this.gotifyUrl}/message?token=${this.gotifyToken}`, {
          title, message, priority: 5
        }, { timeout: 10000 })
        results.push({ backend: 'gotify', ok: true })
      } catch (err) { results.push({ backend: 'gotify', ok: false, error: err.message }) }
    }
    return results
  }

  async notifyBookAdded(title) { return this.send(`📚 New book added: ${title}`) }
  async notifyJobComplete(jobType, title) { return this.send(`✅ ${jobType} complete: ${title}`) }
  async notifyError(context, error) { return this.send(`❌ Error in ${context}: ${error}`) }
}

module.exports = new NotificationManager()
