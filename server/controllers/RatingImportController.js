const { asyncHandler, friendlyError } = require('../utils/asyncHandler')
const { Request, Response } = require('express')
const Logger = require('../Logger')
const RatingImportManager = require('../managers/RatingImportManager')

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 *
 * @typedef {Request & RequestUserObject} RequestWithUser
 */

class RatingImportController {
  constructor() {}

  /**
   * POST: /api/ratings/import/goodreads
   * Multipart file upload of Goodreads CSV
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async importGoodreads(req, res) {
    if (!req.files?.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' })
    }

    const csvContent = req.files.file.data.toString('utf-8')
    Logger.info(`[RatingImportController] Goodreads CSV import for user ${req.user.id}`)
    const result = await RatingImportManager.importGoodreadsCsv(req.user.id, csvContent)
    res.json(result)
  }

  /**
   * POST: /api/ratings/import/openlibrary
   * Body: { username }
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async importOpenLibrary(req, res) {
    const { username } = req.body
    if (!username) {
      return res.status(400).json({ error: 'OpenLibrary username is required' })
    }

    Logger.info(`[RatingImportController] OpenLibrary import for user ${req.user.id}, OL user: ${username}`)
    const result = await RatingImportManager.importOpenLibraryRatings(req.user.id, username)
    res.json(result)
  }

  /**
   * GET: /api/ratings/import/status
   * Returns last import stats
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getImportStatus(req, res) {
    res.json({ status: RatingImportManager.lastImportStatus })
  }
}

const _inst = new RatingImportController()
_inst.importGoodreads = asyncHandler(_inst.importGoodreads.bind(_inst))
_inst.importOpenLibrary = asyncHandler(_inst.importOpenLibrary.bind(_inst))
_inst.getImportStatus = asyncHandler(_inst.getImportStatus.bind(_inst))
module.exports = _inst
