const { asyncHandler } = require('../utils/asyncHandler')
const { Request, Response } = require('express')
const Logger = require('../Logger')
const Database = require('../Database')

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 *
 * @typedef {Request & RequestUserObject} RequestWithUser
 */

class IntelligenceController {
  constructor() {}

  /**
   * GET: /api/intelligence/library/:id/quality
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getLibraryQuality(req, res) {
    const library = await Database.libraryModel.findByPk(req.params.id)
    if (!library) return res.sendStatus(404)

    const items = await Database.libraryItemModel.findAll({ where: { libraryId: req.params.id } })
    const issues = items.filter((i) => i.isMissing || i.isInvalid)
    res.json({
      totalItems: items.length,
      itemsWithIssues: issues.length,
      qualityScore: items.length ? Math.round(((items.length - issues.length) / items.length) * 100) : 100
    })
  }

  /**
   * GET: /api/intelligence/library/:id/series-gaps
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getSeriesGaps(req, res) {
    const library = await Database.libraryModel.findByPk(req.params.id)
    if (!library) return res.sendStatus(404)

    const series = await Database.seriesModel.findAll({
      include: [{ model: Database.bookSeriesModel, include: [{ model: Database.bookModel }] }]
    })

    const gaps = series
      .map((s) => {
        const sequences = (s.bookSeries || []).map((bs) => parseFloat(bs.sequence)).filter((n) => !isNaN(n)).sort((a, b) => a - b)
        const missing = []
        for (let i = 1; i < sequences.length; i++) {
          for (let n = sequences[i - 1] + 1; n < sequences[i]; n++) {
            missing.push(n)
          }
        }
        return missing.length ? { seriesId: s.id, seriesName: s.name, missing } : null
      })
      .filter(Boolean)

    res.json({ gaps })
  }

  /**
   * GET: /api/intelligence/library/:id/narrator-consistency
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getNarratorConsistency(req, res) {
    const library = await Database.libraryModel.findByPk(req.params.id)
    if (!library) return res.sendStatus(404)

    const series = await Database.seriesModel.findAll({
      include: [{ model: Database.bookSeriesModel, include: [{ model: Database.bookModel }] }]
    })

    const inconsistencies = series
      .map((s) => {
        const narrators = new Set()
        for (const bs of s.bookSeries || []) {
          if (bs.book?.narrators) {
            bs.book.narrators.forEach((n) => narrators.add(n))
          }
        }
        return narrators.size > 1 ? { seriesId: s.id, seriesName: s.name, narrators: [...narrators] } : null
      })
      .filter(Boolean)

    res.json({ inconsistencies })
  }

  /**
   * GET: /api/intelligence/stats
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getDurationStats(req, res) {
    const items = await Database.libraryItemModel.findAll()
    const durations = items.map((i) => i.media?.duration || 0).filter((d) => d > 0)
    const total = durations.reduce((sum, d) => sum + d, 0)
    res.json({
      totalItems: durations.length,
      totalDuration: total,
      avgDuration: durations.length ? total / durations.length : 0
    })
  }

  /**
   * GET: /api/intelligence/space-savers
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getSpaceSavers(req, res) {
    const items = await Database.libraryItemModel.findAll({ order: [['size', 'DESC']], limit: 50 })
    res.json({ items: items.map((i) => ({ id: i.id, title: i.media?.title, size: i.size })) })
  }

  /**
   * GET: /api/intelligence/activity
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getActivityFeed(req, res) {
    const limit = parseInt(req.query.limit) || 50
    const sessions = await Database.playbackSessionModel.findAll({ order: [['updatedAt', 'DESC']], limit })
    res.json({ activity: sessions })
  }

  /**
   * GET: /api/intelligence/compare/:userId
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async compareTastes(req, res) {
    const targetUser = await Database.userModel.findByPk(req.params.userId)
    if (!targetUser) return res.sendStatus(404)

    const [mySessions, theirSessions] = await Promise.all([
      Database.playbackSessionModel.findAll({ where: { userId: req.user.id } }),
      Database.playbackSessionModel.findAll({ where: { userId: req.params.userId } })
    ])

    const myItems = new Set(mySessions.map((s) => s.libraryItemId))
    const theirItems = new Set(theirSessions.map((s) => s.libraryItemId))
    const shared = [...myItems].filter((id) => theirItems.has(id))

    res.json({
      sharedItems: shared.length,
      yourTotal: myItems.size,
      theirTotal: theirItems.size,
      overlapPercent: myItems.size ? Math.round((shared.length / myItems.size) * 100) : 0
    })
  }

  /**
   * GET: /api/intelligence/community-recommendations
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getCommunityRecommendations(req, res) {
    const sessions = await Database.playbackSessionModel.findAll({
      attributes: ['libraryItemId', [Database.sequelize.fn('COUNT', Database.sequelize.col('id')), 'playCount']],
      group: ['libraryItemId'],
      order: [[Database.sequelize.literal('playCount'), 'DESC']],
      limit: 20
    })
    res.json({ recommendations: sessions })
  }
}
const _inst = new IntelligenceController()
_inst.getLibraryQuality = asyncHandler(_inst.getLibraryQuality.bind(_inst))
_inst.getSeriesGaps = asyncHandler(_inst.getSeriesGaps.bind(_inst))
_inst.getNarratorConsistency = asyncHandler(_inst.getNarratorConsistency.bind(_inst))
_inst.getDurationStats = asyncHandler(_inst.getDurationStats.bind(_inst))
_inst.getSpaceSavers = asyncHandler(_inst.getSpaceSavers.bind(_inst))
_inst.getActivityFeed = asyncHandler(_inst.getActivityFeed.bind(_inst))
_inst.compareTastes = asyncHandler(_inst.compareTastes.bind(_inst))
_inst.getCommunityRecommendations = asyncHandler(_inst.getCommunityRecommendations.bind(_inst))
module.exports = _inst
