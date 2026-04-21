const { asyncHandler, friendlyError } = require('../utils/asyncHandler')
const { Request, Response } = require('express')
const Logger = require('../Logger')
const MetadataDownloadManager = require('../managers/MetadataDownloadManager')

class MetadataDownloadController {
  constructor() {}

  /** POST /api/items/:id/metadata-download — search all sources for metadata */
  async search(req, res) {
    const book = req.libraryItem?.media
    if (!book) return res.sendStatus(404)
    const Database = require('../Database')
    const fullBook = await Database.bookModel.findByPk(book.id, { include: [{ model: Database.authorModel }] })
    const result = await MetadataDownloadManager.identify({
      title: fullBook.title, author: fullBook.authors?.[0]?.name,
      isbn: fullBook.isbn, asin: fullBook.asin,
    })
    res.json(result)
  }

  /** POST /api/items/:id/metadata-download/apply — download and apply best match */
  async apply(req, res) {
    const book = req.libraryItem?.media
    if (!book) return res.sendStatus(404)
    const result = await MetadataDownloadManager.downloadAndApply(book.id)
    res.json(result)
  }

  /** POST /api/metadata/search — search by arbitrary query (not tied to item) */
  async freeSearch(req, res) {
    const { title, author, isbn, asin } = req.body
    if (!title && !isbn && !asin) return res.status(400).json({ error: 'title, isbn, or asin required' })
    const result = await MetadataDownloadManager.identify({ title, author, isbn, asin })
    res.json(result)
  }
}

const _inst = new MetadataDownloadController()
_inst.search = asyncHandler(_inst.search.bind(_inst))
_inst.apply = asyncHandler(_inst.apply.bind(_inst))
_inst.freeSearch = asyncHandler(_inst.freeSearch.bind(_inst))
module.exports = _inst
