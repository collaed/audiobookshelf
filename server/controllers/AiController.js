const { asyncHandler } = require('../utils/asyncHandler')
const { Request, Response } = require('express')
const Logger = require('../Logger')
const LlmProvider = require('../managers/LlmProvider')
const BookCompanionManager = require('../managers/BookCompanionManager')

class AiController {
  constructor() {}

  /** GET /api/ai/status */
  async status(req, res) {
    const availability = await LlmProvider.isAvailable()
    const config = LlmProvider.getStatus()
    res.json({ ...availability, config })
  }

  /** GET /api/ai/config — get current LLM config (no secrets) */
  async getConfig(req, res) {
    res.json(LlmProvider.getStatus())
  }

  /** PATCH /api/ai/config — update LLM config */
  async updateConfig(req, res) {
    LlmProvider.configure(req.body)
    const status = await LlmProvider.isAvailable()
    res.json({ updated: true, ...status })
  }

  /** GET /api/ai/recap/:bookId */
  async getRecap(req, res) {
    try {
      const result = await BookCompanionManager.getRecap(req.params.bookId, req.user.id)
      res.json(result)
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  /** GET /api/ai/chapter-summary/:bookId/:chapterIndex */
  async getChapterSummary(req, res) {
    try {
      const result = await BookCompanionManager.getChapterSummary(req.params.bookId, parseInt(req.params.chapterIndex))
      res.json(result)
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  /** POST /api/ai/search { query } */
  async smartSearch(req, res) {
    if (!req.body.query) return res.status(400).json({ error: 'query required' })
    try {
      const result = await BookCompanionManager.smartSearch(req.body.query, req.user.id)
      res.json(result)
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  /** POST /api/ai/ask/:bookId { question } */
  async askAboutBook(req, res) {
    if (!req.body.question) return res.status(400).json({ error: 'question required' })
    try {
      const result = await BookCompanionManager.askAboutBook(req.params.bookId, req.user.id, req.body.question)
      res.json(result)
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  /** POST /api/ai/character/:bookId { name } */
  async getCharacter(req, res) {
    if (!req.body.name) return res.status(400).json({ error: 'name required' })
    try {
      const result = await BookCompanionManager.getCharacterInfo(req.params.bookId, req.user.id, req.body.name)
      res.json(result)
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  /** POST /api/ai/check-alignment { pairs } */
  async checkAlignment(req, res) {
    if (!req.body.pairs?.length) return res.status(400).json({ error: 'pairs array required' })
    try {
      const result = await BookCompanionManager.checkAlignmentQuality(req.body.pairs)
      res.json(result)
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }
}
const _inst = new AiController()
_inst.status = asyncHandler(_inst.status.bind(_inst))
_inst.getConfig = asyncHandler(_inst.getConfig.bind(_inst))
_inst.updateConfig = asyncHandler(_inst.updateConfig.bind(_inst))
_inst.getRecap = asyncHandler(_inst.getRecap.bind(_inst))
_inst.getChapterSummary = asyncHandler(_inst.getChapterSummary.bind(_inst))
_inst.smartSearch = asyncHandler(_inst.smartSearch.bind(_inst))
_inst.askAboutBook = asyncHandler(_inst.askAboutBook.bind(_inst))
_inst.getCharacter = asyncHandler(_inst.getCharacter.bind(_inst))
_inst.checkAlignment = asyncHandler(_inst.checkAlignment.bind(_inst))
module.exports = _inst
