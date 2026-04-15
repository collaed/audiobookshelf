const Path = require('path')
const { Op } = require('sequelize')
const Logger = require('../Logger')
const SocketAuthority = require('../SocketAuthority')
const Database = require('../Database')
const fs = require('../libs/fsExtra')
const mm = require('music-metadata')

class IncomingManager {
  constructor() {
    this.incomingPath = null
    this.watcher = null
    this.audioExtensions = new Set(['.m4b', '.mp3', '.m4a', '.opus', '.flac', '.ogg'])
    this.processing = new Set()
    this.items = new Map()
    this.debounceTimers = new Map()
  }

  async init(incomingPath) {
    this.incomingPath = incomingPath || Path.join(global.MetadataPath, 'incoming')
    await fs.ensureDir(this.incomingPath)
    this.startWatching()
    Logger.info(`[IncomingManager] Watching ${this.incomingPath}`)
  }

  startWatching() {
    const nodeFs = require('fs')
    this.watcher = nodeFs.watch(this.incomingPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return
      const filePath = Path.join(this.incomingPath, filename)
      const ext = Path.extname(filename).toLowerCase()
      if (!this.audioExtensions.has(ext)) return

      if (this.debounceTimers.has(filePath)) {
        clearTimeout(this.debounceTimers.get(filePath))
      }
      this.debounceTimers.set(filePath, setTimeout(() => {
        this.debounceTimers.delete(filePath)
        this.processFile(filePath)
      }, 5000))
    })
  }

  parseFilename(filePath) {
    const relativePath = Path.relative(this.incomingPath, filePath)
    const parts = relativePath.split(Path.sep)
    const fileName = parts[parts.length - 1]
    const ext = Path.extname(fileName)
    const baseName = Path.basename(fileName, ext)

    let title = baseName
    let author = null
    let series = null
    let sequence = null

    if (parts.length === 3) {
      // /incoming/Author/Series/Book N - Title.m4b
      author = parts[0]
      series = parts[1]
      const seqMatch = baseName.match(/^Book\s+(\d+)\s*-\s*(.+)$/i)
      if (seqMatch) {
        sequence = seqMatch[1]
        title = seqMatch[2].trim()
      }
    } else if (parts.length === 2) {
      // /incoming/Author/Title.m4b
      author = parts[0]
      title = baseName
    } else {
      // /incoming/Author - Title.m4b or /incoming/Title.m4b
      const dashMatch = baseName.match(/^(.+?)\s*-\s*(.+)$/)
      if (dashMatch) {
        author = dashMatch[1].trim()
        title = dashMatch[2].trim()
      }
    }

    return { title, author, series, sequence, fileName, fileFormat: ext.slice(1) }
  }

  /**
   * @param {string} a
   * @param {string} b
   * @returns {number} 0-1 similarity score
   */
  titleSimilarity(a, b) {
    if (!a || !b) return 0
    const na = a.toLowerCase().trim()
    const nb = b.toLowerCase().trim()
    if (na === nb) return 1
    if (na.includes(nb) || nb.includes(na)) return 0.8
    return 0
  }

  async identifyBook(parsed) {
    const providers = [
      async () => {
        const Audible = require('../providers/Audible')
        const audible = new Audible()
        const results = await audible.search(parsed.title, parsed.author, null, 'us')
        return results.map((r) => ({ title: r.title, author: r.author, cover: r.cover, asin: r.asin, isbn: r.isbn, provider: 'audible' }))
      },
      async () => {
        const GoogleBooks = require('../providers/GoogleBooks')
        const g = new GoogleBooks()
        const results = await g.search(parsed.title, parsed.author)
        return results.map((r) => ({ title: r.title, author: r.author, cover: r.cover, asin: null, isbn: r.isbn, provider: 'google' }))
      },
      async () => {
        const OpenLibrary = require('../providers/OpenLibrary')
        const o = new OpenLibrary()
        const results = await o.searchTitle(parsed.title)
        if (results.errorCode) return []
        return results.map((r) => ({ title: r.title, author: r.author, cover: r.cover || (r.covers && r.covers[0]) || null, asin: null, isbn: null, provider: 'openlibrary' }))
      }
    ]

    for (const queryProvider of providers) {
      try {
        const results = await queryProvider()
        if (!results || !results.length) continue

        let bestMatch = null
        let bestScore = 0
        for (const r of results) {
          const score = this.titleSimilarity(parsed.title, r.title)
          if (score > bestScore) {
            bestScore = score
            bestMatch = r
          }
        }
        if (bestMatch && bestScore > 0) {
          return { ...bestMatch, confidence: Math.round(bestScore * 100) }
        }
      } catch (err) {
        Logger.error(`[IncomingManager] Provider error: ${err.message}`)
      }
    }
    return null
  }

  async checkDuplicate(title, author) {
    if (!title) return null
    const where = { title: { [Op.like]: title } }
    const book = await Database.bookModel.findOne({ where })
    if (!book) return null
    if (author) {
      const authors = await Database.bookAuthorModel.findAll({ where: { bookId: book.id }, include: [{ model: Database.authorModel }] })
      const authorNames = authors.map((ba) => ba.author?.name?.toLowerCase()).filter(Boolean)
      if (!authorNames.some((n) => n.includes(author.toLowerCase()))) return null
    }
    return book
  }

  async readEmbeddedMetadata(filePath) {
    try {
      const metadata = await mm.parseFile(filePath, { duration: true, skipCovers: true })
      const common = metadata.common || {}
      return {
        title: common.title || '',
        author: common.artist || common.albumartist || '',
        album: common.album || '',
        genre: (common.genre || [])[0] || '',
        year: common.year ? String(common.year) : '',
        trackNumber: common.track?.no || null,
        diskNumber: common.disk?.no || null,
        duration: metadata.format?.duration || 0,
        codec: metadata.format?.codec || '',
        bitrate: metadata.format?.bitrate ? Math.round(metadata.format.bitrate / 1000) : 0,
        sampleRate: metadata.format?.sampleRate || 0,
        channels: metadata.format?.numberOfChannels || 0,
      }
    } catch {
      return null
    }
  }

  async processFile(filePath) {
    const ext = Path.extname(filePath).toLowerCase()
    if (!this.audioExtensions.has(ext) || this.processing.has(filePath)) return

    this.processing.add(filePath)
    try {
      const parsed = this.parseFilename(filePath)

      // Try embedded metadata (more reliable than filename parsing)
      const embedded = await this.readEmbeddedMetadata(filePath)
      if (embedded) {
        if (embedded.title) parsed.title = embedded.title
        if (embedded.author) parsed.author = embedded.author
      }

      let stat
      try {
        stat = await fs.stat(filePath)
      } catch {
        this.processing.delete(filePath)
        return
      }

      const duplicate = await this.checkDuplicate(parsed.title, parsed.author)
      const identified = duplicate ? null : await this.identifyBook(parsed)

      const itemId = require('crypto').randomUUID()
      const item = {
        id: itemId,
        filePath,
        fileName: parsed.fileName,
        size: stat.size,
        parsed,
        identified,
        duplicate: duplicate ? { id: duplicate.id, title: duplicate.title } : null,
        status: duplicate ? 'duplicate' : 'pending',
        createdAt: Date.now()
      }

      this.items.set(itemId, item)
      SocketAuthority.emitter('incoming_item_added', item)
      Logger.info(`[IncomingManager] Processed incoming file: ${parsed.fileName} (${item.status})`)
    } catch (err) {
      Logger.error(`[IncomingManager] processFile error: ${err.message}`)
    } finally {
      this.processing.delete(filePath)
    }
  }

  async confirmItem(itemId, libraryId, libraryFolderId) {
    const item = this.items.get(itemId)
    if (!item) return null

    const folder = await Database.libraryFolderModel.findOne({ where: { id: libraryFolderId, libraryId } })
    if (!folder) {
      Logger.error(`[IncomingManager] Library folder not found: ${libraryFolderId}`)
      return null
    }

    const author = item.identified?.author || item.parsed.author || 'Unknown'
    const title = item.identified?.title || item.parsed.title
    const destDir = Path.join(folder.path, author, title)
    const destPath = Path.join(destDir, item.fileName)

    await fs.ensureDir(destDir)
    await fs.move(item.filePath, destPath, { overwrite: false })

    item.status = 'confirmed'
    item.destPath = destPath
    this.items.set(itemId, item)
    SocketAuthority.emitter('incoming_item_updated', item)
    Logger.info(`[IncomingManager] Confirmed: ${item.fileName} -> ${destPath}`)
    return item
  }

  async rejectItem(itemId) {
    const item = this.items.get(itemId)
    if (!item) return null
    item.status = 'rejected'
    this.items.set(itemId, item)
    SocketAuthority.emitter('incoming_item_updated', item)
    Logger.info(`[IncomingManager] Rejected: ${item.fileName}`)
    return item
  }

  async scanIncoming() {
    const entries = await fs.readdir(this.incomingPath, { withFileTypes: true })
    const walk = async (dir) => {
      const dirEntries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of dirEntries) {
        const fullPath = Path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(fullPath)
        } else if (this.audioExtensions.has(Path.extname(entry.name).toLowerCase())) {
          await this.processFile(fullPath)
        }
      }
    }
    await walk(this.incomingPath)
  }

  close() {
    if (this.watcher) this.watcher.close()
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
  }
}

module.exports = new IncomingManager()
