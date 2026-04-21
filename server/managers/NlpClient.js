const axios = require('axios').default
const Logger = require('../Logger')

/**
 * Client for L'Intello's NLP endpoints.
 * Uses spaCy NER for character/entity extraction — cheaper than LLM.
 */
class NlpClient {
  constructor() {
    this.baseUrl = process.env.INTELLO_URL || process.env.AIROUTER_URL || 'http://intello:8000'
    this.token = process.env.INTELLO_TOKEN || process.env.AIROUTER_TOKEN || ''
    this.timeout = 30000
  }

  _headers() {
    const h = { 'Content-Type': 'application/json' }
    if (this.token) h['Authorization'] = `Bearer ${this.token}`
    return h
  }

  /**
   * Extract named entities (characters, places, organizations) from text.
   * Uses spaCy NER — fast and free (no LLM call).
   */
  async extractEntities(text) {
    try {
      const { data } = await axios.post(`${this.baseUrl}/api/nlp/entities`, { text: text.slice(0, 50000) }, {
        headers: this._headers(), timeout: this.timeout
      })
      return data // { PERSON: [{text, start, end}], GPE: [...], ORG: [...] }
    } catch {
      return null
    }
  }

  /**
   * Extract character names from book text — returns deduplicated list.
   */
  async extractCharacters(text) {
    const entities = await this.extractEntities(text)
    if (!entities?.PERSON) return []
    // Deduplicate and sort by frequency
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
