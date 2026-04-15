const { asyncHandler, friendlyError } = require('../utils/asyncHandler')
const Logger = require('../Logger')
const ModernizeManager = require('../managers/ModernizeManager')

class ModernizeController {
  constructor() {}

  /**
   * POST /api/items/:id/modernize/preview
   * Modernize first chapter as preview
   */
  async preview(req, res) {
    const { style } = req.body || {}
    try {
      const result = await ModernizeManager.modernizeChapter(req.params.id, 0, { style })
      res.json(result)
    } catch (err) {
      Logger.error(`[Modernize] Preview error: ${err.message}`)
      res.status(400).json(friendlyError(err))
    }
  }

  /**
   * POST /api/items/:id/modernize
   * Modernize full book
   */
  async modernize(req, res) {
    const { style, chapters } = req.body || {}
    try {
      const result = await ModernizeManager.modernizeBook(req.params.id, { style, chapters })
      res.json(result)
    } catch (err) {
      Logger.error(`[Modernize] Modernize error: ${err.message}`)
      res.status(400).json(friendlyError(err))
    }
  }

  /**
   * GET /api/items/:id/modernize/versions
   * List existing modernized versions
   */
  async versions(req, res) {
    try {
      const versions = await ModernizeManager.getModernizedVersions(req.params.id)
      res.json({ versions })
    } catch (err) {
      Logger.error(`[Modernize] Versions error: ${err.message}`)
      res.status(400).json(friendlyError(err))
    }
  }
}

const _inst = new ModernizeController()
_inst.preview = asyncHandler(_inst.preview.bind(_inst))
_inst.modernize = asyncHandler(_inst.modernize.bind(_inst))
_inst.versions = asyncHandler(_inst.versions.bind(_inst))
module.exports = _inst
