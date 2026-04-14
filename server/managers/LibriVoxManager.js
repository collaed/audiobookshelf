const Logger = require('../Logger')
const LibriVox = require('../providers/LibriVox')
const fs = require('../libs/fsExtra')
const Path = require('path')
const axios = require('axios').default
const { parseDocument } = require('htmlparser2')
const { exec } = require('child_process')

class LibriVoxManager {
  constructor() {
    this.librivox = new LibriVox()
  }

  /**
   * @param {string} query
   * @param {number} [limit]
   * @returns {Promise<Object[]>}
   */
  async search(query, limit = 20) {
    Logger.info(`[LibriVoxManager] Searching: "${query}"`)
    return this.librivox.search(query, null, limit)
  }

  /**
   * @param {number} [page]
   * @param {number} [limit]
   * @returns {Promise<Object[]>}
   */
  async browse(page = 1, limit = 25) {
    const offset = (page - 1) * limit
    const books = await this.librivox.get({ offset: String(offset), limit: String(limit), sort: 'recent' })
    return books.map((b) => this.librivox.cleanResult(b))
  }

  /**
   * @param {string|number} librivoxId
   * @returns {Promise<Object|null>}
   */
  async getDetails(librivoxId) {
    const book = await this.librivox.getById(librivoxId)
    if (!book) return null
    if (book.rssUrl) {
      book.chapters = await this.getChaptersFromRss(book.rssUrl)
    }
    return book
  }

  /**
   * @param {string} rssUrl
   * @returns {Promise<Object[]>}
   */
  async getChaptersFromRss(rssUrl) {
    try {
      const { data } = await axios.get(rssUrl, { timeout: 10000 })
      const doc = parseDocument(data, { xmlMode: true })
      const chapters = []

      const findElements = (node, tagName) => {
        const results = []
        if (node.children) {
          for (const child of node.children) {
            if (child.name === tagName) results.push(child)
            else results.push(...findElements(child, tagName))
          }
        }
        return results
      }

      const getText = (node, tagName) => {
        const els = findElements(node, tagName)
        if (!els.length) return null
        const el = els[0]
        return el.children?.[0]?.data || null
      }

      const items = findElements(doc, 'item')
      for (const item of items) {
        const title = getText(item, 'title')
        const enclosures = findElements(item, 'enclosure')
        const url = enclosures[0]?.attribs?.url || null
        const durationText = getText(item, 'itunes:duration')
        chapters.push({ title, url, duration: durationText || null })
      }
      return chapters
    } catch (error) {
      Logger.error(`[LibriVoxManager] Failed to parse RSS: ${rssUrl}`, error.message)
      return []
    }
  }

  /**
   * @param {string|number} librivoxId
   * @param {string} libraryFolderPath
   * @returns {Promise<Object>}
   */
  async downloadToLibrary(librivoxId, libraryFolderPath) {
    const book = await this.librivox.getById(librivoxId)
    if (!book) throw new Error(`LibriVox book not found: ${librivoxId}`)
    if (!book.downloadUrl) throw new Error(`No download URL for book: ${librivoxId}`)

    const author = book.author || 'Unknown Author'
    const title = book.title || 'Unknown Title'
    const destDir = Path.join(libraryFolderPath, author, title)
    await fs.ensureDir(destDir)

    const tmpZip = Path.join(destDir, '_download.zip')
    Logger.info(`[LibriVoxManager] Downloading ${book.downloadUrl} to ${tmpZip}`)

    const response = await axios.get(book.downloadUrl, { responseType: 'stream', timeout: 300000 })
    const writer = fs.createWriteStream(tmpZip)
    response.data.pipe(writer)
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve)
      writer.on('error', reject)
    })

    await new Promise((resolve, reject) => {
      exec(`unzip -o -j "${tmpZip}" "*.mp3" -d "${destDir}"`, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })

    await fs.unlink(tmpZip).catch(() => {})

    const allFiles = await fs.readdir(destDir)
    const files = allFiles.filter((f) => f.toLowerCase().endsWith('.mp3'))

    Logger.info(`[LibriVoxManager] Downloaded ${files.length} files to ${destDir}`)
    return { path: destDir, title, author, files }
  }
}

module.exports = new LibriVoxManager()
