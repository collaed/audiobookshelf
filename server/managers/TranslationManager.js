const intello = require('../utils/intelloClient')
const Logger = require('../Logger')

/**
 * Book translation via L'Intello LLM.
 */
class TranslationManager {
  async translate(text, sourceLang, targetLang) {
    return intello.chat(
      text.slice(0, 10000),
      `Translate the following text from ${sourceLang} to ${targetLang}. Preserve formatting. Output only the translation.`,
      { maxTokens: 4096, timeout: 60000 }
    )
  }

  async translateBook(bookId, targetLang, sourceLang = 'auto') {
    const Database = require('../Database')
    const SyncManager = require('./SyncManager')
    const book = await Database.bookModel.findByPk(bookId)
    if (!book) throw new Error('Book not found')

    const text = await SyncManager.extractEbookText(book.ebookFile?.metadata?.path, 50000)
    if (!text) throw new Error('No text content found')

    const chunks = text.match(/.{1,3000}/gs) || []
    const translated = []
    for (const chunk of chunks.slice(0, 20)) {
      translated.push(await this.translate(chunk, sourceLang, targetLang))
    }
    return {
      bookId, targetLang, sourceLang,
      translatedChunks: translated.length, totalChunks: chunks.length,
      preview: translated[0]?.slice(0, 500)
    }
  }

  async listBackends() {
    return [{ name: 'llm', label: "LLM (via L'Intello)", available: true }]
  }
}

module.exports = new TranslationManager()
