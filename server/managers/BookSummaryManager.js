const Logger = require('../Logger')
const LlmProvider = require('./LlmProvider')
const fs = require('../libs/fsExtra')
const Path = require('path')
const { execFile } = require('child_process')

const STYLE_PROMPTS = {
  executive: 'You are a professional book summarizer in the style of getAbstract and Headway.\nCreate a structured summary of this book.',
  casual: 'You are a friendly book summarizer in the style of Blinkist and Headway.\nCreate an engaging, conversational summary of this book. Use simple language and relatable examples.',
  academic: 'You are an academic book summarizer.\nCreate a rigorous, well-structured summary with emphasis on methodology, evidence, and scholarly context.'
}

const LENGTH_CHARS = { short: 100000, medium: 300000, long: 500000 }

const PIPER_MODELS = {
  en: 'en_US-lessac-medium', fr: 'fr_FR-siwis-medium', de: 'de_DE-thorsten-medium',
  es: 'es_ES-sharvard-medium', it: 'it_IT-riccardo-x_low', nl: 'nl_NL-mls-medium',
  pt: 'pt_BR-faber-medium', ru: 'ru_RU-irina-medium', zh: 'zh_CN-huayan-medium',
  ja: 'ja_JP-kokoro-medium', ko: 'ko_KR-kss-x_low'
}

class BookSummaryManager {
  constructor() {
    this.ttsEngine = process.env.TTS_ENGINE || 'piper'
    this.ttsBin = process.env.TTS_BIN || 'piper'
  }

  /**
   * Generate a structured book summary via LLM
   * @param {string} bookId
   * @param {object} options - { style, length, language }
   * @returns {Promise<object>} parsed summary JSON
   */
  async generateSummary(bookId, options = {}) {
    const Database = require('../Database')
    const SyncManager = require('./SyncManager')

    const book = await Database.bookModel.findByPk(bookId)
    if (!book?.ebookFile) throw new Error('Book not found or has no ebook file')

    const style = options.style || 'executive'
    const length = options.length || 'medium'
    const maxChars = LENGTH_CHARS[length] || LENGTH_CHARS.medium

    const fullText = await SyncManager.extractEbookText(book.ebookFile.metadata.path, maxChars)
    if (!fullText) throw new Error('Could not extract text from ebook')

    // Sample from multiple points for better coverage
    const text = this._sampleText(fullText, maxChars)

    const systemPrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.executive
    const langInstruction = options.language ? `\nRespond in ${options.language}.` : ''

    const userPrompt = `${systemPrompt}${langInstruction}

Format your response as JSON:
{
  "title": "...",
  "author": "...",
  "oneLiner": "One sentence hook",
  "keyInsight": "The single most important takeaway",
  "summary": "3-5 paragraph executive summary",
  "keyPoints": ["point 1", "point 2", ...],
  "actionItems": ["action 1", ...],
  "quotes": ["memorable quote 1", ...],
  "whoShouldRead": "description of ideal reader",
  "readingTime": "X minutes"
}

Provide 5-10 key points, 3-5 actionable takeaways (for non-fiction), and 3-5 notable quotes from the text.

Book text:
${text}`

    Logger.info(`[BookSummary] Generating ${style}/${length} summary for "${book.title}"`)

    const raw = await LlmProvider.complete(systemPrompt, userPrompt, { maxTokens: 4000, timeout: 120000 })
    if (!raw) throw new Error('LLM returned empty response')

    // Parse JSON from response (handle markdown code fences)
    const jsonStr = raw.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim()
    let summary
    try {
      summary = JSON.parse(jsonStr)
    } catch {
      throw new Error('Failed to parse summary JSON from LLM response')
    }

    summary.style = style
    summary.length = length
    summary.generatedAt = new Date().toISOString()
    summary.bookId = bookId

    // Persist
    const outDir = Path.join(global.MetadataPath, 'summaries', bookId)
    await fs.ensureDir(outDir)
    const outPath = Path.join(outDir, `${style}_${length}_${Date.now()}.json`)
    await fs.writeFile(outPath, JSON.stringify(summary, null, 2))

    Logger.info(`[BookSummary] Saved summary to ${outPath}`)
    return summary
  }

