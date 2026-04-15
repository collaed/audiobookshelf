const Logger = require('../Logger')
const Database = require('../Database')
const axios = require('axios').default

class RatingImportManager {
  constructor() {
    /** @type {Object|null} */
    this.lastImportStatus = null
  }

  /**
   * Parse CSV content handling quoted fields
   * @param {string} csvContent
   * @returns {Object[]}
   */
  parseCsv(csvContent) {
    const lines = csvContent.trim().split('\n')
    if (lines.length < 2) return []

    const headers = this.parseCsvLine(lines[0])
    const rows = []
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i])
      const row = {}
      headers.forEach((h, idx) => (row[h.trim()] = (values[idx] || '').trim()))
      rows.push(row)
    }
    return rows
  }

  /**
   * Parse a single CSV line handling quoted fields
   * @param {string} line
   * @returns {string[]}
   */
  parseCsvLine(line) {
    const fields = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"'
          i++
        } else if (ch === '"') {
          inQuotes = false
        } else {
          current += ch
        }
      } else if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current)
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current)
    return fields
  }

  /**
   * Try to match a book by ISBN or title+author
   * @param {string} isbn
   * @param {string} title
   * @param {string} author
   * @returns {Promise<Object|null>}
   */
  async findMatchingBook(isbn, title, author) {
    const { Op } = require('sequelize')

    // Try ISBN match first
    const cleanIsbn = (isbn || '').replace(/[="]/g, '').trim()
    if (cleanIsbn) {
      const book = await Database.bookModel.findOne({ where: { [Op.or]: [{ isbn: cleanIsbn }, { asin: cleanIsbn }] } })
      if (book) return book
    }

    // Fallback to title + author
    if (title) {
      const books = await Database.bookModel.findAll({
        where: { title: { [Op.like]: `%${title}%` } },
        include: [{ model: Database.authorModel, where: author ? { name: { [Op.like]: `%${author}%` } } : undefined, required: !!author }]
      })
      if (books.length) return books[0]
    }

    return null
  }

  /**
   * Import ratings from Goodreads CSV
   * @param {string} userId
   * @param {string} csvContent
   * @returns {Promise<{imported: number, matched: number, unmatched: number, ratings: Array}>}
   */
  async importGoodreadsCsv(userId, csvContent) {
    const rows = this.parseCsv(csvContent)
    const ratings = []
    let matched = 0
    let unmatched = 0

    for (const row of rows) {
      const rating = parseInt(row['My Rating'], 10)
      if (!rating || rating <= 0) continue

      const book = await this.findMatchingBook(row['ISBN'] || row['ISBN13'], row['Title'], row['Author'])

      const entry = { title: row['Title'], author: row['Author'], rating, bookId: null }

      if (book) {
        entry.bookId = book.id
        matched++

        // Mark as finished in MediaProgress
        const [progress] = await Database.mediaProgressModel.findOrCreate({
          where: { userId, mediaItemId: book.id },
          defaults: { userId, mediaItemId: book.id, mediaItemType: 'book', isFinished: true, finishedAt: new Date() }
        })
        if (!progress.isFinished) {
          progress.isFinished = true
          progress.finishedAt = new Date()
          await progress.save()
        }
      } else {
        unmatched++
      }

      ratings.push(entry)
    }

    const result = { imported: ratings.length, matched, unmatched, ratings }
    this.lastImportStatus = { ...result, userId, source: 'goodreads', importedAt: new Date() }
    Logger.info(`[RatingImportManager] Goodreads import for user ${userId}: ${matched} matched, ${unmatched} unmatched`)

    await this.buildProfileFromImport(userId, ratings)
    return result
  }

  /**
   * Import reading log from OpenLibrary
   * @param {string} userId
   * @param {string} openLibraryUsername
   * @returns {Promise<{imported: number, matched: number, unmatched: number, ratings: Array}>}
   */
  async importOpenLibraryRatings(userId, openLibraryUsername) {
    const url = `https://openlibrary.org/people/${encodeURIComponent(openLibraryUsername)}/books/already-read.json`
    const { data } = await axios.get(url)
    const entries = data.reading_log_entries || []

    const ratings = []
    let matched = 0
    let unmatched = 0

    for (const entry of entries) {
      const { title, author_names } = entry.work || {}
      const author = (author_names || [])[0] || ''
      const book = await this.findMatchingBook(null, title, author)

      const ratingEntry = { title, author, rating: null, bookId: null }

      if (book) {
        ratingEntry.bookId = book.id
        matched++

        const [progress] = await Database.mediaProgressModel.findOrCreate({
          where: { userId, mediaItemId: book.id },
          defaults: { userId, mediaItemId: book.id, mediaItemType: 'book', isFinished: true, finishedAt: new Date() }
        })
        if (!progress.isFinished) {
          progress.isFinished = true
          progress.finishedAt = new Date()
          await progress.save()
        }
      } else {
        unmatched++
      }

      ratings.push(ratingEntry)
    }

    const result = { imported: ratings.length, matched, unmatched, ratings }
    this.lastImportStatus = { ...result, userId, source: 'openlibrary', importedAt: new Date() }
    Logger.info(`[RatingImportManager] OpenLibrary import for user ${userId}: ${matched} matched, ${unmatched} unmatched`)

    await this.buildProfileFromImport(userId, ratings)
    return result
  }

  /**
   * Rebuild ListenerProfile from imported ratings
   * @param {string} userId
   * @param {Array<{bookId: string|null, rating: number|null}>} ratings
   */
  async buildProfileFromImport(userId, ratings) {
    const [profile] = await Database.listenerProfileModel.getOrCreateForUser(userId)

    const genreWeights = {}
    const authorWeights = {}
    const narratorWeights = {}

    for (const entry of ratings) {
      if (!entry.bookId) continue
      const weight = entry.rating || 3 // default weight for unrated (OpenLibrary)

      const book = await Database.bookModel.findByPk(entry.bookId, {
        include: [{ model: Database.authorModel }]
      })
      if (!book) continue

      for (const genre of (book.genres || [])) {
        genreWeights[genre] = (genreWeights[genre] || 0) + weight
      }
      if (book.authors) {
        for (const author of book.authors) {
          authorWeights[author.name] = (authorWeights[author.name] || 0) + weight
        }
      }
      for (const narrator of (book.narrators || [])) {
        narratorWeights[narrator] = (narratorWeights[narrator] || 0) + weight
      }
    }

    const sortDesc = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([name]) => name)

    profile.favoriteGenres = sortDesc(genreWeights).slice(0, 20)
    profile.favoriteAuthors = sortDesc(authorWeights).slice(0, 20)
    profile.favoriteNarrators = sortDesc(narratorWeights).slice(0, 20)
    profile.lastCalculatedAt = new Date()
    await profile.save()

    Logger.info(`[RatingImportManager] Rebuilt profile for user ${userId}: ${profile.favoriteGenres.length} genres, ${profile.favoriteAuthors.length} authors, ${profile.favoriteNarrators.length} narrators`)
  }
}

module.exports = new RatingImportManager()
