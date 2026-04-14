const Path = require('path')
const { execFile } = require('child_process')
const Logger = require('../Logger')
const Database = require('../Database')
const fs = require('../libs/fsExtra')

/**
 * Ebook format conversion using Calibre's ebook-convert CLI.
 * Calibre must be installed on the host (or in Docker image).
 *
 * Key Calibre features captured:
 * - Format conversion (epub↔mobi↔azw3↔pdf↔txt)
 * - Metadata embedding (title, author, series, cover)
 * - Auto table-of-contents generation
 * - Font/margin customization
 */
class ConversionManager {
  constructor() {
    this.calibreBin = process.env.CALIBRE_BIN || 'ebook-convert'
  }

  /**
   * Check if Calibre CLI is available
   */
  async isAvailable() {
    return new Promise((resolve) => {
      execFile(this.calibreBin, ['--version'], (err, stdout) => {
        resolve(!err && stdout.includes('calibre'))
      })
    })
  }

  /**
   * Convert an ebook to a different format
   * @param {string} inputPath - source file
   * @param {string} outputFormat - target format (epub, mobi, azw3, pdf, txt)
   * @param {Object} [options] - Calibre conversion options
   * @returns {Promise<{outputPath: string, format: string}>}
   */
  async convert(inputPath, outputFormat, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error('Calibre ebook-convert not found. Install Calibre or set CALIBRE_BIN env var.')
    }

    const ext = outputFormat.startsWith('.') ? outputFormat : `.${outputFormat}`
    const base = Path.basename(inputPath, Path.extname(inputPath))
    const outputPath = Path.join(Path.dirname(inputPath), `${base}${ext}`)

    const args = [inputPath, outputPath]

    // Calibre options
    if (options.title) args.push('--title', options.title)
    if (options.author) args.push('--authors', options.author)
    if (options.series) args.push('--series', options.series)
    if (options.seriesIndex) args.push('--series-index', String(options.seriesIndex))
    if (options.cover) args.push('--cover', options.cover)
    if (options.language) args.push('--language', options.language)

    // Output-specific options
    if (outputFormat === 'epub') {
      args.push('--epub-version', '3')
    }
    if (outputFormat === 'mobi' || outputFormat === 'azw3') {
      args.push('--mobi-file-type', 'both')
    }
    if (options.fontSize) args.push('--base-font-size', String(options.fontSize))
    if (options.margins) {
      args.push('--margin-top', String(options.margins))
      args.push('--margin-bottom', String(options.margins))
      args.push('--margin-left', String(options.margins))
      args.push('--margin-right', String(options.margins))
    }

    Logger.info(`[ConversionManager] Converting ${Path.basename(inputPath)} → ${outputFormat}`)

    return new Promise((resolve, reject) => {
      execFile(this.calibreBin, args, { timeout: 300000 }, (err, stdout, stderr) => {
        if (err) {
          Logger.error(`[ConversionManager] Conversion failed: ${stderr || err.message}`)
          return reject(new Error(stderr || err.message))
        }
        Logger.info(`[ConversionManager] Done: ${outputPath}`)
        resolve({ outputPath, format: outputFormat })
      })
    })
  }

  /**
   * Convert a library item's ebook to a different format
   * Adds the converted file alongside the original
   */
  async convertLibraryItem(bookId, outputFormat, options = {}) {
    const book = await Database.bookModel.findByPk(bookId, {
      include: [{ model: Database.authorModel }]
    })
    if (!book?.ebookFile) throw new Error('No ebook file found')

    const inputPath = book.ebookFile.metadata.path
    const convOptions = {
      title: book.title,
      author: book.authors?.map((a) => a.name).join(' & '),
      language: book.language,
      ...options
    }

    return this.convert(inputPath, outputFormat, convOptions)
  }

  /**
   * Batch convert: prepare a book for all major readers
   * Creates epub (universal), mobi (Kindle legacy), azw3 (Kindle modern)
   */
  async convertForAllReaders(bookId) {
    const results = {}
    for (const fmt of ['epub', 'mobi', 'azw3']) {
      try {
        results[fmt] = await this.convertLibraryItem(bookId, fmt)
      } catch (err) {
        results[fmt] = { error: err.message }
      }
    }
    return results
  }

  /**
   * Extract and update metadata from an ebook file using Calibre
   */
  async extractMetadata(filePath) {
    const fetchMeta = process.env.CALIBRE_META_BIN || 'ebook-meta'
    return new Promise((resolve, reject) => {
      execFile(fetchMeta, [filePath], { timeout: 30000 }, (err, stdout) => {
        if (err) return reject(err)
        const meta = {}
        for (const line of stdout.split('\n')) {
          const [key, ...val] = line.split(':')
          if (key && val.length) {
            const k = key.trim().toLowerCase().replace(/\s+/g, '_')
            meta[k] = val.join(':').trim()
          }
        }
        resolve(meta)
      })
    })
  }
}

module.exports = new ConversionManager()
