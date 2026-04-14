const Logger = require('../Logger')
const Database = require('../Database')

const WEIGHTS = { author: 2, narrator: 1.5, genre: 1, theme: 1 }

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet',
  'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same',
  'than', 'too', 'very', 'just', 'because', 'about', 'up', 'out', 'if',
  'then', 'that', 'this', 'it', 'its', 'he', 'she', 'they', 'them',
  'his', 'her', 'their', 'what', 'which', 'who', 'whom', 'how', 'when',
  'where', 'why', 'while', 'also', 'over', 'new', 'one', 'two', 'first'
])

class RecommendationManager {
  constructor() {
    this.profiles = new Map()
  }

  /**
   * Extract top themes from a description string
   * @param {string} text
   * @returns {Object.<string, number>}
   */
  extractThemes(text) {
    if (!text) return {}
    const freq = {}
    text.toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z\s]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w))
      .forEach((w) => { freq[w] = (freq[w] || 0) + 1 })
    return freq
  }

  /**
   * Tally occurrences into a map
   * @param {Object} tally
   * @param {string[]} items
   */
  tallyItems(tally, items) {
    if (!items) return
    for (const item of items) {
      if (item) tally[item] = (tally[item] || 0) + 1
    }
  }

  /**
   * Get sorted top N entries from a tally object
   * @param {Object} tally
   * @param {number} n
   * @returns {string[]}
   */
  topN(tally, n) {
    return Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
  }

  async buildProfile(userId) {
    const progresses = await Database.mediaProgressModel.findAll({
      where: { userId, isFinished: true, mediaItemType: 'book' }
    })
    if (!progresses.length) return null

    const bookIds = progresses.map((p) => p.mediaItemId)
    const books = await Database.bookModel.findAll({
      where: { id: bookIds },
      include: [{ model: Database.authorModel, through: { attributes: [] } }]
    })

    const genres = {}
    const authors = {}
    const narrators = {}
    const themes = {}
    let totalDuration = 0

    for (const book of books) {
      this.tallyItems(genres, book.genres)
      this.tallyItems(narrators, book.narrators)
      if (book.authors) {
        this.tallyItems(authors, book.authors.map((a) => a.name))
      }
      if (book.description) {
        const bookThemes = this.extractThemes(book.description)
        for (const [word, count] of Object.entries(bookThemes)) {
          themes[word] = (themes[word] || 0) + count
        }
      }
      totalDuration += book.duration || 0
    }

    const profile = {
      userId,
      genres,
      authors,
      narrators,
      themes,
      topGenres: this.topN(genres, 10),
      topAuthors: this.topN(authors, 10),
      topNarrators: this.topN(narrators, 10),
      topThemes: this.topN(themes, 20),
      avgBookLength: books.length ? totalDuration / books.length : 0,
      totalListeningTime: totalDuration,
      booksFinished: books.length,
      readBookIds: new Set(bookIds),
      updatedAt: Date.now()
    }

    this.profiles.set(userId, profile)
    return profile
  }

  async getRecommendations(userId, category = 'all') {
    const profile = await this.buildProfile(userId)
    if (!profile) return { category, items: [] }

    // Load language & format preferences
    const [listenerProfile] = await Database.listenerProfileModel.getOrCreateForUser(userId)
    const fluentLangs = listenerProfile.fluentLanguages || []
    const secondaryLangs = listenerProfile.secondaryLanguages || []
    const allLangs = [...fluentLangs, ...secondaryLangs]
    const includeEbooks = listenerProfile.includeEbooks !== false
    const preferredFormat = listenerProfile.preferredFormat || 'all'

    profile.languages = allLangs
    profile.includeEbooks = includeEbooks
    profile.preferredFormat = preferredFormat

    const readBookIds = [...profile.readBookIds]

    const categoryMap = {
      dna: () => this.getDnaMatch(profile, readBookIds),
      authors: () => this.getAuthorsYouLove(profile, readBookIds),
      narrators: () => this.getNarratorsYouLove(profile, readBookIds),
      series: () => this.getCompleteSeries(userId),
      gems: () => this.getHiddenGems(profile, readBookIds)
    }

    if (category !== 'all' && categoryMap[category]) {
      return { category, items: await categoryMap[category]() }
    }

    const results = {}
    for (const [key, fn] of Object.entries(categoryMap)) {
      try {
        results[key] = await fn()
      } catch (err) {
        Logger.error(`[RecommendationManager] Error in ${key}: ${err.message}`)
        results[key] = []
      }
    }
    return { category: 'all', items: results }
  }

  /**
   * Score a book against a profile
   * @param {Object} book
   * @param {Object} profile
   * @returns {number}
   */
  scoreBook(book, profile) {
    let score = 0
    let maxScore = 0

    // Genre scoring
    if (book.genres) {
      for (const g of book.genres) {
        if (profile.genres[g]) score += profile.genres[g] * WEIGHTS.genre
      }
    }
    maxScore += Object.values(profile.genres).reduce((s, v) => s + v, 0) * WEIGHTS.genre || 1

    // Narrator scoring
    if (book.narrators) {
      for (const n of book.narrators) {
        if (profile.narrators[n]) score += profile.narrators[n] * WEIGHTS.narrator
      }
    }
    maxScore += Object.values(profile.narrators).reduce((s, v) => s + v, 0) * WEIGHTS.narrator || 1

    // Author scoring
    if (book.authorNames) {
      for (const a of book.authorNames) {
        if (profile.authors[a]) score += profile.authors[a] * WEIGHTS.author
      }
    }
    maxScore += Object.values(profile.authors).reduce((s, v) => s + v, 0) * WEIGHTS.author || 1

    // Theme scoring
    if (book.description) {
      const bookThemes = this.extractThemes(book.description)
      for (const [word, count] of Object.entries(bookThemes)) {
        if (profile.themes[word]) score += Math.min(count, profile.themes[word]) * WEIGHTS.theme
      }
    }
    maxScore += Object.values(profile.themes).reduce((s, v) => s + v, 0) * WEIGHTS.theme || 1

    return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0
  }

  /**
   * Load unread books with authors
   * @param {string[]} readBookIds
   * @param {Object} [extraWhere]
   * @returns {Promise<Object[]>}
   */
  async getUnreadBooks(readBookIds, extraWhere = {}) {
    const { Op } = require('sequelize')
    const where = { ...extraWhere }
    if (readBookIds.length) where.id = { [Op.notIn]: readBookIds }

    const books = await Database.bookModel.findAll({
      where,
      include: [{ model: Database.authorModel, through: { attributes: [] } }],
      limit: 500
    })

    return books.map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      genres: b.genres || [],
      narrators: b.narrators || [],
      language: b.language,
      duration: b.duration,
      hasAudio: !!b.audioFiles?.length,
      hasEbook: !!b.ebookFile,
      authorNames: b.authors ? b.authors.map((a) => a.name) : [],
      coverPath: b.coverPath
    }))
  }

  /**
   * Filter books by profile language and format preferences
   */
  filterByPreferences(books, profile) {
    return books.filter((b) => {
      // Language filter: if languages set, book must match (or have no language set)
      if (profile.languages?.length && b.language) {
        const bookLang = b.language.toLowerCase()
        const matches = profile.languages.some((l) => bookLang.includes(l.toLowerCase()) || l.toLowerCase().includes(bookLang))
        if (!matches) return false
      }
      // Format filter
      if (profile.preferredFormat === 'audiobook' && !b.hasAudio) return false
      if (profile.preferredFormat === 'ebook' && !b.hasEbook) return false
      if (!profile.includeEbooks && !b.hasAudio) return false
      return true
    })
  }

  async getDnaMatch(profile, readBookIds) {
    const books = this.filterByPreferences(await this.getUnreadBooks(readBookIds), profile)
    return books
      .map((b) => ({ ...b, score: this.scoreBook(b, profile) }))
      .filter((b) => b.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
  }

  async getAuthorsYouLove(profile, readBookIds) {
    if (!profile.topAuthors.length) return []
    const authorRecords = await Database.authorModel.findAll({
      where: { name: profile.topAuthors }
    })
    const authorIds = authorRecords.map((a) => a.id)
    if (!authorIds.length) return []

    const bookAuthors = await Database.bookAuthorModel.findAll({
      where: { authorId: authorIds }
    })
    const candidateBookIds = [...new Set(bookAuthors.map((ba) => ba.bookId))].filter((id) => !profile.readBookIds.has(id))
    if (!candidateBookIds.length) return []

    const { Op } = require('sequelize')
    const books = await Database.bookModel.findAll({
      where: { id: { [Op.in]: candidateBookIds } },
      include: [{ model: Database.authorModel, through: { attributes: [] } }],
      limit: 20
    })

    return books.map((b) => ({
      id: b.id,
      title: b.title,
      authorNames: b.authors ? b.authors.map((a) => a.name) : [],
      coverPath: b.coverPath,
      score: 100
    }))
  }

  async getNarratorsYouLove(profile, readBookIds) {
    if (!profile.topNarrators.length) return []
    const books = this.filterByPreferences(await this.getUnreadBooks(readBookIds), profile)
    const topSet = new Set(profile.topNarrators)

    return books
      .filter((b) => b.narrators.some((n) => topSet.has(n)))
      .map((b) => {
        const matchCount = b.narrators.filter((n) => topSet.has(n)).length
        return { ...b, score: Math.min(100, matchCount * 50) }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
  }

  async getCompleteSeries(userId) {
    const progresses = await Database.mediaProgressModel.findAll({
      where: { userId, isFinished: true, mediaItemType: 'book' }
    })
    const finishedBookIds = new Set(progresses.map((p) => p.mediaItemId))

    const allBookSeries = await Database.bookSeriesModel.findAll({
      include: [{ model: Database.seriesModel }]
    })

    // Group by series
    const seriesMap = {}
    for (const bs of allBookSeries) {
      const sid = bs.seriesId
      if (!seriesMap[sid]) seriesMap[sid] = { series: bs.series, books: [] }
      seriesMap[sid].books.push({ bookId: bs.bookId, sequence: bs.sequence })
    }

    const results = []
    for (const [seriesId, data] of Object.entries(seriesMap)) {
      const hasRead = data.books.some((b) => finishedBookIds.has(b.bookId))
      const unread = data.books.filter((b) => !finishedBookIds.has(b.bookId))
      if (hasRead && unread.length > 0 && unread.length < data.books.length) {
        results.push({
          seriesId,
          seriesName: data.series?.name,
          totalBooks: data.books.length,
          booksRead: data.books.length - unread.length,
          missingBookIds: unread.map((b) => b.bookId),
          missingSequences: unread.map((b) => b.sequence).filter(Boolean)
        })
      }
    }

    return results.sort((a, b) => (b.booksRead / b.totalBooks) - (a.booksRead / a.totalBooks)).slice(0, 20)
  }

  async getHiddenGems(profile, readBookIds) {
    const books = this.filterByPreferences(await this.getUnreadBooks(readBookIds), profile)
    if (!books.length) return []

    // Get completion stats for all books
    const allProgress = await Database.mediaProgressModel.findAll({
      where: { mediaItemType: 'book' },
      attributes: ['mediaItemId', 'isFinished']
    })

    const stats = {}
    for (const p of allProgress) {
      if (!stats[p.mediaItemId]) stats[p.mediaItemId] = { total: 0, finished: 0 }
      stats[p.mediaItemId].total++
      if (p.isFinished) stats[p.mediaItemId].finished++
    }

    const topGenreSet = new Set(profile.topGenres)

    return books
      .map((b) => {
        const s = stats[b.id]
        if (!s || s.total > 10 || s.total === 0) return null // skip popular or unlistened
        const completionRate = s.finished / s.total
        const genreMatch = b.genres.some((g) => topGenreSet.has(g))
        if (completionRate < 0.5 || !genreMatch) return null
        return { ...b, score: Math.round(completionRate * 100), listeners: s.total }
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
  }
}

module.exports = new RecommendationManager()
