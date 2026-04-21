const { asyncHandler, friendlyError } = require('../utils/asyncHandler')
const WebhookClient = require('../managers/WebhookClient')
const Logger = require('../Logger')

class WebhookController {
  constructor() {}
  async receive(req, res) {
    const sig = req.headers['x-webhook-signature']
    if (sig) {
      try { if (!WebhookClient.verifySignature(req.body, sig)) return res.status(401).json({ error: 'Invalid signature' }) }
      catch { return res.status(401).json({ error: 'Signature verification failed' }) }
    }
    const { event, data } = req.body || {}
    if (!event) return res.status(400).json({ error: 'event required' })
    const result = await WebhookClient.handleWebhook(event, data || {})
    res.json(result)
  }
  async register(req, res) {
    const absUrl = `${req.protocol}://${req.get('host')}`
    const ok = await WebhookClient.registerWithIntello(absUrl)
    res.json({ registered: ok })
  }
}
const _inst = new WebhookController()
_inst.receive = asyncHandler(_inst.receive.bind(_inst))
_inst.register = asyncHandler(_inst.register.bind(_inst))
module.exports = _inst
