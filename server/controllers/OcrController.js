const { Request, Response } = require('express')
const Logger = require('../Logger')
const Database = require('../Database')
const OcrManager = require('../managers/OcrManager')

class OcrController {
  constructor() {}

  /** GET /api/ocr/status */
  async status(req, res) {
    const status = await OcrManager.isAvailable()
    res.json(status)
  }

  /** POST /api/items/:id/ocr — OCR a library item's PDF ebook */
  async ocrItem(req, res) {
    const libraryItem = req.libraryItem
    const book = libraryItem?.media
    if (!book?.ebookFile) return res.status(400).json({ error: 'No ebook file found' })

    const format = book.ebookFile.ebookFormat?.toLowerCase()
    if (format !== 'pdf') return res.status(400).json({ error: `OCR only supports PDF, got ${format}` })

    const language = req.body?.language || 'eng'

    try {
      const result = await OcrManager.ocrLibraryItemPdf(book.ebookFile.metadata.path, language)
      res.json(result)
    } catch (err) {
      Logger.error(`[OcrController] OCR error: ${err.message}`)
      res.status(500).json({ error: err.message })
    }
  }

  /** POST /api/items/:id/ocr/text — extract text from PDF pages (no file replacement) */
  async extractText(req, res) {
    const libraryItem = req.libraryItem
    const book = libraryItem?.media
    if (!book?.ebookFile) return res.status(400).json({ error: 'No ebook file found' })

    const language = req.body?.language || 'eng'
    const pages = req.body?.pages || ''

    try {
      const result = await OcrManager.ocrPdfToText(book.ebookFile.metadata.path, language, pages)
      res.json(result)
    } catch (err) {
      Logger.error(`[OcrController] Text extraction error: ${err.message}`)
      res.status(500).json({ error: err.message })
    }
  }
}
module.exports = new OcrController()
