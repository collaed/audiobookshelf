const axios = require('axios').default
const Logger = require('../Logger')

class LibriVox {
  #responseTimeout = 10000

  constructor() {
    this.baseUrl = 'https://librivox.org/api/feed/audiobooks'
  }

  /**
   * @param {Object} params
   * @param {number} [timeout]
   * @returns {Promise<Object[]>}
   */
  async get(params, timeout = this.#responseTimeout) {
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout
    params.format = 'json'
    const query = new URLSearchParams(params).toString()
    const url = `${this.baseUrl}?${query}`
    Logger.debug(`[LibriVox] Request: ${url}`)
    return axios
      .get(url, { timeout })
      .then((res) => res.data?.books || [])
      .catch((error) => {
        Logger.error('[LibriVox] Request error', error.message)
        return []
      })
  }

  /**
   * @param {Object} book - Raw LibriVox book object
   * @returns {Object}
   */
  cleanResult(book) {
    const authorName = book.authors?.map((a) => [a.first_name, a.last_name].filter(Boolean).join(' ')).join(', ') || null
    return {
      title: book.title,
      author: authorName,
      description: book.description,
      language: book.language,
      year: book.copyright_year || null,
      duration: book.totaltime || null,
      durationSeconds: book.totaltimesecs ? Number(book.totaltimesecs) : 0,
      sections: book.num_sections ? Number(book.num_sections) : 0,
      rssUrl: book.url_rss || null,
      downloadUrl: book.url_zip_file || null,
      librivoxUrl: book.url_librivox || null,
      sourceUrl: book.url_librivox || null,
      authors: book.authors || []
    }
  }

  /**
   * @param {string} title
   * @param {string} [author]
   * @param {number} [limit]
   * @returns {Promise<Object[]>}
   */
  async search(title, author, limit = 10) {
    const params = { limit: String(limit) }
    if (title) params.title = title
    if (author) params.author = author
    const books = await this.get(params)
    return books.map((b) => this.cleanResult(b))
  }

  /**
   * @param {string|number} id
   * @returns {Promise<Object|null>}
   */
  async getById(id) {
    const books = await this.get({ id: String(id) })
    return books.length ? this.cleanResult(books[0]) : null
  }

  /**
   * @param {string} authorName
   * @param {number} [limit]
   * @returns {Promise<Object[]>}
   */
  async getByAuthor(authorName, limit = 25) {
    const books = await this.get({ author: authorName, limit: String(limit) })
    return books.map((b) => this.cleanResult(b))
  }

  /**
   * @param {number} [limit]
   * @returns {Promise<Object[]>}
   */
  async getRecent(limit = 25) {
    const books = await this.get({ limit: String(limit), sort: 'recent' })
    return books.map((b) => this.cleanResult(b))
  }
}

module.exports = LibriVox
