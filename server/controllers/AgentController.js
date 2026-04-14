const { Request, Response } = require('express')
const Logger = require('../Logger')
const IncomingManager = require('../managers/IncomingManager')
const QualityManager = require('../managers/QualityManager')
const RecommendationManager = require('../managers/RecommendationManager')

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 *
 * @typedef {Request & RequestUserObject} RequestWithUser
 */

const VALID_TASK_TYPES = ['scan_incoming', 'identify_book', 'check_quality', 'move_file', 'download_metadata']

class AgentController {
  constructor() {
    this.taskQueue = []
    this.agents = new Map()
  }

  /**
   * POST: /api/agent/heartbeat
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async heartbeat(req, res) {
    const { agentId, version, hostname, result } = req.body
    if (!agentId) return res.status(400).json({ error: 'agentId required' })

    this.agents.set(agentId, { lastSeen: Date.now(), version, hostname })

    if (result) {
      await this.processResult(result.type, result)
      Logger.info(`[AgentController] Agent ${agentId} completed task ${result.taskId} (${result.type}): ${result.status}`)
    }

    const task = this.taskQueue.shift() || null
    res.json({ task })
  }

  /**
   * POST: /api/agent/tasks
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async queueTask(req, res) {
    const { type, params, priority = 0 } = req.body
    if (!VALID_TASK_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TASK_TYPES.join(', ')}` })
    }

    const task = { taskId: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type, params, priority, createdAt: Date.now() }
    const idx = this.taskQueue.findIndex((t) => t.priority > priority)
    this.taskQueue.splice(idx === -1 ? this.taskQueue.length : idx, 0, task)

    Logger.info(`[AgentController] Queued task ${task.taskId} (${type}) priority=${priority}`)
    res.json({ task })
  }

  /**
   * GET: /api/agent/tasks
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getTasks(req, res) {
    res.json({ tasks: this.taskQueue })
  }

  /**
   * GET: /api/agent/agents
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getAgents(req, res) {
    const agents = []
    for (const [agentId, info] of this.agents) {
      agents.push({ agentId, ...info })
    }
    res.json({ agents })
  }

  /**
   * Process completed task result by routing to the appropriate manager
   *
   * @param {string} type
   * @param {Object} result
   */
  async processResult(type, result) {
    switch (type) {
      case 'scan_incoming':
        await IncomingManager.handleScanResult(result.data)
        break
      case 'identify_book':
        await IncomingManager.handleIdentifyResult(result.data)
        break
      case 'check_quality':
        await QualityManager.handleQualityResult(result.data)
        break
      case 'move_file':
        await IncomingManager.handleMoveResult(result.data)
        break
      case 'download_metadata':
        await RecommendationManager.handleMetadataResult(result.data)
        break
      default:
        Logger.warn(`[AgentController] Unknown task type: ${type}`)
    }
  }
}
module.exports = new AgentController()
