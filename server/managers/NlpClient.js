const intello = require('../utils/intelloClient')
const Logger = require('../Logger')

/**
 * Client for L'Intello's NLP endpoints.
 * Uses spaCy NER for character/entity extraction — cheaper than LLM.
 */
class NlpClient {
  async extractEntities(text) {
    try {
      return await intello.post('/api/nlp/entities', { text: text.slice(0, 50000) })
    } catch (err) {
      Logger.debug(`[NlpClient] NER failed: ${err.message}`)
      return null
    }
  }

  async extractCharacters(text) {
    const entities = await this.extractEntities(text)
    if (!entities?.PERSON) return []
    const counts = {}
    for (const e of entities.PERSON) {
      const name = e.text?.trim()
      if (name && name.length > 1) counts[name] = (counts[name] || 0) + 1
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, mentions: count }))
  }
}

module.exports = new NlpClient()
