const Logger = require('../Logger')
const Database = require('../Database')

/**
 * Full-text search using SQLite FTS5.
 * Indexes book titles, authors, descriptions, and extracted text.
 */
class FtsManager {
  constructor() { this.initialized = false }

  async init() {
    try {
      await Database.sequelize.query(`
        CREATE VIRTUAL TABLE IF NOT EXISTS book_fts USING fts5(
          bookId, title, author, description, content,
          tokenize='porter unicode61'
        )
      `)
      this.initialized = true
      Logger.info('[FtsManager] FTS5 index ready')
    } catch (err) {
      Logger.error(`[FtsManager] FTS5 init failed: ${err.message}`)
    }
  }

  async indexBook(bookId) {
    if (!this.initialized) await this.init()
    const book = await Database.bookModel.findByPk(bookId, {
      include: [{ model: Database.authorModel }]
    })
    if (!book) return false

    let content = ''
    if (book.ebookFile) {
      try {
        const SyncManager = require('./SyncManager')
        content = await SyncManager.extractEbookText(book.ebookFile.metadata.path, 100000)
      } catch (err) { Logger.debug(`[FtsManager] ${err.message}`) }
    }

    const author = book.authors?.map(a => a.name).join(', ') || ''
    await Database.sequelize.query('DELETE FROM book_fts WHERE bookId = ?', { replacements: [bookId] })
    await Database.sequelize.query(
      'INSERT INTO book_fts(bookId, title, author, description, content) VALUES(?, ?, ?, ?, ?)',
      { replacements: [bookId, book.title || '', author, (book.description || '').slice(0, 5000), content.slice(0, 50000)] }
    )
    return true
  }

  async indexLibrary(libraryId) {
    if (!this.initialized) await this.init()
    const items = await Database.libraryItemModel.findAll({ where: { libraryId }, attributes: ['mediaId'] })
    let indexed = 0, failed = 0
    for (const item of items) {
      try { if (await this.indexBook(item.mediaId)) indexed++; else failed++ }
      catch { failed++ }
    }
    Logger.info(`[FtsManager] Indexed ${indexed}/${items.length} books for library ${libraryId}`)
    return { indexed, failed, total: items.length }
  }

  async search(query, limit = 20) {
    if (!this.initialized) await this.init()
    if (!query) return []
    const [results] = await Database.sequelize.query(
      `SELECT bookId, title, author, snippet(book_fts, 4, '<b>', '</b>', '...', 30) as snippet, rank
       FROM book_fts WHERE book_fts MATCH ? ORDER BY rank LIMIT ?`,
      { replacements: [query, limit] }
    )
    return results
  }

  async getStatus() {
    if (!this.initialized) await this.init()
    try {
      const [[{cnt}]] = await Database.sequelize.query('SELECT COUNT(*) as cnt FROM book_fts')
      const totalBooks = await Database.bookModel.count()
      return { indexed: cnt, total: totalBooks, ready: this.initialized }
    } catch { return { indexed: 0, total: 0, ready: false } }
  }
}

module.exports = new FtsManager()
