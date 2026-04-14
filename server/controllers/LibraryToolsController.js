const { Request, Response } = require('express')
const Logger = require('../Logger')
const GroupingManager = require('../managers/GroupingManager')
const ConversionManager = require('../managers/ConversionManager')

class LibraryToolsController {
  constructor() {}

  /** GET /api/tools/groups — detect related incoming files */
  async detectGroups(req, res) {
    const groups = await GroupingManager.detectGroups()
    // Annotate with missing parts
    for (const g of groups) {
      g.missingParts = GroupingManager.detectMissingParts(g.sequences)
    }
    res.json({ groups })
  }

  /** POST /api/tools/groups/:key/merge — group and move files into library */
  async mergeGroup(req, res) {
    const { libraryFolderId } = req.body
    if (!libraryFolderId) return res.status(400).json({ error: 'libraryFolderId required' })

    const Database = require('../Database')
    const folder = await Database.libraryFolderModel.findByPk(libraryFolderId)
    if (!folder) return res.status(404).json({ error: 'Library folder not found' })

    try {
      const result = await GroupingManager.groupAndMove(decodeURIComponent(req.params.key), folder.path)
      res.json(result)
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  /** GET /api/tools/duplicates?libraryId=X — find duplicate books */
  async detectDuplicates(req, res) {
    const dupes = await GroupingManager.detectDuplicates(req.query.libraryId)
    res.json({ duplicates: dupes, count: dupes.length })
  }

  /** POST /api/tools/convert — convert ebook format */
  async convertFormat(req, res) {
    const { bookId, format, options } = req.body
    if (!bookId || !format) return res.status(400).json({ error: 'bookId and format required' })

    try {
      const result = await ConversionManager.convertLibraryItem(bookId, format, options || {})
      res.json(result)
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  /** POST /api/tools/convert-all — convert for all major readers */
  async convertForAll(req, res) {
    const { bookId } = req.body
    if (!bookId) return res.status(400).json({ error: 'bookId required' })

    try {
      const results = await ConversionManager.convertForAllReaders(bookId)
      res.json(results)
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  /** GET /api/tools/conversion-check — check if Calibre is available */
  async conversionCheck(req, res) {
    const available = await ConversionManager.isAvailable()
    const capabilities = GroupingManager.getConversionCapabilities()
    res.json({ calibreAvailable: available, ...capabilities })
  }

  /** POST /api/tools/extract-metadata — extract metadata from ebook */
  async extractMetadata(req, res) {
    const { filePath } = req.body
    if (!filePath) return res.status(400).json({ error: 'filePath required' })

    try {
      const meta = await ConversionManager.extractMetadata(filePath)
      res.json(meta)
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }
}
module.exports = new LibraryToolsController()
