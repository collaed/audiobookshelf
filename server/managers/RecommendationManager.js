const Logger = require('../Logger')
const Database = require('../Database')
const natural = require('natural')
const stopwords = natural.stopwords

const WEIGHTS = { author: 2.0, narrator: 1.5, genre: 1.0, series: 1.5, theme: 0.5 }

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
    const tokenizer = new natural.WordTokenizer()
    const tokens = tokenizer.tokenize(text.toLowerCase().replace(/<[^>]+>/g, ''))
    const themes = {}
    for (const word of tokens) {
      if (word.length > 3 && !stopwords.includes(word)) {
        themes[word] = (themes[word] || 0) + 1
      }
    }
    return themes
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
    // Get all progress (not just finished) for implicit ratings
    const progresses = await Database.mediaProgressModel.findAll({
      where: { userId, mediaItemType: 'book' }
    })
    if (!progresses.length) return null

    const progressMap = new Map()
    for (const p of progresses) {
      const pct = p.duration ? p.currentTime / p.duration : 0
      progressMap.set(p.mediaItemId, { isFinished: p.isFinished, pct, rating: p.rating })
    }

    const bookIds = [...progressMap.keys()]
    const books = await Database.bookModel.findAll({
      where: { id: bookIds },
      include: [
        { model: Database.authorModel, through: { attributes: [] } },
        { model: Database.seriesModel, through: { attributes: [] }, required: false }
      ]
    })

    const genres = {}, authors = {}, narrators = {}, series = {}, themes = {}
    const lowGenres = {} // genres from abandoned/low-rated books
    let totalDuration = 0

    for (const book of books) {
      const prog = progressMap.get(book.id) || {}
      // Book Genome: implicit rating from progress
      let rating = prog.rating
      if (!rating) {
        if (prog.isFinished || prog.pct > 0.8) rating = 8
        else if (prog.pct > 0.5) rating = 7
        else if (prog.pct > 0.1) rating = 6
        else rating = 4 // started but abandoned
      }

      const weight = (rating - 5) / 5.0 // CineCross formula: -1.0 to +1.0

      if (weight > 0) {
        this.tallyWeighted(genres, book.genres, weight)
        this.tallyWeighted(narrators, book.narrators, weight)
        if (book.authors) this.tallyWeighted(authors, book.authors.map((a) => a.name), weight)
        if (book.series) this.tallyWeighted(series, book.series.map((s) => s.name), weight)
        if (book.description) {
          const bookThemes = this.extractThemes(book.description)
          for (const [word, count] of Object.entries(bookThemes)) {
            themes[word] = (themes[word] || 0) + count * weight
          }
        }
      } else {
        // Track genres from abandoned/disliked books for anti-recs
        this.tallyWeighted(lowGenres, book.genres, Math.abs(weight))
      }
      totalDuration += book.duration || 0
    }

    const profile = {
      userId, genres, authors, narrators, series, themes, lowGenres,
      topGenres: this.topN(genres, 10),
      topAuthors: this.topN(authors, 10),
      topNarrators: this.topN(narrators, 10),
      topSeries: this.topN(series, 5),
      topThemes: this.topN(themes, 20),
      avgBookLength: books.length ? totalDuration / books.length : 0,
      totalListeningTime: totalDuration,
      booksFinished: books.filter((b) => progressMap.get(b.id)?.isFinished).length,
      booksStarted: books.length,
      readBookIds: new Set(bookIds),
      updatedAt: Date.now()
    }

    this.profiles.set(userId, profile)
    return profile
  }

  tallyWeighted(map, items, weight) {
    if (!items) return
    for (const item of items) {
      if (item) map[item] = (map[item] || 0) + weight
    }
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
      dna_match: () => this.getDnaMatch(profile, readBookIds),
      authors: () => this.getAuthorsYouLove(profile, readBookIds),
      authors_you_love: () => this.getAuthorsYouLove(profile, readBookIds),
      narrators: () => this.getNarratorsYouLove(profile, readBookIds),
      narrators_you_love: () => this.getNarratorsYouLove(profile, readBookIds),
      series: () => this.getCompleteSeries(userId),
      complete_series: () => this.getCompleteSeries(userId),
      gems: () => this.getHiddenGems(profile, readBookIds),
      hidden_gems: () => this.getHiddenGems(profile, readBookIds),
      anti: () => this.getAntiRecommendations(profile, readBookIds),
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
  /**
   * Book Genome scoring — weighted taste profile match.
   * Ported from CineCross Movie Genome via BrainyCat.
   * authors: 2.0x, narrators: 1.5x, series: 1.5x, genres: 1.0x, themes: 0.5x
   * Rating boost: score *= (0.5 + avgRating/20)
   */
  scoreBook(book, profile) {
    let score = 0

    if (book.genres) {
      for (const g of book.genres) score += (profile.genres[g] || 0) * WEIGHTS.genre
    }
    if (book.narrators) {
      for (const n of book.narrators) score += (profile.narrators[n] || 0) * WEIGHTS.narrator
    }
    if (book.authorNames) {
      for (const a of book.authorNames) score += (profile.authors[a] || 0) * WEIGHTS.author
    }
    if (book.seriesNames) {
      for (const s of book.seriesNames) score += (profile.series[s] || 0) * WEIGHTS.series
    }
    if (book.description) {
      const bookThemes = this.extractThemes(book.description)
      for (const [word, count] of Object.entries(bookThemes)) {
        if (profile.themes[word]) score += Math.min(count, 3) * profile.themes[word] * WEIGHTS.theme
      }
    }

    // Rating boost (CineCross formula)
    if (book.avgRating) score *= (0.5 + book.avgRating / 20)

    return Math.round(score * 100) / 100
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
        if (!s || s.total > 10 || s.total === 0) return null
        const completionRate = s.finished / s.total
        const genreMatch = b.genres.some((g) => topGenreSet.has(g))
        if (completionRate < 0.5 || !genreMatch) return null
        return { ...b, score: Math.round(completionRate * 100), listeners: s.total }
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
  }

  /**
   * Anti-recommendations — books you'd probably dislike.
   * Based on genres/tags from abandoned or low-rated books.
   * Ported from CineCross/BrainyCat Book Genome.
   */
  async getAntiRecommendations(profile, readBookIds) {
    if (!profile.lowGenres || !Object.keys(profile.lowGenres).length) return []
    const books = await this.getUnreadBooks(readBookIds)
    const lowGenreSet = new Set(Object.keys(profile.lowGenres))

    return books
      .map((b) => {
        const matchedGenres = (b.genres || []).filter((g) => lowGenreSet.has(g))
        if (!matchedGenres.length) return null
        const antiScore = matchedGenres.reduce((s, g) => s + (profile.lowGenres[g] || 0), 0)
        return { ...b, antiScore: Math.round(antiScore * 100) / 100, reason: `genres: ${matchedGenres.join(', ')}` }
      })
      .filter(Boolean)
      .sort((a, b) => b.antiScore - a.antiScore)
      .slice(0, 10)
  }
}

// Aliases for controller compatibility
RecommendationManager.prototype.getProfile = RecommendationManager.prototype.buildProfile
RecommendationManager.prototype.rebuildProfile = RecommendationManager.prototype.buildProfile

module.exports = new RecommendationManager()
