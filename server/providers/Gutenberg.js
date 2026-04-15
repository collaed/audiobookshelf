const axios = require('axios').default
const Logger = require('../Logger')

class Gutenberg {
  #responseTimeout = 10000

  constructor() {
    this.baseUrl = 'https://gutendex.com/books/'
  }

  /**
   * @param {Object} params
   * @param {number} [timeout]
   * @returns {Promise<Object>}
   */
  async get(params, timeout = this.#responseTimeout) {
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout
    const query = new URLSearchParams(params).toString()
    const url = query ? `${this.baseUrl}?${query}` : this.baseUrl
    Logger.debug(`[Gutenberg] Request: ${url}`)
    return axios
      .get(url, { timeout })
      .then((res) => res.data || { count: 0, results: [] })
      .catch((error) => {
        Logger.error('[Gutenberg] Request error', error.message)
        return { count: 0, results: [] }
      })
  }

  /**
   * @param {Object} book - Raw Gutendex book object
   * @returns {Object}
   */
  cleanResult(book) {
    const author = book.authors?.map((a) => a.name).join(', ') || null
    const year = book.authors?.[0]?.birth_year || null
    const formats = book.formats || {}
    return {
      id: book.id,
      title: book.title,
      author,
      year,
      subjects: book.subjects || [],
      languages: book.languages || [],
      downloadCount: book.download_count || 0,
      formats: {
        epub: formats['application/epub+zip'] || null,
        text: formats['text/plain; charset=us-ascii'] || formats['text/plain'] || null,
        html: formats['text/html'] || null,
        mobi: formats['application/x-mobipocket-ebook'] || null,
        cover: formats['image/jpeg'] || null
      },
      gutenbergUrl: book.id ? `https://www.gutenberg.org/ebooks/${book.id}` : null
    }
  }

  /**
   * @param {string} query
   * @param {string} [language]
   * @param {number} [limit]
   * @returns {Promise<Object[]>}
   */
  async search(query, language = 'en', limit = 20) {
    const params = { search: query, languages: language }
    const data = await this.get(params)
    return data.results.slice(0, limit).map((b) => this.cleanResult(b))
  }

  /**
   * @param {string|number} id
   * @returns {Promise<Object|null>}
   */
  async getById(id) {
    const data = await axios
      .get(`${this.baseUrl}${id}/`, { timeout: this.#responseTimeout })
      .then((res) => res.data)
      .catch((error) => {
        Logger.error('[Gutenberg] Request error', error.message)
        return null
      })
    return data ? this.cleanResult(data) : null
  }

  /**
   * @param {string} [language]
   * @param {number} [limit]
   * @returns {Promise<Object[]>}
   */
  async getPopular(language = 'en', limit = 25) {
    const params = { languages: language, sort: 'download_count' }
    const data = await this.get(params)
    return data.results.slice(0, limit).map((b) => this.cleanResult(b))
  }

  /**
   * @param {string} subject
   * @param {string} [language]
   * @returns {Promise<Object[]>}
   */
  async getBySubject(subject, language = 'en') {
    const params = { topic: subject, languages: language }
    const data = await this.get(params)
    return data.results.map((b) => this.cleanResult(b))
  }
}

module.exports = Gutenberg
