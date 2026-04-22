const { asyncHandler, friendlyError } = require('../utils/asyncHandler')
const { Request, Response } = require('express')
const Logger = require('../Logger')
const RecommendationManager = require('../managers/RecommendationManager')

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 *
 * @typedef {Request & RequestUserObject} RequestWithUser
 */

const VALID_CATEGORIES = ['all', 'dna_match', 'authors_you_love', 'narrators_you_love', 'complete_series', 'hidden_gems', 'anti']

class RecommendationController {
  constructor() {}

  /**
   * GET: /api/recommendations/:category
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getRecommendations(req, res) {
    const { category } = req.params
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` })
    }
    const recommendations = await RecommendationManager.getRecommendations(req.user.id, category)
    res.json({ recommendations })
  }

  /**
   * GET: /api/recommendations/profile
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getProfile(req, res) {
    const profile = await RecommendationManager.getProfile(req.user.id)
    res.json({ profile })
  }

  /**
   * POST: /api/recommendations/profile/rebuild
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async rebuildProfile(req, res) {
    Logger.info(`[RecommendationController] Rebuilding profile for user ${req.user.id}`)
    await RecommendationManager.rebuildProfile(req.user.id)
    res.sendStatus(200)
  }

  /**
   * PATCH: /api/recommendations/profile/preferences
   * Body: { fluentLanguages, secondaryLanguages, includeEbooks, preferredFormat }
   */
  async updatePreferences(req, res) {
    const Database = require('../Database')
    const [profile] = await Database.listenerProfileModel.getOrCreateForUser(req.user.id)
    const { fluentLanguages, secondaryLanguages, includeEbooks, preferredFormat } = req.body

    if (fluentLanguages !== undefined) profile.fluentLanguages = fluentLanguages
    if (secondaryLanguages !== undefined) profile.secondaryLanguages = secondaryLanguages
    if (includeEbooks !== undefined) profile.includeEbooks = includeEbooks
    if (preferredFormat !== undefined) profile.preferredFormat = preferredFormat

    await profile.save()
    res.json({ profile })
  }
}
const _inst = new RecommendationController()
_inst.getRecommendations = asyncHandler(_inst.getRecommendations.bind(_inst))
_inst.getProfile = asyncHandler(_inst.getProfile.bind(_inst))
_inst.rebuildProfile = asyncHandler(_inst.rebuildProfile.bind(_inst))
_inst.updatePreferences = asyncHandler(_inst.updatePreferences.bind(_inst))
module.exports = _inst
