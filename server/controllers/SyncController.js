const { asyncHandler } = require('../utils/asyncHandler')
const { Request, Response } = require('express')
const Logger = require('../Logger')
const SyncManager = require('../managers/SyncManager')

class SyncController {
  constructor() {}

  /** GET /api/sync/check — verify Whisper is available */
  async check(req, res) {
    const available = await SyncManager.isAvailable()
    res.json({ whisperAvailable: available, sampleDuration: SyncManager.sampleDuration })
  }

  /** GET /api/sync/pairs?libraryId=X — auto-detect audiobook↔ebook pairs by title */
  async detectPairs(req, res) {
    if (!req.query.libraryId) return res.status(400).json({ error: 'libraryId required' })
    const result = await SyncManager.detectAllPairs(req.query.libraryId)
    res.json(result)
  }

  /** POST /api/sync/verify — verify a pair using STT { audioBookId, ebookBookId } */
  async verifyPair(req, res) {
    const { audioBookId, ebookBookId } = req.body
    if (!audioBookId || !ebookBookId) return res.status(400).json({ error: 'audioBookId and ebookBookId required' })
    try {
      const result = await SyncManager.verifyPair(audioBookId, ebookBookId)
      res.json(result)
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  /** POST /api/sync/chapters — generate chapter-level sync { audioBookId, ebookBookId } */
  async generateSync(req, res) {
    const { audioBookId, ebookBookId } = req.body
    if (!audioBookId || !ebookBookId) return res.status(400).json({ error: 'audioBookId and ebookBookId required' })
    try {
      const result = await SyncManager.generateChapterSync(audioBookId, ebookBookId)
      res.json(result)
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }
}
const _inst = new SyncController()
_inst.check = asyncHandler(_inst.check.bind(_inst))
_inst.detectPairs = asyncHandler(_inst.detectPairs.bind(_inst))
_inst.verifyPair = asyncHandler(_inst.verifyPair.bind(_inst))
_inst.generateSync = asyncHandler(_inst.generateSync.bind(_inst))
module.exports = _inst