  /**
   * Generate audio version of a book summary
   * @param {string} bookId
   * @param {object} options - same as generateSummary + tts options
   * @returns {Promise<{textSummary: object, audioPath: string, duration: number}>}
   */
  async generateAudioSummary(bookId, options = {}) {
    const textSummary = await this.generateSummary(bookId, options)

    // Build narration script from summary
    const script = this._buildNarrationScript(textSummary)

    const outDir = Path.join(global.MetadataPath, 'summaries', bookId)
    await fs.ensureDir(outDir)
    const wavPath = Path.join(outDir, `audio_${textSummary.style}_${Date.now()}.wav`)
    const mp3Path = wavPath.replace('.wav', '.mp3')

    // Generate TTS
    const lang = (options.language || textSummary.language || 'en').slice(0, 2).toLowerCase()
    await this._generateTts(script, lang, wavPath)

    // Convert wav → mp3
    await new Promise((resolve, reject) => {
      execFile('ffmpeg', ['-y', '-i', wavPath, '-codec:a', 'libmp3lame', '-q:a', '4', mp3Path],
        { timeout: 60000 }, (err) => err ? reject(err) : resolve())
    })

    // Get duration
    const duration = await this._getAudioDuration(mp3Path)

    // Clean up wav
    await fs.remove(wavPath).catch(() => {})

    Logger.info(`[BookSummary] Audio summary saved to ${mp3Path} (${duration}s)`)
    return { textSummary, audioPath: mp3Path, duration }
  }

  /**
   * List existing summaries for a book
   * @param {string} bookId
   * @returns {Promise<Array>}
   */
  async getSummaries(bookId) {
    const dir = Path.join(global.MetadataPath, 'summaries', bookId)
    if (!await fs.pathExists(dir)) return []

    const files = await fs.readdir(dir)
    const summaries = []

    for (const f of files) {
      const filePath = Path.join(dir, f)
      const stat = await fs.stat(filePath)
      if (f.endsWith('.json')) {
        try {
          const data = JSON.parse(await fs.readFile(filePath, 'utf8'))
          summaries.push({ ...data, file: f, size: stat.size })
        } catch { summaries.push({ file: f, size: stat.size, error: 'parse_failed' }) }
      } else if (f.endsWith('.mp3')) {
        summaries.push({ file: f, type: 'audio', size: stat.size, createdAt: stat.birthtime })
      }
    }
    return summaries
  }

  /**
   * Sample text from multiple points in the book for better coverage
   */
  _sampleText(text, maxChars) {
    if (text.length <= maxChars) return text
    const sampleSize = Math.floor(maxChars / 3)
    const mid = Math.floor(text.length / 2)
    const start = text.slice(0, sampleSize)
    const middle = text.slice(mid - sampleSize / 2, mid + sampleSize / 2)
    const end = text.slice(-sampleSize)
    return `[Beginning]\n${start}\n\n[Middle]\n${middle}\n\n[End]\n${end}`
  }

  /**
   * Build a narration script from structured summary
   */
  _buildNarrationScript(summary) {
    const parts = []
    parts.push(`${summary.title} by ${summary.author || 'Unknown'}.`)
    if (summary.oneLiner) parts.push(summary.oneLiner)
    if (summary.summary) parts.push(summary.summary)
    if (summary.keyPoints?.length) {
      parts.push('Key points.')
      summary.keyPoints.forEach((p, i) => parts.push(`${i + 1}. ${p}`))
    }
    if (summary.actionItems?.length) {
      parts.push('Action items.')
      summary.actionItems.forEach((a, i) => parts.push(`${i + 1}. ${a}`))
    }
    if (summary.keyInsight) parts.push(`Key insight: ${summary.keyInsight}`)
    return parts.join('\n\n')
  }

  async _generateTts(text, lang, outputPath) {
    await fs.ensureDir(Path.dirname(outputPath))

    if (this.ttsEngine === 'piper') {
      const model = PIPER_MODELS[lang] || PIPER_MODELS.en
      return new Promise((resolve, reject) => {
        const proc = execFile(this.ttsBin, ['--model', model, '--output_file', outputPath],
          { timeout: 120000 }, (err) => err ? reject(err) : resolve(outputPath))
        proc.stdin.write(text)
        proc.stdin.end()
      })
    }
    // Fallback: espeak
    return new Promise((resolve, reject) => {
      execFile('espeak', ['-v', lang || 'en', '-w', outputPath, text],
        { timeout: 60000 }, (err) => err ? reject(err) : resolve(outputPath))
    })
  }

  async _getAudioDuration(filePath) {
    return new Promise((resolve) => {
      execFile('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
        { timeout: 10000 }, (err, stdout) => resolve(parseFloat(stdout) || 0))
    })
  }
}

module.exports = new BookSummaryManager()
