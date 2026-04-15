const { asyncHandler, friendlyError } = require('../utils/asyncHandler')
const { Request, Response } = require('express')
const Logger = require('../Logger')
const GutenbergManager = require('../managers/GutenbergManager')

class GutenbergController {
  constructor() {}

  async search(req, res) {
    const q = req.query.q
    if (!q) return res.status(400).json({ error: 'q parameter required' })
    const results = await GutenbergManager.search(q, req.query.language || 'en', parseInt(req.query.limit) || 20)
    res.json({ results })
  }

  async browse(req, res) {
    const results = await GutenbergManager.browse(parseInt(req.query.page) || 1, parseInt(req.query.limit) || 25)
    res.json({ results })
  }

  async getDetails(req, res) {
    const details = await GutenbergManager.getDetails(req.params.id)
    if (!details) return res.sendStatus(404)
    res.json(details)
  }

  async download(req, res) {
    const { libraryFolderId, format } = req.body
    if (!libraryFolderId) return res.status(400).json({ error: 'libraryFolderId required' })
    const Database = require('../Database')
    const folder = await Database.libraryFolderModel.findByPk(libraryFolderId)
    if (!folder) return res.status(404).json({ error: 'Library folder not found' })
    const result = await GutenbergManager.downloadToLibrary(req.params.id, folder.path, format || 'epub')
    res.json(result)
  }
}

const _inst = new GutenbergController()
_inst.search = asyncHandler(_inst.search.bind(_inst))
_inst.browse = asyncHandler(_inst.browse.bind(_inst))
_inst.getDetails = asyncHandler(_inst.getDetails.bind(_inst))
_inst.download = asyncHandler(_inst.download.bind(_inst))
module.exports = _inst
