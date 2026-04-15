const { asyncHandler, friendlyError } = require('../utils/asyncHandler')
const { Request, Response } = require('express')
const Logger = require('../Logger')
const Database = require('../Database')
const IncomingManager = require('../managers/IncomingManager')

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 *
 * @typedef {Request & RequestUserObject} RequestWithUser
 */

class IncomingController {
  constructor() {}

  /**
   * GET: /api/incoming
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getAll(req, res) {
    const items = await Database.models.incomingItem.findAll({ order: [['createdAt', 'DESC']] })
    res.json({ items })
  }

  /**
   * GET: /api/incoming/pending
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getPending(req, res) {
    const items = await Database.models.incomingItem.getPending()
    res.json({ items })
  }

  /**
   * POST: /api/incoming/:id/confirm
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async confirm(req, res) {
    const { libraryId, libraryFolderId } = req.body
    const item = await IncomingManager.confirmItem(req.params.id, libraryId, libraryFolderId)
    if (!item) return res.sendStatus(404)
    res.json({ item })
  }

  /**
   * POST: /api/incoming/:id/reject
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async reject(req, res) {
    const item = await IncomingManager.rejectItem(req.params.id)
    if (!item) return res.sendStatus(404)
    res.json({ item })
  }

  /**
   * POST: /api/incoming/scan
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async scan(req, res) {
    IncomingManager.scanIncoming()
    res.sendStatus(200)
  }
}
const _inst = new IncomingController()
_inst.getAll = asyncHandler(_inst.getAll.bind(_inst))
_inst.getPending = asyncHandler(_inst.getPending.bind(_inst))
_inst.confirm = asyncHandler(_inst.confirm.bind(_inst))
_inst.reject = asyncHandler(_inst.reject.bind(_inst))
_inst.scan = asyncHandler(_inst.scan.bind(_inst))
module.exports = _inst
