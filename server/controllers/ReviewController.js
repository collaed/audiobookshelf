const { Request, Response } = require('express')
const Logger = require('../Logger')
const ReviewManager = require('../managers/ReviewManager')

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 * @typedef {Request & RequestUserObject} RequestWithUser
 */

class ReviewController {
  constructor() {}

  /**
   * GET: /api/items/:id/reviews
   * Aggregate reviews from all sources for a library item's book
   */
  async getReviews(req, res) {
    const libraryItem = req.libraryItem
    if (!libraryItem?.media?.id) return res.sendStatus(404)

    try {
      const reviews = await ReviewManager.getReviews(libraryItem.media.id)
      res.json(reviews)
    } catch (err) {
      Logger.error(`[ReviewController] Error fetching reviews: ${err.message}`)
      res.status(500).json({ error: 'Failed to fetch reviews' })
    }
  }
}
module.exports = new ReviewController()
