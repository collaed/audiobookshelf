const { Request, Response } = require('express')
const Logger = require('../Logger')
const LanguageLearningManager = require('../managers/LanguageLearningManager')

class LanguageLearningController {
  constructor() {}

  /**
   * POST /api/language/interleave-text
   * Generate interleaved ebook from two language editions
   * Body: { bookIdA, bookIdB, mode: 'sentence'|'paragraph', pattern: 'ab'|'aab'|'aba' }
   */
  async interleaveText(req, res) {
    const { bookIdA, bookIdB, mode, pattern } = req.body
    if (!bookIdA || !bookIdB) return res.status(400).json({ error: 'bookIdA and bookIdB required' })
    try {
      const result = await LanguageLearningManager.generateInterleavedText(bookIdA, bookIdB, { mode, pattern })
      res.json(result)
    } catch (err) {
      Logger.error(`[LanguageLearning] Text interleave error: ${err.message}`)
      res.status(400).json({ error: err.message })
    }
  }

  /**
   * POST /api/language/interleave-audio
   * Generate interleaved audio: native audiobook + TTS of translation
   * Body: { audioBookId, translationBookId, maxPairs, pauseMs }
   */
  async interleaveAudio(req, res) {
    const { audioBookId, translationBookId, maxPairs, pauseMs } = req.body
    if (!audioBookId || !translationBookId) return res.status(400).json({ error: 'audioBookId and translationBookId required' })
    try {
      const result = await LanguageLearningManager.generateInterleavedAudio(
        audioBookId, translationBookId, { maxPairs, pauseMs }
      )
      res.json(result)
    } catch (err) {
      Logger.error(`[LanguageLearning] Audio interleave error: ${err.message}`)
      res.status(400).json({ error: err.message })
    }
  }

  /**
   * POST /api/language/align
   * Preview sentence alignment between two books without generating output
   * Body: { bookIdA, bookIdB, mode, limit }
   */
  async previewAlignment(req, res) {
    const { bookIdA, bookIdB, mode, limit } = req.body
    if (!bookIdA || !bookIdB) return res.status(400).json({ error: 'bookIdA and bookIdB required' })
    try {
      const SyncManager = require('../managers/SyncManager')
      const Database = require('../Database')
      const bookA = await Database.bookModel.findByPk(bookIdA)
      const bookB = await Database.bookModel.findByPk(bookIdB)
      if (!bookA?.ebookFile || !bookB?.ebookFile) return res.status(400).json({ error: 'Both books need ebook files' })

      const textA = await SyncManager.extractEbookText(bookA.ebookFile.metadata.path, 10000)
      const textB = await SyncManager.extractEbookText(bookB.ebookFile.metadata.path, 10000)
      const pairs = LanguageLearningManager.alignTexts(textA, textB, mode || 'sentence')

      res.json({
        languageA: bookA.language,
        languageB: bookB.language,
        totalPairs: pairs.length,
        preview: pairs.slice(0, limit || 10)
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }
}
module.exports = new LanguageLearningController()
