const { asyncHandler, friendlyError } = require('../utils/asyncHandler')
const { Request, Response } = require('express')
const Logger = require('../Logger')
const ScheduledFeedManager = require('../managers/ScheduledFeedManager')

class ScheduledFeedController {
  constructor() {}

  /** POST /api/items/:id/podcast-feed — create a drip-feed podcast from a book */
  async createFeed(req, res) {
    const libraryItem = req.libraryItem
    if (!libraryItem) return res.sendStatus(404)

    const { schedule, episodesPerRelease, startDate, releaseTime, slug } = req.body
    const serverAddress = `${req.protocol}://${req.get('host')}`

    try {
      const result = await ScheduledFeedManager.createScheduledFeed(
        req.user.id, libraryItem.id,
        { schedule, episodesPerRelease, startDate, releaseTime, slug, serverAddress }
      )
      res.json(result)
    } catch (err) {
      Logger.error(`[ScheduledFeedController] Error: ${err.message}`)
      res.status(400).json(friendlyError(err))
    }
  }

  /** GET /api/feeds/:id/schedule — get feed schedule details */
  async getFeedSchedule(req, res) {
    const result = await ScheduledFeedManager.getFeedSchedule(req.params.id)
    if (!result) return res.sendStatus(404)
    res.json(result)
  }
}
const _inst = new ScheduledFeedController()
_inst.createFeed = asyncHandler(_inst.createFeed.bind(_inst))
_inst.getFeedSchedule = asyncHandler(_inst.getFeedSchedule.bind(_inst))
module.exports = _inst
