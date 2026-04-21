const { asyncHandler } = require('../utils/asyncHandler')
const NotificationManager = require('../managers/NotificationManager')

class NotificationController {
  async status(req, res) { res.json({ available: NotificationManager.available }) }
  async test(req, res) {
    const results = await NotificationManager.send('🔔 Test notification from Audiobookshelf')
    res.json({ results })
  }
}
const _inst = new NotificationController()
_inst.status = asyncHandler(_inst.status.bind(_inst))
_inst.test = asyncHandler(_inst.test.bind(_inst))
module.exports = _inst
