const Path = require('path')
const { create } = require('xmlbuilder2')
const Logger = require('../Logger')
const Database = require('../Database')
const fs = require('../libs/fsExtra')

/**
 * Manages delivery of audiobooks and ebooks to devices, apps, and readers.
 *
 * Delivery methods:
 * - Email (Kindle, Kobo, PocketBook, Tolino, generic)
 * - OPDS catalog (any OPDS-compatible app: KyBook, Librera, Moon+ Reader, Calibre)
 * - Direct download links (for mobile apps)
 * - Audiobookshelf mobile app (native, already supported)
 */
class DeliveryManager {
  constructor() {
    // Known e-reader email domains for auto-detection
    this.readerDomains = {
      kindle: ['@kindle.com', '@free.kindle.com'],
      kobo: ['@rakutenkobo.com'],
      pocketbook: ['@pbsync.com'],
      tolino: ['@tolino.com'],
    }
  }

  /**
   * Send ebook to a configured e-reader device by email
   * Uses existing ABS EmailManager infrastructure
   */
  async sendToDevice(bookId, deviceName, userId) {
    const book = await Database.bookModel.findByPk(bookId)
    if (!book?.ebookFile) throw new Error('No ebook file found for this book')

    const device = Database.emailSettings.getEReaderDevice(deviceName)
    if (!device) throw new Error(`Device "${deviceName}" not found`)

    const EmailManager = require('./EmailManager')
    return new Promise((resolve, reject) => {
      const mockRes = {
        status: (code) => ({ send: (msg) => reject(new Error(msg)) }),
        sendStatus: (code) => code === 200 ? resolve({ sent: true, device: deviceName, book: book.title }) : reject(new Error(`Status ${code}`))
      }
      EmailManager.sendEBookToDevice(book.ebookFile, device, mockRes)
    })
  }

  /**
   * Send ebook to Kindle specifically
   * Kindle accepts: EPUB, PDF, MOBI, AZW3, DOC, DOCX, TXT
   */
  async sendToKindle(bookId, kindleEmail) {
    const book = await Database.bookModel.findByPk(bookId)
    if (!book?.ebookFile) throw new Error('No ebook file found')

    const supportedFormats = ['epub', 'pdf', 'mobi', 'azw3', 'doc', 'docx', 'txt']
    const format = book.ebookFile.ebookFormat?.toLowerCase()
    if (!supportedFormats.includes(format)) {
      throw new Error(`Kindle doesn't support ${format}. Supported: ${supportedFormats.join(', ')}`)
    }

    const EmailManager = require('./EmailManager')
    const device = { name: 'Kindle', email: kindleEmail }
    return new Promise((resolve, reject) => {
      const mockRes = {
        status: (code) => ({ send: (msg) => reject(new Error(msg)) }),
        sendStatus: (code) => code === 200 ? resolve({ sent: true, device: 'Kindle', email: kindleEmail, book: book.title, format }) : reject(new Error(`Status ${code}`))
      }
      EmailManager.sendEBookToDevice(book.ebookFile, device, mockRes)
    })
  }

  /**
   * Detect reader type from email address
   */
  detectReaderType(email) {
    email = email.toLowerCase()
    for (const [type, domains] of Object.entries(this.readerDomains)) {
      if (domains.some((d) => email.endsWith(d))) return type
    }
    return 'generic'
  }

