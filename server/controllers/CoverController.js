const { asyncHandler } = require('../utils/asyncHandler')
const CoverGenerator = require('../managers/CoverGenerator')

class CoverController {
  async generate(req, res) {
    const result = await CoverGenerator.generateForBook(req.params.id)
    res.json(result)
  }
  async generateBatch(req, res) {
    const Database = require('../Database')
    const items = await Database.libraryItemModel.findAll({ where: { libraryId: req.params.libraryId }, attributes: ['mediaId'] })
    let generated = 0, skipped = 0
    for (const item of items) {
      try { const r = await CoverGenerator.generateForBook(item.mediaId); if (r.generated) generated++; else skipped++ }
      catch { skipped++ }
    }
    res.json({ generated, skipped, total: items.length })
  }
}
const _inst = new CoverController()
_inst.generate = asyncHandler(_inst.generate.bind(_inst))
_inst.generateBatch = asyncHandler(_inst.generateBatch.bind(_inst))
module.exports = _inst
