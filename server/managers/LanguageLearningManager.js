const Path = require('path')
const { execFile } = require('child_process')
const Logger = require('../Logger')
const Database = require('../Database')
const fs = require('../libs/fsExtra')

/**
 * Language learning mode: interleave two versions of the same book
 * in different languages — sentence by sentence or paragraph by paragraph.
 *
 * Supports:
 * - Ebook + Ebook (two languages, text interleaving)
 * - Audiobook + TTS (native audio + TTS of translation, audio interleaving)
 * - Audiobook + Audiobook (two language editions, audio interleaving)
 * - Mixed: native audio sentence → translated text overlay
 *
 * Uses Whisper STT for alignment and system TTS for speech generation.
 */
class LanguageLearningManager {
  constructor() {
    this.ttsEngine = process.env.TTS_ENGINE || 'piper' // piper (local) or espeak
    this.ttsBin = process.env.TTS_BIN || 'piper'
    this.whisperBin = process.env.WHISPER_BIN || 'whisper'
  }

  /**
   * Split text into sentences
   */
  splitSentences(text) {
    return text
      .replace(/([.!?…])\s+/g, '$1\n')
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 5)
  }

  /**
   * Align two texts sentence-by-sentence using sequence matching.
   * Handles different sentence counts (translations rarely match 1:1).
   * Groups by paragraph breaks when available.
   */
  alignTexts(textA, textB, mode = 'sentence') {
    const splitter = mode === 'paragraph'
      ? (t) => t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
      : (t) => this.splitSentences(t)

    const segsA = splitter(textA)
    const segsB = splitter(textB)

    // Simple proportional alignment: map segments by position ratio
    const pairs = []
    const ratio = segsB.length / Math.max(segsA.length, 1)

    for (let i = 0; i < segsA.length; i++) {
      const j = Math.min(Math.floor(i * ratio), segsB.length - 1)
      pairs.push({ source: segsA[i], target: segsB[j] || '', indexA: i, indexB: j })
    }

    return pairs
  }

  /**
   * Generate interleaved ebook (HTML/EPUB-ready)
   * Alternates between source and target language
   */
  async generateInterleavedText(bookIdA, bookIdB, options = {}) {
    const mode = options.mode || 'sentence' // sentence | paragraph
    const pattern = options.pattern || 'ab' // ab = alternating, aab = 2 source + 1 target, aba = source-target-source

    const SyncManager = require('./SyncManager')
    const textA = await SyncManager.extractEbookText(
      (await Database.bookModel.findByPk(bookIdA)).ebookFile.metadata.path, 1000000
    )
    const textB = await SyncManager.extractEbookText(
      (await Database.bookModel.findByPk(bookIdB)).ebookFile.metadata.path, 1000000
    )

    const bookA = await Database.bookModel.findByPk(bookIdA)
    const bookB = await Database.bookModel.findByPk(bookIdB)

    const pairs = this.alignTexts(textA, textB, mode)

    // Build interleaved HTML
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  .lang-a { color: #1a1a2e; margin: 0.3em 0; }
  .lang-b { color: #16537e; font-style: italic; margin: 0.3em 0 0.8em 0; }
  .pair { border-bottom: 1px solid #eee; padding: 0.5em 0; }
</style>
<title>${bookA.title} / ${bookB.title}</title></head><body>
<h1>${bookA.title} <small>(${bookA.language || '?'})</small></h1>
<h2>${bookB.title} <small>(${bookB.language || '?'})</small></h2>\n`

    for (const pair of pairs) {
      html += `<div class="pair">\n`
      if (pattern === 'ab' || pattern === 'aab' || pattern === 'aba') {
        html += `  <p class="lang-a">${this.escapeHtml(pair.source)}</p>\n`
      }
      if (pattern === 'aab') {
        // Show next source sentence too before target
        const next = pairs[pair.indexA + 1]
        if (next) html += `  <p class="lang-a">${this.escapeHtml(next.source)}</p>\n`
      }
      html += `  <p class="lang-b">${this.escapeHtml(pair.target)}</p>\n`
      if (pattern === 'aba') {
        html += `  <p class="lang-a">${this.escapeHtml(pair.source)}</p>\n`
      }
      html += `</div>\n`
    }

    html += `</body></html>`

    // Save to metadata folder
    const outputPath = Path.join(global.MetadataPath, 'interleaved',
      `${bookA.id}_${bookB.id}_${mode}_${pattern}.html`)
    await fs.ensureDir(Path.dirname(outputPath))
    await fs.writeFile(outputPath, html)

    return {
      outputPath,
      pairs: pairs.length,
      languageA: bookA.language,
      languageB: bookB.language,
      titleA: bookA.title,
      titleB: bookB.title,
      mode,
      pattern
    }
  }

  /**
   * Generate TTS audio for a text segment
   * @returns {Promise<string>} path to generated wav file
   */
  async generateTts(text, language, outputPath) {
    await fs.ensureDir(Path.dirname(outputPath))

    if (this.ttsEngine === 'piper') {
      // Piper: fast local TTS, many languages
      // Model naming: en_US-lessac-medium, fr_FR-siwis-medium, de_DE-thorsten-medium, etc.
      const modelMap = {
        en: 'en_US-lessac-medium', fr: 'fr_FR-siwis-medium', de: 'de_DE-thorsten-medium',
        es: 'es_ES-sharvard-medium', it: 'it_IT-riccardo-x_low', nl: 'nl_NL-mls-medium',
        pt: 'pt_BR-faber-medium', ru: 'ru_RU-irina-medium', zh: 'zh_CN-huayan-medium',
        ja: 'ja_JP-kokoro-medium', ko: 'ko_KR-kss-x_low',
      }
      const lang = (language || 'en').slice(0, 2).toLowerCase()
      const model = modelMap[lang] || modelMap.en

      return new Promise((resolve, reject) => {
        const proc = execFile(this.ttsBin, ['--model', model, '--output_file', outputPath],
          { timeout: 30000 }, (err) => err ? reject(err) : resolve(outputPath))
        proc.stdin.write(text)
        proc.stdin.end()
      })
    } else {
      // Fallback: espeak (available everywhere)
      const langMap = { en: 'en', fr: 'fr', de: 'de', es: 'es', it: 'it', nl: 'nl', pt: 'pt', ru: 'ru' }
      const lang = langMap[(language || 'en').slice(0, 2).toLowerCase()] || 'en'
      return new Promise((resolve, reject) => {
        execFile('espeak', ['-v', lang, '-w', outputPath, text],
          { timeout: 15000 }, (err) => err ? reject(err) : resolve(outputPath))
      })
    }
  }

  /**
   * Generate interleaved audio: native audiobook sentence → TTS translation sentence
   * Produces a single audio file alternating between languages.
   */
  async generateInterleavedAudio(audioBookId, ebookTranslationId, options = {}) {
    const SyncManager = require('./SyncManager')
    const audioBook = await Database.bookModel.findByPk(audioBookId)
    const transBook = await Database.bookModel.findByPk(ebookTranslationId)

    if (!audioBook?.audioFiles?.length) throw new Error('No audio files in source book')
    if (!transBook?.ebookFile) throw new Error('No ebook file for translation')

    const maxPairs = options.maxPairs || 50 // limit for reasonable file size
    const pauseDuration = options.pauseMs || 800 // pause between languages in ms

    // Transcribe audio to get timestamped sentences
    const firstAudio = audioBook.audioFiles[0]
    const transcript = await SyncManager.transcribeSample(firstAudio.metadata.path, 0, 300, audioBook.language)

    // Get translation text
    const transText = await SyncManager.extractEbookText(transBook.ebookFile.metadata.path, 50000)
    const transSentences = this.splitSentences(transText)

    // Align transcript segments to translation sentences
    const segments = transcript.segments || []
    const ratio = transSentences.length / Math.max(segments.length, 1)

    const tmpDir = Path.join(require('os').tmpdir(), `abs_interleave_${Date.now()}`)
    await fs.ensureDir(tmpDir)

    const parts = [] // list of audio file paths to concatenate
    const pairsUsed = Math.min(segments.length, maxPairs, transSentences.length)

    for (let i = 0; i < pairsUsed; i++) {
      const seg = segments[i]
      const transIdx = Math.min(Math.floor(i * ratio), transSentences.length - 1)
      const transSentence = transSentences[transIdx]

      // Extract original audio segment
      const segPath = Path.join(tmpDir, `orig_${i}.wav`)
      await new Promise((resolve, reject) => {
        execFile('ffmpeg', ['-y', '-ss', String(seg.start), '-i', firstAudio.metadata.path,
          '-t', String(seg.end - seg.start), '-ac', '1', '-ar', '22050', segPath],
          { timeout: 10000 }, (err) => err ? reject(err) : resolve())
      })
      parts.push(segPath)

      // Generate silence gap
      const silencePath = Path.join(tmpDir, `silence_${i}.wav`)
      await new Promise((resolve, reject) => {
        execFile('ffmpeg', ['-y', '-f', 'lavfi', '-i',
          `anullsrc=r=22050:cl=mono`, '-t', String(pauseDuration / 1000), silencePath],
          { timeout: 5000 }, (err) => err ? reject(err) : resolve())
      })
      parts.push(silencePath)

      // Generate TTS of translation
      const ttsPath = Path.join(tmpDir, `tts_${i}.wav`)
      try {
        await this.generateTts(transSentence, transBook.language, ttsPath)
        // Resample to match
        const ttsResampled = Path.join(tmpDir, `tts_r_${i}.wav`)
        await new Promise((resolve, reject) => {
          execFile('ffmpeg', ['-y', '-i', ttsPath, '-ac', '1', '-ar', '22050', ttsResampled],
            { timeout: 10000 }, (err) => err ? reject(err) : resolve())
        })
        parts.push(ttsResampled)
      } catch (err) {
        Logger.warn(`[LanguageLearning] TTS failed for segment ${i}: ${err.message}`)
      }

      parts.push(silencePath) // gap after TTS too
    }

    // Concatenate all parts
    const listFile = Path.join(tmpDir, 'concat.txt')
    await fs.writeFile(listFile, parts.map((p) => `file '${p}'`).join('\n'))

    const outputPath = Path.join(global.MetadataPath, 'interleaved',
      `${audioBookId}_${ebookTranslationId}_audio.mp3`)
    await fs.ensureDir(Path.dirname(outputPath))

    await new Promise((resolve, reject) => {
      execFile('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile,
        '-codec:a', 'libmp3lame', '-q:a', '4', outputPath],
        { timeout: 600000 }, (err) => err ? reject(err) : resolve())
    })

    // Cleanup
    await fs.remove(tmpDir).catch(() => {})

    return {
      outputPath,
      pairsInterleaved: pairsUsed,
      sourceLanguage: audioBook.language,
      targetLanguage: transBook.language,
      sourceTitle: audioBook.title,
      targetTitle: transBook.title,
    }
  }

  escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
}

module.exports = new LanguageLearningManager()
