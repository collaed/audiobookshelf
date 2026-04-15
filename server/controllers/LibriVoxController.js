const { asyncHandler } = require('../utils/asyncHandler')
const { Request, Response } = require('express')
const Logger = require('../Logger')
const LibriVoxManager = require('../managers/LibriVoxManager')

class LibriVoxController {
  constructor() {}

  /** GET /api/librivox/search?q=QUERY&limit=20 */
  async search(req, res) {
    const q = req.query.q
    if (!q) return res.status(400).json({ error: 'q parameter required' })
    const results = await LibriVoxManager.search(q, parseInt(req.query.limit) || 20)
    res.json({ results })
  }

  /** GET /api/librivox/browse?page=1&limit=25 */
  async browse(req, res) {
    const results = await LibriVoxManager.browse(parseInt(req.query.page) || 1, parseInt(req.query.limit) || 25)
    res.json({ results })
  }

  /** GET /api/librivox/:id */
  async getDetails(req, res) {
    const details = await LibriVoxManager.getDetails(req.params.id)
    if (!details) return res.sendStatus(404)
    res.json(details)
  }

  /** POST /api/librivox/:id/download — body: { libraryFolderId } */
  async download(req, res) {
    const { libraryFolderId } = req.body
    if (!libraryFolderId) return res.status(400).json({ error: 'libraryFolderId required' })

    const Database = require('../Database')
    const folder = await Database.libraryFolderModel.findByPk(libraryFolderId)
    if (!folder) return res.status(404).json({ error: 'Library folder not found' })

    try {
      const result = await LibriVoxManager.downloadToLibrary(req.params.id, folder.path)
      res.json(result)
    } catch (err) {
      Logger.error(`[LibriVoxController] Download error: ${err.message}`)
      res.status(500).json({ error: err.message })
    }
  }
}
const _inst = new LibriVoxController()
_inst.search = asyncHandler(_inst.search.bind(_inst))
_inst.browse = asyncHandler(_inst.browse.bind(_inst))
_inst.getDetails = asyncHandler(_inst.getDetails.bind(_inst))
_inst.download = asyncHandler(_inst.download.bind(_inst))
module.exports = _inst
