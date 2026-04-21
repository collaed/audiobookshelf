const { asyncHandler } = require('../utils/asyncHandler')
const TranslationManager = require('../managers/TranslationManager')

class TranslationController {
  async translate(req, res) {
    const { targetLang, sourceLang } = req.body || {}
    if (!targetLang) return res.status(400).json({ error: 'targetLang required' })
    const result = await TranslationManager.translateBook(req.params.id, targetLang, sourceLang)
    res.json(result)
  }
  async backends(req, res) {
    res.json(await TranslationManager.listBackends())
  }
}
const _inst = new TranslationController()
_inst.translate = asyncHandler(_inst.translate.bind(_inst))
_inst.backends = asyncHandler(_inst.backends.bind(_inst))
module.exports = _inst
