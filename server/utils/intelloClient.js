const axios = require('axios').default
const Logger = require('../Logger')

/**
 * Shared HTTP client for L'Intello / airouter services.
 * Single source of truth for URL, token, timeout, and error handling.
 */
const INTELLO_URL = process.env.INTELLO_URL || process.env.AIROUTER_URL || 'http://intello:8000'
const INTELLO_TOKEN = process.env.INTELLO_TOKEN || process.env.AIROUTER_TOKEN || ''
const DEFAULT_TIMEOUT = 30000

// Allow test overrides
let _urlOverride = null
function getUrl() { return _urlOverride || INTELLO_URL }
function setUrl(url) { _urlOverride = url }

function headers(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra }
  if (INTELLO_TOKEN) h['Authorization'] = `Bearer ${INTELLO_TOKEN}`
  return h
}

async function get(path, opts = {}) {
  const { data } = await axios.get(`${getUrl()}${path}`, {
    headers: headers(opts.headers), timeout: opts.timeout || DEFAULT_TIMEOUT
  })
  return data
}

async function post(path, body, opts = {}) {
  const { data } = await axios.post(`${getUrl()}${path}`, body, {
    headers: headers(opts.headers), timeout: opts.timeout || DEFAULT_TIMEOUT,
    ...(opts.responseType ? { responseType: opts.responseType } : {})
  })
  return data
}

async function postForm(path, formData, opts = {}) {
  const { data } = await axios.post(`${getUrl()}${path}`, formData, {
    headers: { ...formData.getHeaders?.() || {}, ...headers(opts.headers) },
    timeout: opts.timeout || DEFAULT_TIMEOUT,
    ...(opts.responseType ? { responseType: opts.responseType } : {})
  })
  return data
}

/** Chat completion shorthand */
async function chat(userMsg, systemMsg = '', opts = {}) {
  const messages = []
  if (systemMsg) messages.push({ role: 'system', content: systemMsg })
  messages.push({ role: 'user', content: userMsg })
  const data = await post('/v1/chat/completions', {
    model: opts.model || 'auto', messages, max_tokens: opts.maxTokens || 2048
  }, { timeout: opts.timeout || 60000 })
  return data?.choices?.[0]?.message?.content || ''
}

module.exports = { get, post, postForm, chat, headers, getUrl, setUrl, INTELLO_URL, INTELLO_TOKEN, DEFAULT_TIMEOUT }
