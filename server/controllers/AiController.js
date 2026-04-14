const { Request, Response } = require('express')
const Logger = require('../Logger')
const LlmProvider = require('../managers/LlmProvider')
const BookCompanionManager = require('../managers/BookCompanionManager')

class AiController {
  constructor() {}

  /** GET /api/ai/status */
  async status(req, res) {
    const status = await LlmProvider.isAvailable()
    res.json(status)
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
module.exports = new AiController()
