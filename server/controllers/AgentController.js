const { Request, Response } = require('express')
const Logger = require('../Logger')
const SocketAuthority = require('../SocketAuthority')
const Database = require('../Database')
const IncomingManager = require('../managers/IncomingManager')
const QualityManager = require('../managers/QualityManager')

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 * @typedef {Request & RequestUserObject} RequestWithUser
 */

const VALID_TASK_TYPES = [
  'scan_incoming', 'identify_book', 'check_quality', 'move_file', 'download_metadata',
  'scan_incoming_audio', 'audio_quality', 'audio_identify', 'audio_clean'
]

class AgentController {
  constructor() {
    this.taskQueue = []
    this.agents = new Map()
  }

  /**
   * POST: /api/agent/heartbeat
   * Compatible with CineCross agent protocol
   */
  async heartbeat(req, res) {
    const { agentId, version, hostname, result } = req.body
    if (!agentId) return res.status(400).json({ error: 'agentId required' })

    this.agents.set(agentId, { lastSeen: Date.now(), version, hostname })

    if (result && result.type) {
      try {
        await this.processResult(result.type, result)
        Logger.info(`[AgentController] Agent ${agentId} completed ${result.type}`)
      } catch (err) {
        Logger.error(`[AgentController] Error processing result: ${err.message}`)
      }
    }

    const task = this.taskQueue.shift() || null
    res.json({ task })
  }

  /**
   * POST: /api/agent/tasks
   */
  async queueTask(req, res) {
    const { type, params, priority = 0 } = req.body
    if (!VALID_TASK_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Valid: ${VALID_TASK_TYPES.join(', ')}` })
    }

    const task = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      params: params || {},
      priority,
      createdAt: Date.now()
    }
    // Insert sorted by priority (lower = higher priority)
    const idx = this.taskQueue.findIndex((t) => t.priority > priority)
    this.taskQueue.splice(idx === -1 ? this.taskQueue.length : idx, 0, task)

    Logger.info(`[AgentController] Queued ${type} (${task.id}) priority=${priority}`)
    SocketAuthority.emitter('agent_task_queued', task)
    res.json({ task })
  }

  /** GET: /api/agent/tasks */
  async getTasks(req, res) {
    res.json({ tasks: this.taskQueue })
  }

  /** GET: /api/agent/agents */
  async getAgents(req, res) {
    const agents = []
    for (const [agentId, info] of this.agents) {
      agents.push({ agentId, ...info, online: (Date.now() - info.lastSeen) < 60000 })
    }
    res.json({ agents })
  }

  /**
   * Process completed task results from any agent (native or CineCross)
   */
  async processResult(type, result) {
    const data = result.data || result
    switch (type) {
      case 'scan_incoming':
      case 'scan_incoming_audio': {
        // Agent found audio files — create IncomingItem records
        const files = data.files || []
        for (const f of files) {
          try {
            await Database.incomingItemModel.create({
              filePath: f.path,
              fileName: f.filename,
              fileSize: f.size,
              fileFormat: f.filename.split('.').pop(),
              parsedTitle: f.parsed?.title || '',
              parsedAuthor: f.parsed?.author || '',
              parsedSeries: f.parsed?.series || '',
              parsedSequence: f.parsed?.sequence || '',
              status: 'pending'
            })
          } catch (err) {
            Logger.warn(`[AgentController] Failed to create incoming item for ${f.filename}: ${err.message}`)
          }
        }
        SocketAuthority.emitter('incoming_scan_complete', { count: files.length })
        Logger.info(`[AgentController] Scan result: ${files.length} audio files found`)
        break
      }
      case 'audio_identify': {
        // Agent read embedded metadata — update the IncomingItem if we can match by path
        if (data.path) {
          const item = await Database.incomingItemModel.findOne({ where: { filePath: data.path } })
          if (item) {
            await item.update({
              matchedTitle: data.title || data.album || item.matchedTitle,
              matchedAuthor: data.artist || item.matchedAuthor,
              matchProvider: 'embedded_metadata'
            })
          }
        }
        break
      }
      case 'audio_quality':
      case 'check_quality': {
        // Store quality data — emit to UI
        SocketAuthority.emitter('quality_check_complete', data)
        break
      }
      case 'identify_book':
      case 'move_file':
      case 'download_metadata':
        SocketAuthority.emitter('agent_task_complete', { type, data })
        break
      default:
        Logger.warn(`[AgentController] Unknown result type: ${type}`)
    }
  }
}
module.exports = new AgentController()
