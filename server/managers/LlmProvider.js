const axios = require('axios').default
const Logger = require('../Logger')

/**
 * Unified LLM client. Speaks OpenAI chat/completions format to any backend:
 * - Airouter (multi-LLM router with 12+ providers)
 * - Ollama (local, free)
 * - OpenAI / any OpenAI-compatible API
 *
 * All three expose POST /v1/chat/completions with the same request/response format.
 * Airouter additionally supports /api/v1/chat with routing hints.
 */
class LlmProvider {
  constructor() {
    this.reload()
  }

  /** Reload config from env (or later from DB settings) */
  reload() {
    this.provider = process.env.LLM_PROVIDER || 'disabled' // airouter | ollama | openai | custom | disabled
    this.config = {
      airouter: {
        baseUrl: process.env.AIROUTER_URL || 'http://airouter:8000',
        token: process.env.AIROUTER_TOKEN || '',
        model: 'auto', // airouter picks the best
      },
      ollama: {
        baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
        model: process.env.OLLAMA_MODEL || 'llama3.2',
      },
      openai: {
        baseUrl: process.env.OPENAI_API_URL || 'https://api.openai.com',
        apiKey: process.env.OPENAI_API_KEY || '',
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      },
      custom: {
        baseUrl: process.env.LLM_CUSTOM_URL || '',
        apiKey: process.env.LLM_CUSTOM_KEY || '',
        model: process.env.LLM_CUSTOM_MODEL || '',
      }
    }
    this.timeout = 60000
  }

  /** Update config from settings UI (persisted in DB) */
  configure(settings) {
    if (settings.provider) this.provider = settings.provider
    for (const [key, val] of Object.entries(settings)) {
      if (key !== 'provider' && this.config[this.provider]) {
        this.config[this.provider][key] = val
      }
    }
  }

  _getEndpoint() {
    const cfg = this.config[this.provider]
    if (!cfg) return null
    switch (this.provider) {
      case 'airouter':
        return { url: `${cfg.baseUrl}/v1/chat/completions`, headers: cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}, model: cfg.model }
      case 'ollama':
        return { url: `${cfg.baseUrl}/v1/chat/completions`, headers: {}, model: cfg.model }
      case 'openai':
        return { url: `${cfg.baseUrl}/v1/chat/completions`, headers: { Authorization: `Bearer ${cfg.apiKey}` }, model: cfg.model }
      case 'custom':
        return { url: `${cfg.baseUrl}/v1/chat/completions`, headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}, model: cfg.model }
      default:
        return null
    }
  }

  async isAvailable() {
    if (this.provider === 'disabled') return { available: false, provider: 'disabled', reason: 'AI features disabled' }

    const endpoint = this._getEndpoint()
    if (!endpoint) return { available: false, provider: this.provider, reason: 'Invalid configuration' }

    try {
      if (this.provider === 'airouter') {
        const { data } = await axios.get(`${this.config.airouter.baseUrl}/api/v1/status`, {
          headers: endpoint.headers, timeout: 5000
        }).catch(() => axios.get(`${this.config.airouter.baseUrl}/health`, { timeout: 5000 }))
        return { available: true, provider: 'airouter', ...data }
      }
      if (this.provider === 'ollama') {
        const { data } = await axios.get(`${this.config.ollama.baseUrl}/api/tags`, { timeout: 5000 })
        return { available: true, provider: 'ollama', models: (data.models || []).map((m) => m.name) }
      }
      // OpenAI/custom — just try a models list
      const { data } = await axios.get(`${endpoint.url.replace('/chat/completions', '/models')}`, {
        headers: endpoint.headers, timeout: 5000
      })
      return { available: true, provider: this.provider, models: (data.data || []).map((m) => m.id).slice(0, 10) }
    } catch (err) {
      return { available: false, provider: this.provider, reason: err.message }
    }
  }

  /**
   * Send a chat completion request. Same format works for all backends.
   */
  async complete(systemPrompt, userPrompt, options = {}) {
    if (this.provider === 'disabled') return ''

    const endpoint = this._getEndpoint()
    if (!endpoint) return ''

    try {
      const { data } = await axios.post(endpoint.url, {
        model: options.model || endpoint.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: options.maxTokens || 1000,
        ...(this.provider === 'airouter' ? { prefer_free: true } : {})
      }, {
        headers: { 'Content-Type': 'application/json', ...endpoint.headers },
        timeout: options.timeout || this.timeout
      })

      return data.choices?.[0]?.message?.content || data.content || ''
    } catch (err) {
      Logger.error(`[LlmProvider] ${this.provider} error: ${err.message}`)
      return ''
    }
  }

  /** Get current config (safe for UI, no secrets) */
  getStatus() {
    return {
      provider: this.provider,
      configured: this.provider !== 'disabled',
      airouter: { url: this.config.airouter.baseUrl, hasToken: !!this.config.airouter.token },
      ollama: { url: this.config.ollama.baseUrl, model: this.config.ollama.model },
      openai: { url: this.config.openai.baseUrl, hasKey: !!this.config.openai.apiKey, model: this.config.openai.model },
      custom: { url: this.config.custom.baseUrl, hasKey: !!this.config.custom.apiKey, model: this.config.custom.model },
    }
  }
}

module.exports = new LlmProvider()
