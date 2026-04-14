const axios = require('axios').default
const Logger = require('../Logger')

/**
 * LLM abstraction layer. Supports:
 * - Ollama (local, free, no API key) — DEFAULT
 * - OpenAI-compatible APIs (OpenAI, Anthropic via proxy, Groq, Together, etc.)
 *
 * All legally clear: we send user's own book text to their own LLM.
 * No copyrighted content leaves the user's network when using Ollama.
 */
class LlmProvider {
  constructor() {
    this.provider = process.env.LLM_PROVIDER || 'ollama' // ollama | openai
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434'
    this.ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2'
    this.openaiUrl = process.env.OPENAI_API_URL || 'https://api.openai.com/v1'
    this.openaiKey = process.env.OPENAI_API_KEY || ''
    this.openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    this.timeout = 60000
  }

  async isAvailable() {
    try {
      if (this.provider === 'ollama') {
        const { data } = await axios.get(`${this.ollamaUrl}/api/tags`, { timeout: 3000 })
        return { available: true, provider: 'ollama', models: (data.models || []).map((m) => m.name) }
      } else {
        return { available: !!this.openaiKey, provider: 'openai', model: this.openaiModel }
      }
    } catch {
      return { available: false, provider: this.provider }
    }
  }

  /**
   * Send a prompt to the LLM and get a response
   */
  async complete(systemPrompt, userPrompt, options = {}) {
    const maxTokens = options.maxTokens || 1000

    if (this.provider === 'ollama') {
      const { data } = await axios.post(`${this.ollamaUrl}/api/chat`, {
        model: options.model || this.ollamaModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false,
        options: { num_predict: maxTokens }
      }, { timeout: this.timeout })
      return data.message?.content || ''
    } else {
      const { data } = await axios.post(`${this.openaiUrl}/chat/completions`, {
        model: options.model || this.openaiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: maxTokens
      }, {
        timeout: this.timeout,
        headers: { 'Authorization': `Bearer ${this.openaiKey}`, 'Content-Type': 'application/json' }
      })
      return data.choices?.[0]?.message?.content || ''
    }
  }
}

module.exports = new LlmProvider()
