const Logger = require('../Logger')
const Gutenberg = require('../providers/Gutenberg')
const fs = require('../libs/fsExtra')
const Path = require('path')
const axios = require('axios').default

const FORMAT_KEYS = { epub: 'epub', mobi: 'mobi', text: 'text', html: 'html' }
const FORMAT_EXTENSIONS = { epub: '.epub', mobi: '.mobi', text: '.txt', html: '.html' }

class GutenbergManager {
  constructor() {
    this.gutenberg = new Gutenberg()
  }

  /**
   * @param {string} query
   * @param {string} [language]
   * @param {number} [limit]
   * @returns {Promise<Object[]>}
   */
  async search(query, language = 'en', limit = 20) {
    Logger.info(`[GutenbergManager] Searching: "${query}"`)
    return this.gutenberg.search(query, language, limit)
  }

  /**
   * @param {number} [page]
   * @param {number} [limit]
   * @returns {Promise<Object[]>}
   */
  async browse(page = 1, limit = 25) {
    Logger.info(`[GutenbergManager] Browsing page ${page}`)
    const data = await this.gutenberg.get({ sort: 'download_count', languages: 'en', page: String(page) })
    return data.results.slice(0, limit).map((b) => this.gutenberg.cleanResult(b))
  }

  /**
   * @param {string|number} gutenbergId
   * @returns {Promise<Object|null>}
   */
  async getDetails(gutenbergId) {
    Logger.info(`[GutenbergManager] Getting details for ${gutenbergId}`)
    return this.gutenberg.getById(gutenbergId)
  }

  /**
   * @param {string|number} gutenbergId
   * @returns {Promise<Object|null>}
   */
  async getAvailableFormats(gutenbergId) {
    const book = await this.gutenberg.getById(gutenbergId)
    if (!book) return null
    const available = {}
    for (const [key, val] of Object.entries(book.formats)) {
      if (val) available[key] = val
    }
    return { id: book.id, title: book.title, formats: available }
  }

  /**
   * @param {string|number} gutenbergId
   * @param {string} libraryFolderPath
   * @param {string} [format]
   * @returns {Promise<Object>}
   */
  async downloadToLibrary(gutenbergId, libraryFolderPath, format = 'epub') {
    const book = await this.gutenberg.getById(gutenbergId)
    if (!book) throw new Error(`Gutenberg book not found: ${gutenbergId}`)

    const formatKey = FORMAT_KEYS[format]
    const url = formatKey ? book.formats[formatKey] : null
    if (!url) throw new Error(`Format "${format}" not available for book: ${gutenbergId}`)

    const author = book.author || 'Unknown Author'
    const title = book.title || 'Unknown Title'
    const destDir = Path.join(libraryFolderPath, author, title)
    await fs.ensureDir(destDir)

    const ext = FORMAT_EXTENSIONS[format] || `.${format}`
    const destFile = Path.join(destDir, `${title}${ext}`)

    Logger.info(`[GutenbergManager] Downloading ${url} to ${destFile}`)
    const response = await axios.get(url, { responseType: 'stream', timeout: 300000 })
    const writer = fs.createWriteStream(destFile)
    response.data.pipe(writer)
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve)
      writer.on('error', reject)
    })

    Logger.info(`[GutenbergManager] Downloaded ${destFile}`)
    return { path: destDir, file: destFile, title, author, format }
  }
}

module.exports = new GutenbergManager()
