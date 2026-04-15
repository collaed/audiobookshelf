const { asyncHandler } = require('../utils/asyncHandler')
const { Request, Response } = require('express')
const Logger = require('../Logger')
const AutoTagManager = require('../managers/AutoTagManager')

class AutoTagController {
  constructor() {}

  /** POST /api/items/:id/auto-tag — generate tags for a single book */
  async tagItem(req, res) {
    const book = req.libraryItem?.media
    if (!book) return res.sendStatus(404)
    try {
      const tags = await AutoTagManager.generateTags(book.id)
      res.json(tags)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  }

  /** POST /api/items/:id/auto-tag/apply — generate and apply tags */
  async tagAndApply(req, res) {
    const book = req.libraryItem?.media
    if (!book) return res.sendStatus(404)
    try {
      const tags = await AutoTagManager.generateTags(book.id)
      if (tags.error) return res.status(400).json(tags)
      const result = await AutoTagManager.applyTags(book.id, tags)
      res.json({ tags, ...result })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  }

  /** POST /api/libraries/:id/auto-tag — batch tag untagged books */
  async tagLibrary(req, res) {
    const limit = parseInt(req.query.limit) || 50
    try {
      const result = await AutoTagManager.autoTagLibrary(req.params.id, { limit })
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  }
}
const _inst = new AutoTagController()
_inst.tagItem = asyncHandler(_inst.tagItem.bind(_inst))
_inst.tagAndApply = asyncHandler(_inst.tagAndApply.bind(_inst))
_inst.tagLibrary = asyncHandler(_inst.tagLibrary.bind(_inst))
module.exports = _inst
