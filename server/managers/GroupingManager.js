const Path = require('path')
const Logger = require('../Logger')
const Database = require('../Database')
const fs = require('../libs/fsExtra')
const stringSimilarity = require('string-similarity')
const natural = require('natural')
const tokenizer = new natural.WordTokenizer()

/**
 * Detects and groups related files that arrive in separate batches.
 * Handles: split audiobook chapters, multi-disc sets, companion ebooks,
 * and duplicate detection across formats.
 *
 * Inspired by Calibre's "one book, one entry" principle.
 */
class GroupingManager {
  constructor() {
    // Patterns that indicate chapter/part numbering
    this.chapterPatterns = [
      /(?:ch(?:apter)?|part|disc|cd|section|track)\s*[-_.\s]?\s*(\d+)/i,
      /(?:^|\s)(\d{1,3})\s*(?:of\s*\d+)?(?:\s*[-_.]|$)/,
      /[-_\s](\d{1,3})[-_\s]/,
    ]
    // Words to strip when comparing titles for grouping
    this.stripWords = /\b(chapter|part|disc|cd|track|section|vol(?:ume)?|book|unabridged|abridged|audiobook)\b/gi
    this.stripNumbers = /\b\d{1,3}\b/g
  }

  /**
   * Normalize a title for comparison — strip chapter/part/disc indicators
   */
  normalizeTitle(title) {
    if (!title) return ''
    return title
      .replace(this.stripWords, '')
      .replace(this.stripNumbers, '')
      .replace(/[-_.:,()\[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  }

  /**
   * Extract chapter/part/disc number from filename or title
   */
  extractSequence(name) {
    if (!name) return null
    for (const pattern of this.chapterPatterns) {
      const m = name.match(pattern)
      if (m) return parseInt(m[1])
    }
    return null
  }

  /**
   * Compare two strings for similarity (0-1)
   */
  similarity(a, b) {
    if (!a || !b) return 0
    return stringSimilarity.compareTwoStrings(a.toLowerCase(), b.toLowerCase())
  }

  /**
   * Scan incoming items and group related files together.
   * Files are grouped if they share a normalized title + author
   * and differ only by chapter/part/disc number.
   *
   * @returns {Array<{groupKey: string, title: string, author: string, items: Object[], sequences: number[]}>}
   */
  async detectGroups() {
    const items = await Database.incomingItemModel.findAll({
      where: { status: 'pending' },
      order: [['createdAt', 'ASC']]
    })

    const groups = {}
    for (const item of items) {
      const normTitle = this.normalizeTitle(item.parsedTitle || item.matchedTitle || item.fileName)
      const normAuthor = (item.parsedAuthor || item.matchedAuthor || '').toLowerCase().trim()
      const key = `${normAuthor}|||${normTitle}`

      if (!groups[key]) {
        groups[key] = {
          groupKey: key,
          title: item.parsedTitle || item.matchedTitle || item.fileName,
          author: item.parsedAuthor || item.matchedAuthor || '',
          items: [],
          sequences: []
        }
      }
      const seq = this.extractSequence(item.fileName)
      groups[key].items.push(item)
      if (seq !== null) groups[key].sequences.push(seq)
    }

    // Only return groups with multiple items
    return Object.values(groups).filter((g) => g.items.length > 1)
  }

  /**
   * Detect duplicates in the existing library.
   * A duplicate is: same normalized title + author, different format or quality.
   *
   * @returns {Array<{title: string, author: string, books: Object[]}>}
   */
  async detectDuplicates(libraryId) {
    const { Op } = require('sequelize')
    const where = {}
    if (libraryId) {
      const items = await Database.libraryItemModel.findAll({
        where: { libraryId },
        attributes: ['mediaId']
      })
      where.id = { [Op.in]: items.map((i) => i.mediaId) }
    }

    const books = await Database.bookModel.findAll({
      where,
      include: [{ model: Database.authorModel, through: { attributes: [] } }]
    })

    const groups = {}
    for (const book of books) {
      const normTitle = this.normalizeTitle(book.title)
      const author = book.authors?.[0]?.name?.toLowerCase()?.trim() || ''
      const key = `${author}|||${normTitle}`

      if (!groups[key]) groups[key] = []
      groups[key].push({
        id: book.id,
        title: book.title,
        author: book.authors?.map((a) => a.name).join(', '),
        hasAudio: !!book.audioFiles?.length,
        hasEbook: !!book.ebookFile,
        duration: book.duration,
        language: book.language,
        format: book.ebookFile?.ebookFormat || (book.audioFiles?.[0]?.format) || 'unknown'
      })
    }

    return Object.values(groups)
      .filter((g) => g.length > 1)
      .map((books) => ({
        title: books[0].title,
        author: books[0].author,
        books
      }))
  }

  /**
   * Auto-group incoming items: move related files into a single folder
   * so ABS scanner treats them as one book.
   *
   * @param {string} groupKey - from detectGroups()
   * @param {string} libraryFolderPath - target library folder
   * @returns {Object} result
   */
  async groupAndMove(groupKey, libraryFolderPath) {
    const groups = await this.detectGroups()
    const group = groups.find((g) => g.groupKey === groupKey)
    if (!group) throw new Error('Group not found')

    // Build destination: Author/Title/
    const author = group.author || 'Unknown Author'
    const title = group.title || 'Unknown Title'
    const destDir = Path.join(libraryFolderPath, this.sanitizePath(author), this.sanitizePath(title))
    await fs.ensureDir(destDir)

    const moved = []
    for (const item of group.items) {
      const src = item.filePath
      const dest = Path.join(destDir, item.fileName)
      try {
        if (await fs.pathExists(src)) {
          await fs.move(src, dest, { overwrite: false })
          await item.update({ status: 'confirmed' })
          moved.push({ from: src, to: dest })
        }
      } catch (err) {
        Logger.warn(`[GroupingManager] Failed to move ${item.fileName}: ${err.message}`)
      }
    }

    Logger.info(`[GroupingManager] Grouped ${moved.length} files into ${destDir}`)
    return { title, author, destination: destDir, filesMoved: moved.length, sequences: group.sequences.sort((a, b) => a - b) }
  }

  /**
   * Detect missing chapters/parts in a grouped set
   */
  detectMissingParts(sequences) {
    if (!sequences.length) return []
    const sorted = [...new Set(sequences)].sort((a, b) => a - b)
    const missing = []
    for (let i = sorted[0]; i <= sorted[sorted.length - 1]; i++) {
      if (!sorted.includes(i)) missing.push(i)
    }
    return missing
  }

  /**
   * Format conversion support check
   * Maps what Calibre supports for conversion
   */
  getConversionCapabilities() {
    return {
      input: ['epub', 'pdf', 'mobi', 'azw3', 'fb2', 'lit', 'lrf', 'odt', 'rtf', 'txt', 'html', 'cbz', 'cbr', 'docx'],
      output: ['epub', 'mobi', 'azw3', 'pdf', 'txt', 'html', 'fb2', 'lrf'],
      audioInput: ['mp3', 'm4a', 'm4b', 'flac', 'ogg', 'opus', 'wma', 'aac', 'wav'],
      audioOutput: ['m4b', 'mp3'],
      note: 'Ebook conversion requires Calibre CLI (ebook-convert). Audio merge uses ffmpeg.'
    }
  }

  sanitizePath(str) {
    return str.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim() || '_'
  }
}

module.exports = new GroupingManager()
