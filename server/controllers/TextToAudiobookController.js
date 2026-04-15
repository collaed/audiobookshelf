const { asyncHandler, friendlyError } = require('../utils/asyncHandler')
const { Request, Response } = require('express')
const Logger = require('../Logger')
const TextToAudiobookManager = require('../managers/TextToAudiobookManager')

class TextToAudiobookController {
  constructor() {}

  /** POST /api/items/:id/convert-to-audio — convert ebook to audiobook */
  async convert(req, res) {
    const book = req.libraryItem?.media
    if (!book) return res.sendStatus(404)
    const { voice, language } = req.body || {}
    const result = await TextToAudiobookManager.convert(book.id, { voice: voice || language })
    res.json(result)
  }

  /** GET /api/items/:id/convert-to-audio/status — check if audio version exists */
  async status(req, res) {
    const book = req.libraryItem?.media
    if (!book) return res.sendStatus(404)
    const hasEbook = !!book.ebookFile
    const hasAudio = !!book.audioFiles?.length
    res.json({ hasEbook, hasAudio, canConvert: hasEbook && !hasAudio })
  }
}

const _inst = new TextToAudiobookController()
_inst.convert = asyncHandler(_inst.convert.bind(_inst))
_inst.status = asyncHandler(_inst.status.bind(_inst))
module.exports = _inst
