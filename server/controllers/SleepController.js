const { asyncHandler } = require('../utils/asyncHandler')
const Database = require('../Database')
const Logger = require('../Logger')

/**
 * Sleep detection endpoints — stores sleep events from mobile app's StayAwakeManager
 * and provides rewind suggestions on next session.
 */
class SleepController {
  /** POST /api/sleep/report — mobile app reports a sleep detection event */
  async report(req, res) {
    const { bookId, position, missedChecks, detectedAt } = req.body || {}
    if (!bookId || position == null) return res.status(400).json({ error: 'bookId and position required' })

    // Store as a bookmark-style annotation
    const rewindTo = Math.max(0, position - 120000) // 2 min before sleep point (ms)
    Logger.info(`[Sleep] User ${req.user.id} fell asleep at ${position}ms in ${bookId}, rewind to ${rewindTo}ms`)

    // Store in user's media progress metadata
    const progress = await Database.mediaProgressModel.findOne({
      where: { userId: req.user.id, mediaItemId: bookId }
    })
    if (progress) {
      const extra = progress.extraData ? JSON.parse(progress.extraData) : {}
      extra.lastSleepEvent = { position, rewindTo, missedChecks, detectedAt: detectedAt || Date.now() }
      await progress.update({ extraData: JSON.stringify(extra) })
    }

    res.json({ stored: true, rewindTo, rewindToSec: Math.round(rewindTo / 1000) })
  }

  /** GET /api/sleep/rewind/:bookId — get rewind suggestion for a book */
  async rewind(req, res) {
    const progress = await Database.mediaProgressModel.findOne({
      where: { userId: req.user.id, mediaItemId: req.params.bookId }
    })
    if (!progress?.extraData) return res.json({ hasSuggestion: false })

    const extra = JSON.parse(progress.extraData)
    if (!extra.lastSleepEvent) return res.json({ hasSuggestion: false })

    const evt = extra.lastSleepEvent
    const sleepAge = Date.now() - (evt.detectedAt || 0)
    // Only suggest rewind if sleep was within last 24 hours
    if (sleepAge > 24 * 60 * 60 * 1000) return res.json({ hasSuggestion: false })

    res.json({
      hasSuggestion: true,
      sleepPosition: evt.position,
      rewindTo: evt.rewindTo,
      message: `You fell asleep — rewind to ${Math.floor(evt.rewindTo / 60000)}:${String(Math.floor((evt.rewindTo % 60000) / 1000)).padStart(2, '0')}?`
    })
  }
}

const _inst = new SleepController()
_inst.report = asyncHandler(_inst.report.bind(_inst))
_inst.rewind = asyncHandler(_inst.rewind.bind(_inst))
module.exports = _inst
