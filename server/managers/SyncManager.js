const Path = require('path')
const { execFile } = require('child_process')
const Logger = require('../Logger')
const Database = require('../Database')
const fs = require('../libs/fsExtra')
const stringSimilarity = require('string-similarity')
const natural = require('natural')
const TfIdf = natural.TfIdf

/**
 * Matches audiobooks to ebooks and syncs them using STT (speech-to-text).
 *
 * Approach: transcribe short audio samples with Whisper, then fuzzy-match
 * the transcript against ebook text to detect pairs and align chapters.
 *
 * Requires: whisper CLI (pip install openai-whisper) or whisper.cpp
 */
class SyncManager {
  constructor() {
    this.whisperBin = process.env.WHISPER_BIN || 'whisper'
    this.sampleDuration = 60 // seconds to transcribe per chapter
    this.matchThreshold = 0.4 // minimum word overlap to consider a match
  }

  /**
   * Check if Whisper is available (intello or local)
   */
  async isAvailable() {
    // Check intello first
    const { transcribeViaIntello } = require('../utils/ttsHelper')
    if (process.env.INTELLO_URL || process.env.AIROUTER_URL) return true
    return new Promise((resolve) => {
      execFile(this.whisperBin, ['--help'], { timeout: 5000 }, (err) => resolve(!err))
    })
  }

  /**
   * Transcribe a short sample from an audio file.
   * Tries intello (Groq Whisper) first, falls back to local whisper.
   */
  async transcribeSample(audioPath, startSec = 0, duration = null, language = null) {
    duration = duration || this.sampleDuration
    const tmpDir = Path.join(require('os').tmpdir(), 'abs_sync')
    await fs.ensureDir(tmpDir)
    const samplePath = Path.join(tmpDir, `sample_${Date.now()}.wav`)

    // Extract sample with ffmpeg
    const ffArgs = ['-y', '-ss', String(startSec), '-i', audioPath, '-t', String(duration), '-ac', '1', '-ar', '16000', samplePath]
    await new Promise((resolve, reject) => {
      execFile('ffmpeg', ffArgs, { timeout: 30000 }, (err) => err ? reject(err) : resolve())
    })

    // Try intello STT first
    const { transcribeViaIntello } = require('../utils/ttsHelper')
    const intelloResult = await transcribeViaIntello(samplePath, language || '')
    if (intelloResult?.text) {
      await fs.remove(samplePath).catch(() => {})
      return { text: intelloResult.text, language: language || 'en', segments: [] }
    }

    // Fall back to local whisper
    const whisperArgs = [samplePath, '--model', 'base', '--output_format', 'json', '--output_dir', tmpDir]
    if (language) whisperArgs.push('--language', language)

    await new Promise((resolve, reject) => {
      execFile(this.whisperBin, whisperArgs, { timeout: 120000 }, (err, stdout, stderr) => {
        if (err) {
          Logger.error(`[SyncManager] Whisper error: ${stderr || err.message}`)
          return reject(err)
        }
        resolve()
      })
    })

    // Read result
    const jsonPath = samplePath.replace('.wav', '.json')
    let result = { text: '', language: language || 'en', segments: [] }
    try {
      const data = await fs.readJson(jsonPath)
      result.text = data.text || ''
      result.language = data.language || language || 'en'
      result.segments = (data.segments || []).map((s) => ({
        start: s.start + startSec,
        end: s.end + startSec,
        text: s.text
      }))
    } catch {}

    // Cleanup
    await fs.remove(samplePath).catch(() => {})
    await fs.remove(jsonPath).catch(() => {})

    return result
  }

  /**
   * Extract text from an ebook (first N characters per chapter)
   * Uses Calibre's ebook-convert to HTML, then strips tags
   */
  async extractEbookText(ebookPath, maxChars = 5000) {
    const tmpDir = Path.join(require('os').tmpdir(), 'abs_sync')
    await fs.ensureDir(tmpDir)
    const htmlPath = Path.join(tmpDir, `ebook_${Date.now()}.html`)

    const convertBin = process.env.CALIBRE_BIN || 'ebook-convert'
    await new Promise((resolve, reject) => {
      execFile(convertBin, [ebookPath, htmlPath], { timeout: 60000 }, (err) => {
        if (err) return reject(new Error('ebook-convert failed. Is Calibre installed?'))
        resolve()
      })
    })

    let html = await fs.readFile(htmlPath, 'utf-8')
    await fs.remove(htmlPath).catch(() => {})

    // Strip HTML tags, normalize whitespace
    const text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim()

    return text.slice(0, maxChars)
  }

  /**
   * Calculate word overlap between two texts (0-1)
   */
  wordOverlap(textA, textB) {
    if (!textA || !textB) return 0
    return stringSimilarity.compareTwoStrings(textA.toLowerCase(), textB.toLowerCase())
  }

  /**
   * Find longest common subsequence of words for alignment
   */
  findAlignmentPoints(transcript, ebookText) {
    const tfidf = new TfIdf()
    // Split ebook into windows
    const eWords = ebookText.split(/\s+/)
    const windowSize = 50
    const windows = []
    for (let i = 0; i <= eWords.length - windowSize; i += 25) {
      windows.push(eWords.slice(i, i + windowSize).join(' '))
    }
    windows.forEach((w) => tfidf.addDocument(w))
    tfidf.addDocument(transcript)

    // Find which window the transcript is most similar to
    let bestScore = 0
    let bestPos = 0
    const transcriptIdx = windows.length // last document
    tfidf.listTerms(transcriptIdx).forEach((term) => {
      for (let i = 0; i < windows.length; i++) {
        const measure = tfidf.tfidf(term.term, i)
        if (measure > 0) {
          const score = measure * term.tfidf
          if (score > bestScore) {
            bestScore = score
            bestPos = i * 25
          }
        }
      }
    })

    return {
      matchScore: Math.min(bestScore / 10, 1),
      ebookWordPosition: bestPos,
      matchedWords: Math.round(bestScore)
    }
  }

