const Logger = require('../Logger')
const Database = require('../Database')

/**
 * Background scheduler for extended features.
 * Inspired by SizeMy's scrapers/scheduler.py pattern.
 * Runs periodic tasks without blocking the main thread.
 */
class ExtendedScheduler {
  constructor() {
    this.intervals = []
  }

  /**
   * Start all scheduled tasks. Called from Server.js init.
   */
  start() {
    // Rebuild recommendation profiles nightly (every 24h)
    this.schedule('recommendation-profiles', 24 * 60 * 60 * 1000, async () => {
      try {
        const users = await Database.userModel.findAll({ attributes: ['id'] })
        const RecommendationManager = require('./RecommendationManager')
        for (const user of users) {
          await RecommendationManager.buildProfile(user.id).catch(() => {})
        }
        Logger.info(`[ExtendedScheduler] Rebuilt ${users.length} recommendation profiles`)
      } catch (err) {
        Logger.error(`[ExtendedScheduler] Profile rebuild failed: ${err.message}`)
      }
    })

    // Clear expired review cache (every 6h)
    this.schedule('review-cache-cleanup', 6 * 60 * 60 * 1000, () => {
      try {
        const ReviewManager = require('./ReviewManager')
        const now = Date.now()
        let cleared = 0
        for (const [key, val] of ReviewManager.cache) {
          if (now - val.fetchedAt > ReviewManager.cacheTTL) {
            ReviewManager.cache.delete(key)
            cleared++
          }
        }
        if (cleared) Logger.info(`[ExtendedScheduler] Cleared ${cleared} expired review cache entries`)
      } catch {}
    })

    // Check incoming folder (every 5 min)
    this.schedule('incoming-scan', 5 * 60 * 1000, async () => {
      try {
        const IncomingManager = require('./IncomingManager')
        if (IncomingManager.incomingPath) {
          await IncomingManager.scanIncoming()
        }
      } catch {}
    })

    Logger.info(`[ExtendedScheduler] Started ${this.intervals.length} scheduled tasks`)
  }

  schedule(name, intervalMs, fn) {
    // Run after initial delay (stagger to avoid startup spike)
    const delay = 30000 + Math.random() * 30000
    const timer = setTimeout(() => {
      fn()
      const interval = setInterval(fn, intervalMs)
      this.intervals.push(interval)
    }, delay)
    this.intervals.push(timer)
  }

  stop() {
    this.intervals.forEach((t) => clearInterval(t))
    this.intervals = []
  }
}

module.exports = new ExtendedScheduler()