  /**
   * Generate OPDS catalog entry for a book
   * OPDS is supported by: KyBook, Librera, Moon+ Reader, Calibre, FBReader, Aldiko
   */
  getOpdsEntry(book, libraryItem, baseUrl) {
    const entry = {
      id: `urn:abs:${book.id}`,
      title: book.title,
      authors: [],
      summary: book.description || '',
      language: book.language || 'en',
      updated: libraryItem.updatedAt,
      links: []
    }

    // Ebook download link
    if (book.ebookFile) {
      const mimeTypes = {
        epub: 'application/epub+zip',
        pdf: 'application/pdf',
        mobi: 'application/x-mobipocket-ebook',
        azw3: 'application/x-mobi8-ebook',
        cbz: 'application/x-cbz',
        cbr: 'application/x-cbr',
      }
      const fmt = book.ebookFile.ebookFormat?.toLowerCase()
      entry.links.push({
        rel: 'http://opds-spec.org/acquisition',
        href: `${baseUrl}/api/items/${libraryItem.id}/ebook/${book.ebookFile.ino}/download`,
        type: mimeTypes[fmt] || 'application/octet-stream'
      })
    }

    // Audio download link (for apps that support audiobook streaming)
    if (book.audioFiles?.length) {
      entry.links.push({
        rel: 'http://opds-spec.org/acquisition',
        href: `${baseUrl}/api/items/${libraryItem.id}/download`,
        type: 'application/zip',
        title: 'Download audiobook (ZIP)'
      })
      // Streaming link for ABS-compatible apps
      entry.links.push({
        rel: 'http://opds-spec.org/acquisition/open-access',
        href: `${baseUrl}/api/items/${libraryItem.id}/play`,
        type: 'audio/mpeg',
        title: 'Stream audiobook'
      })
    }

    // Cover
    if (book.coverPath) {
      entry.links.push({
        rel: 'http://opds-spec.org/image',
        href: `${baseUrl}/api/items/${libraryItem.id}/cover`,
        type: 'image/jpeg'
      })
    }

    return entry
  }

  /**
   * Generate full OPDS catalog for a library
   * Returns Atom XML that any OPDS reader can consume
   */
  async generateOpdsCatalog(libraryId, baseUrl) {
    const libraryItems = await Database.libraryItemModel.findAll({
      where: { libraryId },
      include: [{ model: Database.bookModel, include: [{ model: Database.authorModel }] }],
      order: [['updatedAt', 'DESC']],
      limit: 500
    })

    const entries = libraryItems
      .filter((li) => li.book)
      .map((li) => {
        const entry = this.getOpdsEntry(li.book, li, baseUrl)
        entry.authors = li.book.authors?.map((a) => ({ name: a.name })) || []
        return entry
      })

    return this.buildOpdsXml(entries, baseUrl, libraryId)
  }

  /**
   * Build OPDS Atom XML from entries
   */
  buildOpdsXml(entries, baseUrl, libraryId) {
    const feed = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('feed', { xmlns: 'http://www.w3.org/2005/Atom', 'xmlns:opds': 'http://opds-spec.org/2010/catalog', 'xmlns:dc': 'http://purl.org/dc/elements/1.1/' })
        .ele('id').txt(`urn:abs:library:${libraryId}`).up()
        .ele('title').txt('Audiobookshelf Library').up()
        .ele('updated').txt(new Date().toISOString()).up()
        .ele('link').att('rel', 'self').att('href', `${baseUrl}/api/opds/library/${libraryId}`).att('type', 'application/atom+xml;profile=opds-catalog;kind=acquisition').up()
        .ele('link').att('rel', 'start').att('href', `${baseUrl}/api/opds`).att('type', 'application/atom+xml;profile=opds-catalog;kind=navigation').up()

    for (const e of entries) {
      const entry = feed.ele('entry')
        .ele('id').txt(e.id).up()
        .ele('title').txt(e.title).up()
        .ele('updated').txt(new Date(e.updated).toISOString()).up()
        .ele('summary').txt((e.summary || '').slice(0, 500)).up()
        .ele('dc:language').txt(e.language || 'en').up()

      for (const a of e.authors) {
        entry.ele('author').ele('name').txt(a.name).up().up()
      }
      for (const l of e.links) {
        const link = entry.ele('link').att('rel', l.rel).att('href', l.href).att('type', l.type)
        if (l.title) link.att('title', l.title)
        link.up()
      }
      entry.up()
    }

    return feed.end({ prettyPrint: true })
  }

  /**
   * Get mobile app deep links for a book
   */
  getMobileLinks(libraryItemId, baseUrl) {
    return {
      // ABS native app (iOS/Android)
      audiobookshelf: `audiobookshelf://item/${libraryItemId}`,
      // Web player
      web: `${baseUrl}/item/${libraryItemId}`,
      // Direct download
      download: `${baseUrl}/api/items/${libraryItemId}/download`,
      // Share link (if sharing enabled)
      share: `${baseUrl}/share/${libraryItemId}`,
    }
  }
}

module.exports = new DeliveryManager()
