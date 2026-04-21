const { asyncHandler, friendlyError } = require('../utils/asyncHandler')
const FtsManager = require('../managers/FtsManager')

class FtsController {
  constructor() {}
  async search(req, res) {
    const q = req.query.q
    if (!q) return res.status(400).json({ error: 'q parameter required' })
    const results = await FtsManager.search(q, parseInt(req.query.limit) || 20)
    res.json({ results, query: q })
  }
  async indexLibrary(req, res) {
    const result = await FtsManager.indexLibrary(req.params.id)
    res.json(result)
  }
  async status(req, res) {
    const status = await FtsManager.getStatus()
    res.json(status)
  }
}
const _inst = new FtsController()
_inst.search = asyncHandler(_inst.search.bind(_inst))
_inst.indexLibrary = asyncHandler(_inst.indexLibrary.bind(_inst))
_inst.status = asyncHandler(_inst.status.bind(_inst))
module.exports = _inst
