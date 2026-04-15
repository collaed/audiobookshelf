const Path = require('path')
const { execFile } = require('child_process')
const Logger = require('../Logger')
const Database = require('../Database')
const fs = require('../libs/fsExtra')

/**
 * Converts ebooks (PDF/EPUB) to audiobooks using TTS.
 * Pipeline: ebook → text extraction → chapter splitting → TTS → MP3s → library item
 */
class TextToAudiobookManager {
  constructor() {
    this.ttsEngine = process.env.TTS_ENGINE || 'piper'
    this.ttsBin = process.env.TTS_BIN || 'piper'
    this.modelMap = {
      en: 'en_US-lessac-medium', fr: 'fr_FR-siwis-medium', de: 'de_DE-thorsten-medium',
      es: 'es_ES-sharvard-medium', it: 'it_IT-riccardo-x_low', nl: 'nl_NL-mls-medium',
      pt: 'pt_BR-faber-medium', ru: 'ru_RU-irina-medium',
    }
  }

  /**
   * Convert an ebook to a full audiobook
   * @param {string} bookId
   * @param {Object} options
   * @param {string} options.voice - TTS voice/language (default: from book metadata)
   * @param {string} options.outputDir - where to save (default: alongside ebook)
   * @returns {Promise<{outputDir, chapters, totalDuration}>}
   */
  async convert(bookId, options = {}) {
    const book = await Database.bookModel.findByPk(bookId, {
      include: [{ model: Database.authorModel }]
    })
    if (!book?.ebookFile) throw new Error('This book doesn\'t have an ebook file attached.')

    const SyncManager = require('./SyncManager')
    const ebookPath = book.ebookFile.metadata.path

    Logger.info(`[TextToAudiobook] Starting conversion: ${book.title}`)

    // 1. Extract full text
    const fullText = await SyncManager.extractEbookText(ebookPath, 2000000)
    if (!fullText || fullText.length < 100) throw new Error('Could not extract text from ebook. Try running OCR first.')

    // 2. Split into chapters
    const chapters = this._splitChapters(fullText)
    Logger.info(`[TextToAudiobook] Split into ${chapters.length} chapters`)

    // 3. Determine output directory
    const author = book.authors?.[0]?.name || 'Unknown Author'
    const title = book.title || 'Unknown Title'
    const libraryItem = await Database.libraryItemModel.findOne({ where: { mediaId: bookId } })
    const outputDir = options.outputDir || Path.join(Path.dirname(ebookPath), `${title} (Audio)`)
    await fs.ensureDir(outputDir)

    // 4. Generate TTS for each chapter
    const lang = (options.voice || book.language || 'en').slice(0, 2).toLowerCase()
    const model = this.modelMap[lang] || this.modelMap.en
    const results = []
    let totalDuration = 0

    for (let i = 0; i < chapters.length; i++) {
      const chapterTitle = chapters[i].title || `Chapter ${i + 1}`
      const filename = `${String(i + 1).padStart(3, '0')} - ${chapterTitle.replace(/[<>:"/\\|?*]/g, '_')}.mp3`
      const outputPath = Path.join(outputDir, filename)

      Logger.info(`[TextToAudiobook] Generating chapter ${i + 1}/${chapters.length}: ${chapterTitle}`)

      try {
        const duration = await this._generateChapterAudio(chapters[i].text, outputPath, model, lang)
        totalDuration += duration
        results.push({ index: i + 1, title: chapterTitle, file: filename, duration })
      } catch (err) {
        Logger.error(`[TextToAudiobook] Chapter ${i + 1} failed: ${err.message}`)
        results.push({ index: i + 1, title: chapterTitle, error: err.message })
      }
    }

    Logger.info(`[TextToAudiobook] Done: ${results.filter((r) => !r.error).length}/${chapters.length} chapters, ${Math.round(totalDuration / 60)} minutes`)

    return {
      bookId,
      title: book.title,
      author,
      outputDir,
      chapters: results,
      totalChapters: chapters.length,
      successfulChapters: results.filter((r) => !r.error).length,
      totalDuration: Math.round(totalDuration),
      language: lang,
    }
  }

  /**
   * Split text into chapters using common markers
   */
  _splitChapters(text) {
    const chapterRegex = /(?=(?:^|\n)(?:CHAPTER|Chapter|PART|Part)\s+(?:\d+|[IVXLC]+|[A-Z][a-z]+)[\s.:—-])/
    const parts = text.split(chapterRegex).filter((p) => p.trim().length > 100)

    if (parts.length <= 1) {
      // No chapter markers — split by size (~5000 chars per chunk)
      const chunks = []
      for (let i = 0; i < text.length; i += 5000) {
        // Find paragraph boundary
        let end = Math.min(i + 5000, text.length)
        if (end < text.length) {
          const paraBreak = text.indexOf('\n\n', end - 200)
          if (paraBreak > 0 && paraBreak < end + 500) end = paraBreak
        }
        chunks.push({ title: `Part ${chunks.length + 1}`, text: text.slice(i, end).trim() })
      }
      return chunks
    }

    return parts.map((part, i) => {
      const firstLine = part.trim().split('\n')[0].trim()
      const title = firstLine.length < 80 ? firstLine : `Chapter ${i + 1}`
      return { title, text: part.trim() }
    })
  }

  /**
   * Generate audio for a single chapter
   */
  async _generateChapterAudio(text, outputPath, model, lang) {
    const tmpWav = outputPath.replace('.mp3', '.wav')

    if (this.ttsEngine === 'piper') {
      await new Promise((resolve, reject) => {
        const proc = execFile(this.ttsBin, ['--model', model, '--output_file', tmpWav],
          { timeout: 600000 }, (err) => err ? reject(err) : resolve())
        proc.stdin.write(text)
        proc.stdin.end()
      })
    } else {
      const voiceMap = { en: 'en', fr: 'fr', de: 'de', es: 'es', it: 'it' }
      await new Promise((resolve, reject) => {
        execFile('espeak', ['-v', voiceMap[lang] || 'en', '-w', tmpWav, text.slice(0, 50000)],
          { timeout: 300000 }, (err) => err ? reject(err) : resolve())
      })
    }

    // Convert to MP3
    await new Promise((resolve, reject) => {
      execFile('ffmpeg', ['-y', '-i', tmpWav, '-codec:a', 'libmp3lame', '-q:a', '4', outputPath],
        { timeout: 120000 }, (err) => err ? reject(err) : resolve())
    })

    // Get duration
    const duration = await this._getDuration(outputPath)
    await fs.remove(tmpWav).catch(() => {})
    return duration
  }

  async _getDuration(filePath) {
    return new Promise((resolve) => {
      execFile('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
        { timeout: 10000 }, (err, stdout) => resolve(parseFloat(stdout) || 0))
    })
  }
}

module.exports = new TextToAudiobookManager()