  /**
   * Detect if an audiobook and ebook are the same work
   * Transcribes the first 60s of audio, compares to ebook opening text
   */
  async detectMatch(audioBookId, ebookBookId) {
    const audioBook = await Database.bookModel.findByPk(audioBookId)
    const ebook = await Database.bookModel.findByPk(ebookBookId)

    if (!audioBook?.audioFiles?.length) throw new Error('No audio files in audiobook')
    if (!ebook?.ebookFile) throw new Error('No ebook file')

    // Transcribe opening of audiobook
    const firstAudioFile = audioBook.audioFiles[0]
    const transcript = await this.transcribeSample(firstAudioFile.metadata.path)

    // Extract opening of ebook
    const ebookText = await this.extractEbookText(ebook.ebookFile.metadata.path)

    // Compare
    const overlap = this.wordOverlap(transcript.text, ebookText)
    const alignment = this.findAlignmentPoints(transcript.text, ebookText)

    const isMatch = overlap >= this.matchThreshold || alignment.matchScore >= this.matchThreshold

    return {
      isMatch,
      confidence: Math.round(Math.max(overlap, alignment.matchScore) * 100),
      audioTitle: audioBook.title,
      ebookTitle: ebook.title,
      transcriptSample: transcript.text.slice(0, 200),
      detectedLanguage: transcript.language,
      overlap: Math.round(overlap * 100),
      alignmentScore: Math.round(alignment.matchScore * 100),
    }
  }

  /**
   * Auto-detect all audiobook↔ebook pairs in a library
   * For each audiobook without an ebook (and vice versa), try to find a match
   */
  async detectAllPairs(libraryId) {
    const { Op } = require('sequelize')
    const items = await Database.libraryItemModel.findAll({
      where: { libraryId },
      include: [{ model: Database.bookModel }]
    })

    // Separate into audio-only and ebook-only
    const audioOnly = items.filter((i) => i.book?.audioFiles?.length && !i.book?.ebookFile)
    const ebookOnly = items.filter((i) => i.book?.ebookFile && !i.book?.audioFiles?.length)

    // First pass: match by title similarity (fast, no STT needed)
    const GroupingManager = require('./GroupingManager')
    const pairs = []
    const matchedEbooks = new Set()

    for (const audio of audioOnly) {
      const normAudio = GroupingManager.normalizeTitle(audio.book.title)
      let bestMatch = null
      let bestSim = 0

      for (const ebook of ebookOnly) {
        if (matchedEbooks.has(ebook.id)) continue
        const normEbook = GroupingManager.normalizeTitle(ebook.book.title)
        const sim = GroupingManager.similarity(normAudio, normEbook)
        if (sim > bestSim) {
          bestSim = sim
          bestMatch = ebook
        }
      }

      if (bestMatch && bestSim >= 0.7) {
        pairs.push({
          audioBookId: audio.book.id,
          audioTitle: audio.book.title,
          ebookBookId: bestMatch.book.id,
          ebookTitle: bestMatch.book.title,
          matchMethod: 'title',
          confidence: Math.round(bestSim * 100),
          verified: false
        })
        matchedEbooks.add(bestMatch.id)
      }
    }

    return { pairs, audioOnly: audioOnly.length, ebookOnly: ebookOnly.length }
  }

  /**
   * Verify a detected pair using STT (more expensive but definitive)
   */
  async verifyPair(audioBookId, ebookBookId) {
    return this.detectMatch(audioBookId, ebookBookId)
  }

  /**
   * Generate chapter-level sync data (Whispersync-style)
   * Maps audio timestamps to ebook text positions
   */
  async generateChapterSync(audioBookId, ebookBookId) {
    const audioBook = await Database.bookModel.findByPk(audioBookId)
    const ebook = await Database.bookModel.findByPk(ebookBookId)

    if (!audioBook?.audioFiles?.length || !ebook?.ebookFile) {
      throw new Error('Both audio and ebook files required')
    }

    const ebookText = await this.extractEbookText(ebook.ebookFile.metadata.path, 500000)
    const chapters = audioBook.chapters || []
    const syncPoints = []

    for (const chapter of chapters) {
      try {
        // Transcribe first 30s of each chapter
        const audioFile = audioBook.audioFiles.find((af) =>
          chapter.start >= (af.startOffset || 0) && chapter.start < ((af.startOffset || 0) + af.duration)
        )
        if (!audioFile) continue

        const offsetInFile = chapter.start - (audioFile.startOffset || 0)
        const transcript = await this.transcribeSample(audioFile.metadata.path, offsetInFile, 30)

        if (!transcript.text) continue

        const alignment = this.findAlignmentPoints(transcript.text, ebookText)

        syncPoints.push({
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          audioStart: chapter.start,
          audioEnd: chapter.end,
          ebookWordPosition: alignment.ebookWordPosition,
          confidence: Math.round(alignment.matchScore * 100),
          transcriptSample: transcript.text.slice(0, 100)
        })
      } catch (err) {
        Logger.warn(`[SyncManager] Chapter sync failed for "${chapter.title}": ${err.message}`)
      }
    }

    return {
      audioBookId,
      ebookBookId,
      syncPoints,
      chaptersMatched: syncPoints.length,
      totalChapters: chapters.length
    }
  }
}

module.exports = new SyncManager()
