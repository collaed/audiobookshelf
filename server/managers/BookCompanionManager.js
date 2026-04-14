const Logger = require('../Logger')
const Database = require('../Database')
const LlmProvider = require('./LlmProvider')

/**
 * AI-powered book companion. All processing uses the user's own text
 * sent to their own LLM (Ollama local or their own API key).
 *
 * Legal: user's own books, user's own LLM. No content leaves their network
 * when using Ollama. With OpenAI, user explicitly opts in.
 */
class BookCompanionManager {
  constructor() {}

  /**
   * Get book text up to a position (no spoilers)
   */
  async getTextUpTo(bookId, progressPercent) {
    const book = await Database.bookModel.findByPk(bookId)
    if (!book) return ''

    if (book.ebookFile) {
      const SyncManager = require('./SyncManager')
      const fullText = await SyncManager.extractEbookText(book.ebookFile.metadata.path, 500000)
      const cutoff = Math.floor(fullText.length * (progressPercent / 100))
      return fullText.slice(0, cutoff)
    }

    // For audiobooks without ebook, use description + chapter titles
    let context = `Title: ${book.title}\nDescription: ${book.description || 'N/A'}\n`
    if (book.chapters?.length) {
      const chaptersReached = Math.floor(book.chapters.length * (progressPercent / 100))
      context += `Chapters so far: ${book.chapters.slice(0, chaptersReached).map((c) => c.title).join(', ')}`
    }
    return context
  }

  // ── Feature 1: Summaries & Recaps ──────────────────────────────────────

  /**
   * "What happened so far?" — summarize up to user's current position
   */
  async getRecap(bookId, userId) {
    const progress = await Database.mediaProgressModel.findOne({
      where: { userId, mediaItemId: bookId }
    })
    const pct = progress ? Math.round((progress.currentTime / (progress.duration || 1)) * 100) : 10

    const text = await this.getTextUpTo(bookId, pct)
    if (!text || text.length < 100) return { recap: 'Not enough content to summarize yet.' }

    // Only send a reasonable chunk (last ~3000 chars for context)
    const chunk = text.length > 4000 ? text.slice(-4000) : text

    const recap = await LlmProvider.complete(
      'You are a helpful reading companion. Summarize what has happened in this book so far. Be concise, use 3-5 bullet points. Do NOT reveal anything beyond what is provided.',
      `Here is the text the reader has covered so far (they are ${pct}% through the book):\n\n${chunk}`,
      { maxTokens: 500 }
    )

    return { recap, progressPercent: pct }
  }

  /**
   * Chapter summary — summarize a specific chapter
   */
  async getChapterSummary(bookId, chapterIndex) {
    const book = await Database.bookModel.findByPk(bookId)
    if (!book?.ebookFile) return { summary: 'Ebook file needed for chapter summaries.' }

    const SyncManager = require('./SyncManager')
    const fullText = await SyncManager.extractEbookText(book.ebookFile.metadata.path, 500000)

    // Rough chapter extraction: split by common chapter markers
    const chapters = fullText.split(/(?=chapter\s+\d|CHAPTER\s+\d|Part\s+\d|PART\s+\d)/i)
    const chapter = chapters[chapterIndex] || chapters[chapters.length - 1]
    if (!chapter) return { summary: 'Chapter not found.' }

    const summary = await LlmProvider.complete(
      'Summarize this book chapter in 2-3 sentences. Be concise.',
      chapter.slice(0, 3000),
      { maxTokens: 200 }
    )

    return { summary, chapterIndex }
  }

  // ── Feature 2: Smart Search ────────────────────────────────────────────

  /**
   * Natural language search across library
   * "Something like Project Hail Mary but in French"
   */
  async smartSearch(query, userId) {
    // Get library catalog as context
    const books = await Database.bookModel.findAll({
      include: [{ model: Database.authorModel, through: { attributes: [] } }],
      limit: 200
    })

    const catalog = books.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.authors?.map((a) => a.name).join(', ') || '',
      genres: (b.genres || []).join(', '),
      language: b.language || '',
      description: (b.description || '').slice(0, 100)
    }))

    const catalogStr = catalog.map((b) =>
      `[${b.id}] "${b.title}" by ${b.author} (${b.genres}) [${b.language}] — ${b.description}`
    ).join('\n')

    const response = await LlmProvider.complete(
      `You are a librarian. The user will ask for book recommendations from their personal library. 
Return ONLY a JSON array of matching book IDs with a brief reason, like: [{"id":"xxx","reason":"..."}]
If nothing matches well, return an empty array. Only recommend books from the catalog below.`,
      `Library catalog:\n${catalogStr}\n\nUser query: "${query}"`,
      { maxTokens: 500 }
    )

    // Parse LLM response
    try {
      const match = response.match(/\[[\s\S]*\]/)
      const results = match ? JSON.parse(match[0]) : []
      // Enrich with full book data
      const enriched = []
      for (const r of results.slice(0, 10)) {
        const book = catalog.find((b) => b.id === r.id)
        if (book) enriched.push({ ...book, reason: r.reason })
      }
      return { query, results: enriched }
    } catch {
      return { query, results: [], rawResponse: response }
    }
  }

  // ── Feature 4: Reading Companion / Book Chat ───────────────────────────

  /**
   * Ask a question about the book (scoped to current position, no spoilers)
   */
  async askAboutBook(bookId, userId, question) {
    const progress = await Database.mediaProgressModel.findOne({
      where: { userId, mediaItemId: bookId }
    })
    const pct = progress ? Math.round((progress.currentTime / (progress.duration || 1)) * 100) : 10

    const text = await this.getTextUpTo(bookId, pct)
    const chunk = text.length > 4000 ? text.slice(-4000) : text

    const book = await Database.bookModel.findByPk(bookId)

    const answer = await LlmProvider.complete(
      `You are a reading companion for "${book?.title || 'this book'}". 
The reader is ${pct}% through. Answer their question based ONLY on what they've read so far.
NEVER reveal plot points, twists, or events beyond their current position.
If you can't answer without spoilers, say so.`,
      `Text the reader has covered:\n${chunk}\n\nQuestion: ${question}`,
      { maxTokens: 400 }
    )

    return { answer, progressPercent: pct, bookTitle: book?.title }
  }

  /**
   * "Who is this character?" — character tracker
   */
  async getCharacterInfo(bookId, userId, characterName) {
    return this.askAboutBook(bookId, userId,
      `Who is "${characterName}"? What do we know about them so far? List their key traits and role in the story.`)
  }

  // ── Feature 5: Translation Quality Check ───────────────────────────────

  /**
   * Verify alignment quality between two language versions
   */
  async checkAlignmentQuality(pairs) {
    const sample = pairs.slice(0, 10).map((p, i) =>
      `${i + 1}. SOURCE: "${p.source}"\n   TARGET: "${p.target}"`
    ).join('\n')

    const response = await LlmProvider.complete(
      `You are a translation quality checker. Review these sentence pairs (source and target language).
For each pair, rate: GOOD (correct translation match), OFFSET (shifted by 1-2 sentences), BAD (wrong match).
Return JSON array: [{"pair":1,"rating":"GOOD","note":"..."}]`,
      sample,
      { maxTokens: 600 }
    )

    try {
      const match = response.match(/\[[\s\S]*\]/)
      return { ratings: match ? JSON.parse(match[0]) : [], pairsChecked: Math.min(pairs.length, 10) }
    } catch {
      return { ratings: [], rawResponse: response }
    }
  }
}

module.exports = new BookCompanionManager()
