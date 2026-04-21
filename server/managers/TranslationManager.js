const axios = require('axios').default
const Logger = require('../Logger')

/**
 * Book translation — pluggable backends (LLM via intello, or direct).
 * Inspired by BrainyCat's translation engine.
 */
class TranslationManager {
  constructor() {
    this.intelloUrl = process.env.INTELLO_URL || process.env.AIROUTER_URL || 'http://intello:8000'
    this.intelloToken = process.env.INTELLO_TOKEN || ''
  }

  _headers() {
    const h = { 'Content-Type': 'application/json' }
    if (this.intelloToken) h['Authorization'] = `Bearer ${this.intelloToken}`
    return h
  }

  async translate(text, sourceLang, targetLang) {
    const { data } = await axios.post(`${this.intelloUrl}/v1/chat/completions`, {
      model: 'auto',
      messages: [
        { role: 'system', content: `Translate the following text from ${sourceLang} to ${targetLang}. Preserve formatting. Output only the translation.` },
        { role: 'user', content: text.slice(0, 10000) }
      ],
      max_tokens: 4096
    }, { headers: this._headers(), timeout: 60000 })
    return data?.choices?.[0]?.message?.content || ''
  }

  async translateBook(bookId, targetLang, sourceLang = 'auto') {
    const Database = require('../Database')
    const SyncManager = require('./SyncManager')
    const book = await Database.bookModel.findByPk(bookId)
    if (!book) throw new Error('Book not found')

    const text = await SyncManager.extractEbookText(book.ebookFile?.metadata?.path, 50000)
    if (!text) throw new Error('No text content found')

    // Translate in chunks
    const chunks = text.match(/.{1,3000}/gs) || []
    const translated = []
    for (const chunk of chunks.slice(0, 20)) {
      translated.push(await this.translate(chunk, sourceLang, targetLang))
    }
    return {
      bookId, targetLang, sourceLang,
      translatedChunks: translated.length,
      totalChunks: chunks.length,
      preview: translated[0]?.slice(0, 500)
    }
  }

  async listBackends() {
    return [
      { name: 'llm', label: 'LLM (via L\'Intello)', available: true },
    ]
  }
}

module.exports = new TranslationManager()
