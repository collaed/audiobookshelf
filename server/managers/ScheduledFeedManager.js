const Logger = require('../Logger')
const Database = require('../Database')
const RssFeedManager = require('./RssFeedManager')

/**
 * Scheduled podcast feed — publishes audiobook chapters as daily episodes.
 * Wraps ABS's existing RssFeedManager with a time-release schedule.
 *
 * Use case: subscribe in any podcast app, get one chapter per day
 * (or per week, or custom schedule). Like a book club drip feed.
 */
class ScheduledFeedManager {
  constructor() {}

  /**
   * Create a scheduled feed for a library item
   * @param {string} userId
   * @param {string} libraryItemId
   * @param {Object} options
   * @param {string} options.slug - URL slug for the feed
   * @param {string} options.schedule - 'daily' | 'weekdays' | 'weekly' | 'custom'
   * @param {number} options.episodesPerRelease - how many chapters per release (default: 1)
   * @param {string} options.startDate - ISO date to start releasing (default: now)
   * @param {string} options.releaseTime - time of day to release, HH:MM (default: '08:00')
   * @param {string} options.serverAddress - base URL
   */
  async createScheduledFeed(userId, libraryItemId, options = {}) {
    const libraryItem = await Database.libraryItemModel.findByPk(libraryItemId, {
      include: [{ model: Database.bookModel }]
    })
    if (!libraryItem?.book) throw new Error('Library item not found')

    const book = libraryItem.book
    const chapters = book.chapters || []
    const audioFiles = book.audioFiles || []

    if (!chapters.length && !audioFiles.length) {
      throw new Error('Book has no chapters or audio files')
    }

    const schedule = options.schedule || 'daily'
    const episodesPerRelease = options.episodesPerRelease || 1
    const startDate = new Date(options.startDate || Date.now())
    const releaseTime = options.releaseTime || '08:00'
    const [releaseHour, releaseMin] = releaseTime.split(':').map(Number)

    // Calculate release dates for each chapter
    const totalEpisodes = chapters.length || audioFiles.length
    const releaseDates = []
    let currentDate = new Date(startDate)
    currentDate.setHours(releaseHour, releaseMin, 0, 0)

    for (let i = 0; i < totalEpisodes; i++) {
      if (i > 0 && i % episodesPerRelease === 0) {
        currentDate = this._nextReleaseDate(currentDate, schedule)
      }
      releaseDates.push(new Date(currentDate))
    }

    // Create the feed using ABS's existing mechanism
    const slug = options.slug || `${book.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-drip`
    const serverAddress = options.serverAddress || ''

    // Store schedule metadata in feed's extraData
    const feedData = {
      slug,
      serverAddress,
      schedule: {
        type: schedule,
        episodesPerRelease,
        startDate: startDate.toISOString(),
        releaseTime,
        releaseDates: releaseDates.map((d) => d.toISOString()),
        totalEpisodes,
      }
    }

    // Use ABS's feed creation
    const feedExpanded = await Database.feedModel.createFeedForLibraryItem(
      userId, libraryItem, slug, serverAddress, {}
    )

    // Update feed episodes with scheduled pubDates
    if (feedExpanded?.feedEpisodes) {
      for (let i = 0; i < feedExpanded.feedEpisodes.length && i < releaseDates.length; i++) {
        await feedExpanded.feedEpisodes[i].update({
          pubDate: releaseDates[i].toISOString()
        })
      }
    }

    Logger.info(`[ScheduledFeedManager] Created drip feed "${slug}" for "${book.title}": ${totalEpisodes} episodes, ${schedule}`)

    return {
      feedId: feedExpanded.id,
      slug,
      feedUrl: `${serverAddress}/feed/${slug}`,
      title: book.title,
      schedule,
      episodesPerRelease,
      totalEpisodes,
      startDate: startDate.toISOString(),
      endDate: releaseDates[releaseDates.length - 1]?.toISOString(),
      releaseDates: releaseDates.slice(0, 10).map((d) => d.toISOString()), // preview first 10
    }
  }

  /**
   * Get the next release date based on schedule type
   */
  _nextReleaseDate(current, schedule) {
    const next = new Date(current)
    switch (schedule) {
      case 'daily':
        next.setDate(next.getDate() + 1)
        break
      case 'weekdays':
        next.setDate(next.getDate() + 1)
        while (next.getDay() === 0 || next.getDay() === 6) {
          next.setDate(next.getDate() + 1)
        }
        break
      case 'weekly':
        next.setDate(next.getDate() + 7)
        break
      case 'twice-weekly':
        next.setDate(next.getDate() + 3) // Mon→Thu, Thu→Mon roughly
        break
      default:
        next.setDate(next.getDate() + 1)
    }
    return next
  }

  /**
   * Get feed info with schedule details
   */
  async getFeedSchedule(feedId) {
    const feed = await Database.feedModel.findByPk(feedId, {
      include: [{ model: Database.feedEpisodeModel }]
    })
    if (!feed) return null

    const now = new Date()
    const episodes = (feed.feedEpisodes || []).map((ep) => ({
      id: ep.id,
      title: ep.title,
      pubDate: ep.pubDate,
      released: new Date(ep.pubDate) <= now,
    }))

    const released = episodes.filter((e) => e.released).length
    const upcoming = episodes.filter((e) => !e.released).length

    return {
      feedId: feed.id,
      title: feed.title,
      slug: feed.slug,
      totalEpisodes: episodes.length,
      released,
      upcoming,
      nextRelease: episodes.find((e) => !e.released)?.pubDate || null,
      episodes,
    }
  }
}

module.exports = new ScheduledFeedManager()
