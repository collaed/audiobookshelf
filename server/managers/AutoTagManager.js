const Logger = require('../Logger')
const Database = require('../Database')
const LlmProvider = require('./LlmProvider')

/**
 * Auto-tagging via LLM. Samples multiple points in the book text
 * (beginning, end, + random middle samples) to build a comprehensive
 * understanding before generating tags.
 *
 * Why multi-sample:
 * - Beginning alone misses genre twists (thriller that starts as romance)
 * - End reveals the actual resolution/tone
 * - Middle samples catch the core themes
 * - Combined gives the LLM enough context without sending the whole book
 */
class AutoTagManager {
  constructor() {
    this.sampleSize = 1500 // chars per sample
    this.numMiddleSamples = 3
  }

  /**
   * Extract text samples from multiple points in a book
   * Returns: { beginning, middle[], end, metadata }
   */
  async extractSamples(bookId) {
    const book = await Database.bookModel.findByPk(bookId, {
      include: [{ model: Database.authorModel }]
    })
    if (!book) return null

    const metadata = {
      title: book.title,
      author: book.authors?.map((a) => a.name).join(', ') || '',
      narrator: (book.narrators || []).join(', '),
      description: (book.description || '').slice(0, 500),
      language: book.language || '',
      duration: book.duration,
      existingGenres: book.genres || [],
    }

    // Try ebook text first
    let fullText = ''
    if (book.ebookFile) {
      try {
        const SyncManager = require('./SyncManager')
        fullText = await SyncManager.extractEbookText(book.ebookFile.metadata.path, 200000)
      } catch (err) { Logger.debug(`[AutoTagManager] ${err.message}`) }
    }

    if (!fullText && metadata.description) {
      // Fallback: use description + chapter titles only
      fullText = metadata.description
      if (book.chapters?.length) {
        fullText += '\n\nChapter titles: ' + book.chapters.map((c) => c.title).join(', ')
      }
    }

    if (!fullText) return { metadata, samples: null }

    const len = fullText.length
    const beginning = fullText.slice(0, this.sampleSize)
    const end = fullText.slice(Math.max(0, len - this.sampleSize))

    const middle = []
    for (let i = 0; i < this.numMiddleSamples; i++) {
      const pos = Math.floor(len * (0.25 + (i * 0.2))) // 25%, 45%, 65%
      middle.push(fullText.slice(pos, pos + this.sampleSize))
    }

    return { metadata, samples: { beginning, middle, end } }
  }

  /**
   * Generate tags for a book using multi-sample LLM analysis
   */
  async generateTags(bookId) {
    const data = await this.extractSamples(bookId)
    if (!data) return { error: 'Book not found' }

    const { metadata, samples } = data

    // Multi-stage pipeline (SizeMy pattern): skip LLM if metadata already rich
    if (metadata.existingGenres?.length >= 3) {
      Logger.info(`[AutoTagManager] Book already has ${metadata.existingGenres.length} genres, enriching only`)
      return {
        genres: metadata.existingGenres,
        subgenres: [],
        mood: [],
        themes: [],
        pace: null,
        targetAudience: null,
        contentWarnings: [],
        setting: null,
        similar: [],
        oneLiner: metadata.description?.slice(0, 100) || '',
        _bookId: bookId,
        _title: metadata.title,
        _samplesUsed: 0,
        _skippedLlm: true,
        _reason: 'Book already has sufficient genre metadata'
      }
    }

    // Build the prompt with all samples
    let textContext = ''
    if (samples) {
      textContext = `
BEGINNING OF BOOK:
${samples.beginning}

MIDDLE SAMPLES:
${samples.middle.join('\n---\n')}

END OF BOOK:
${samples.end}`
    }

    const prompt = `Analyze this book and generate structured tags.

BOOK METADATA:
Title: ${metadata.title}
Author: ${metadata.author}
Narrator: ${metadata.narrator}
Description: ${metadata.description}
Language: ${metadata.language}
Existing genres: ${metadata.existingGenres.join(', ') || 'none'}
${textContext}

Return a JSON object with these fields:
{
  "genres": ["genre1", "genre2", ...],           // 2-5 genres (e.g., "Science Fiction", "Thriller")
  "subgenres": ["subgenre1", ...],               // 2-4 specific subgenres (e.g., "Hard Sci-Fi", "Psychological Thriller")
  "mood": ["mood1", "mood2", ...],               // 2-4 moods (e.g., "dark", "hopeful", "suspenseful")
  "themes": ["theme1", "theme2", ...],           // 3-6 themes (e.g., "redemption", "identity", "war")
  "pace": "slow|medium|fast",                    // narrative pace
  "targetAudience": "adult|young-adult|children", // primary audience
  "contentWarnings": ["warning1", ...],          // if any (e.g., "violence", "strong language")
  "setting": "description of setting",           // brief (e.g., "Victorian London", "far-future space")
  "similar": ["Book Title 1", "Book Title 2"],   // 2-3 similar well-known books
  "oneLiner": "one sentence description"         // spoiler-free hook
}

Return ONLY valid JSON, no markdown, no explanation.`

    const response = await LlmProvider.complete(
      'You are a literary analyst and librarian. Analyze books and generate accurate, useful tags. Be specific, not generic.',
      prompt,
      { maxTokens: 800 }
    )

    try {
      const match = response.match(/\{[\s\S]*\}/)
      if (!match) return { error: 'LLM returned no JSON', raw: response.slice(0, 200) }
      const tags = JSON.parse(match[0])
      tags._bookId = bookId
      tags._title = metadata.title
      tags._samplesUsed = samples ? 5 : 0 // beginning + 3 middle + end
      return tags
    } catch (err) {
      return { error: 'Failed to parse LLM response', raw: response.slice(0, 200) }
    }
  }

  /**
   * Apply generated tags to a book's metadata
   */
  async applyTags(bookId, tags) {
    const book = await Database.bookModel.findByPk(bookId)
    if (!book) return false

    const updates = {}
    if (tags.genres?.length) {
      // Merge with existing, deduplicate
      const existing = new Set((book.genres || []).map((g) => g.toLowerCase()))
      const merged = [...(book.genres || [])]
      for (const g of tags.genres) {
        if (!existing.has(g.toLowerCase())) merged.push(g)
      }
      updates.genres = merged
    }

    if (Object.keys(updates).length) {
      await book.update(updates)
    }

    return { applied: true, bookId, genres: updates.genres }
  }

  /**
   * Batch auto-tag all books in a library that have no genres
   */
  async autoTagLibrary(libraryId, options = {}) {
    const { Op } = require('sequelize')
    const items = await Database.libraryItemModel.findAll({
      where: { libraryId },
      include: [{ model: Database.bookModel }]
    })

    const untagged = items.filter((i) => !i.book?.genres?.length)
    const limit = options.limit || 50
    const results = []

    for (const item of untagged.slice(0, limit)) {
      try {
        Logger.info(`[AutoTagManager] Tagging: ${item.book.title}`)
        const tags = await this.generateTags(item.book.id)
        if (!tags.error) {
          results.push({ bookId: item.book.id, title: item.book.title, tags })
        } else {
          results.push({ bookId: item.book.id, title: item.book.title, error: tags.error })
        }
      } catch (err) {
        results.push({ bookId: item.book.id, title: item.book.title, error: err.message })
      }
    }

    return { total: untagged.length, processed: results.length, results }
  }
}

module.exports = new AutoTagManager()
