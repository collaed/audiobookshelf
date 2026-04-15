const Logger = require('../Logger')
const LlmProvider = require('./LlmProvider')
const fs = require('../libs/fsExtra')
const Path = require('path')

const SYSTEM_PROMPT = `You are a literary translator specializing in modernizing classic texts.
Modernize the following passage into contemporary English.
Rules:
- Keep the original meaning, tone, and emotional impact
- Preserve character names, place names, and proper nouns
- Replace archaic vocabulary with modern equivalents
- Simplify complex sentence structures while keeping the literary quality
- Keep metaphors and imagery, just make them accessible
- Do NOT add commentary or notes — output only the modernized text
- Match the length of the original roughly`

const CHUNK_SIZE = 2000

class ModernizeManager {
  constructor() {}

  /**
   * Modernize a single chunk of text via LLM
   */
  async modernizeChunk(text, options = {}) {
    const style = options.style || 'modern literary'
    const lang = options.language ? `\nTarget language: ${options.language}` : ''
    const system = `${SYSTEM_PROMPT}\nStyle: ${style}\n  Options: 'modern literary' (default), 'casual readable', 'young adult', 'simplified'${lang}`

    const result = await LlmProvider.complete(system, text, { maxTokens: 2000, timeout: 120000 })
    if (!result) throw new Error('LLM returned empty response')
    return result
  }

  /**
   * Split text into ~2000 char chunks on paragraph boundaries
   */
  _splitChunks(text) {
    const paragraphs = text.split(/\n\s*\n/)
    const chunks = []
    let current = ''

    for (const p of paragraphs) {
      if (current.length + p.length > CHUNK_SIZE && current.length > 0) {
        chunks.push(current.trim())
        current = ''
      }
      current += (current ? '\n\n' : '') + p
    }
    if (current.trim()) chunks.push(current.trim())
    return chunks
  }

  /**
   * Modernize an entire book
   */
  async modernizeBook(bookId, options = {}) {
    const Database = require('../Database')
    const SyncManager = require('./SyncManager')

    const book = await Database.bookModel.findByPk(bookId)
    if (!book?.ebookFile) throw new Error('Book not found or has no ebook file')

    const fullText = await SyncManager.extractEbookText(book.ebookFile.metadata.path, 500000)
    if (!fullText) throw new Error('Could not extract text from ebook')

    let textToProcess = fullText
    if (options.chapters && options.chapters !== 'all') {
      const chapters = fullText.split(/(?=chapter\s+\d|CHAPTER\s+\d|Part\s+\d|PART\s+\d)/i)
      const [start, end] = options.chapters.split('-').map(Number)
      textToProcess = chapters.slice(start - 1, end || start).join('\n\n')
    }

    const chunks = this._splitChunks(textToProcess)
    const modernized = []

    for (let i = 0; i < chunks.length; i++) {
      Logger.info(`[ModernizeManager] Processing chunk ${i + 1}/${chunks.length} for "${book.title}"`)
      const result = await this.modernizeChunk(chunks[i], options)
      modernized.push(result)
    }

    const modernizedText = modernized.join('\n\n')
    const style = options.style || 'modern literary'
    const outputDir = Path.join(global.MetadataPath, 'modernized')
    await fs.ensureDir(outputDir)
    const outputPath = Path.join(outputDir, `${bookId}_${style.replace(/\s+/g, '_')}_${Date.now()}.html`)

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${book.title} (Modernized)</title></head><body>\n${modernizedText.split('\n\n').map((p) => `<p>${p}</p>`).join('\n')}\n</body></html>`
    await fs.writeFile(outputPath, html)

    return { outputPath, chunksProcessed: chunks.length, originalLength: textToProcess.length, modernizedLength: modernizedText.length }
  }

  /**
   * Modernize a single chapter for preview
   */
  async modernizeChapter(bookId, chapterIndex, options = {}) {
    const Database = require('../Database')
    const SyncManager = require('./SyncManager')

    const book = await Database.bookModel.findByPk(bookId)
    if (!book?.ebookFile) throw new Error('Book not found or has no ebook file')

    const fullText = await SyncManager.extractEbookText(book.ebookFile.metadata.path, 500000)
    const chapters = fullText.split(/(?=chapter\s+\d|CHAPTER\s+\d|Part\s+\d|PART\s+\d)/i)
    const chapter = chapters[chapterIndex]
    if (!chapter) throw new Error(`Chapter ${chapterIndex} not found (${chapters.length} chapters detected)`)

    const chunks = this._splitChunks(chapter)
    const modernized = []
    for (const chunk of chunks) {
      modernized.push(await this.modernizeChunk(chunk, options))
    }

    return { original: chapter, modernized: modernized.join('\n\n'), chapterIndex, chunksProcessed: chunks.length }
  }

  /**
   * List existing modernized versions for a book
   */
  async getModernizedVersions(bookId) {
    const dir = Path.join(global.MetadataPath, 'modernized')
    if (!await fs.pathExists(dir)) return []

    const files = await fs.readdir(dir)
    return files
      .filter((f) => f.startsWith(bookId))
      .map((f) => ({
        filename: f,
        path: Path.join(dir, f),
        style: f.replace(`${bookId}_`, '').replace(/_\d+\.html$/, '').replace(/_/g, ' ')
      }))
  }
}

module.exports = new ModernizeManager()
