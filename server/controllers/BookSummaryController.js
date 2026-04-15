const { asyncHandler, friendlyError } = require('../utils/asyncHandler')
const Logger = require('../Logger')
const BookSummaryManager = require('../managers/BookSummaryManager')

class BookSummaryController {
  constructor() {}

  /**
   * POST /api/items/:id/summary
   * Generate a text summary
   */
  async generate(req, res) {
    const { style, length, language } = req.body || {}
    try {
      const result = await BookSummaryManager.generateSummary(req.params.id, { style, length, language })
      res.json(result)
    } catch (err) {
      Logger.error(`[BookSummary] Generate error: ${err.message}`)
      res.status(400).json(friendlyError(err))
    }
  }

  /**
   * POST /api/items/:id/summary/audio
   * Generate an audio summary
   */
  async audio(req, res) {
    const { style, length, language } = req.body || {}
    try {
      const result = await BookSummaryManager.generateAudioSummary(req.params.id, { style, length, language })
      res.json(result)
    } catch (err) {
      Logger.error(`[BookSummary] Audio error: ${err.message}`)
      res.status(400).json(friendlyError(err))
    }
  }

  /**
   * GET /api/items/:id/summary/versions
   * List existing summaries
   */
  async versions(req, res) {
    try {
      const versions = await BookSummaryManager.getSummaries(req.params.id)
      res.json({ versions })
    } catch (err) {
      Logger.error(`[BookSummary] Versions error: ${err.message}`)
      res.status(400).json(friendlyError(err))
    }
  }
}

const _inst = new BookSummaryController()
_inst.generate = asyncHandler(_inst.generate.bind(_inst))
_inst.audio = asyncHandler(_inst.audio.bind(_inst))
_inst.versions = asyncHandler(_inst.versions.bind(_inst))
module.exports = _inst
