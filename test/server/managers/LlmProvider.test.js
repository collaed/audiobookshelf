const { expect } = require('chai')
const sinon = require('sinon')
const axios = require('axios')

describe('LlmProvider', () => {
  let LlmProvider

  beforeEach(() => {
    delete require.cache[require.resolve('../../../server/managers/LlmProvider')]
    process.env.LLM_PROVIDER = 'disabled'
    LlmProvider = require('../../../server/managers/LlmProvider')
  })

  afterEach(() => {
    sinon.restore()
    delete process.env.LLM_PROVIDER
  })

  it('isAvailable returns false when disabled', async () => {
    const result = await LlmProvider.isAvailable()
    expect(result.available).to.be.false
    expect(result.provider).to.equal('disabled')
  })

  it('isAvailable returns false when ollama is unreachable', async () => {
    LlmProvider.provider = 'ollama'
    sinon.stub(axios, 'get').rejects(new Error('ECONNREFUSED'))
    const result = await LlmProvider.isAvailable()
    expect(result.available).to.be.false
    expect(result.provider).to.equal('ollama')
  })

  it('complete calls openai-compatible endpoint for ollama', async () => {
    LlmProvider.provider = 'ollama'
    const stub = sinon.stub(axios, 'post').resolves({ data: { choices: [{ message: { content: 'hello' } }] } })
    const result = await LlmProvider.complete('sys', 'user')
    expect(result).to.equal('hello')
    expect(stub.calledOnce).to.be.true
    const [url, body] = stub.firstCall.args
    expect(url).to.include('/v1/chat/completions')
    expect(body.messages).to.deep.equal([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'user' }
    ])
  })

  it('complete calls openai with auth header', async () => {
    LlmProvider.provider = 'openai'
    LlmProvider.config.openai.apiKey = 'sk-test'
    LlmProvider.config.openai.model = 'gpt-4o-mini'
    const stub = sinon.stub(axios, 'post').resolves({ data: { choices: [{ message: { content: 'response' } }] } })
    const result = await LlmProvider.complete('sys', 'user', { maxTokens: 500 })
    expect(result).to.equal('response')
    const [url, body, opts] = stub.firstCall.args
    expect(url).to.include('/v1/chat/completions')
    expect(body.model).to.equal('gpt-4o-mini')
    expect(body.max_tokens).to.equal(500)
    expect(opts.headers['Authorization']).to.equal('Bearer sk-test')
  })

  it('complete returns empty string when disabled', async () => {
    const result = await LlmProvider.complete('sys', 'user')
    expect(result).to.equal('')
  })

  it('complete returns empty string on error', async () => {
    LlmProvider.provider = 'ollama'
    sinon.stub(axios, 'post').rejects(new Error('fail'))
    const result = await LlmProvider.complete('sys', 'user')
    expect(result).to.equal('')
  })

  it('configure updates provider and config', () => {
    LlmProvider.configure({ provider: 'airouter', baseUrl: 'http://myrouter:8000', token: 'abc' })
    expect(LlmProvider.provider).to.equal('airouter')
    expect(LlmProvider.config.airouter.baseUrl).to.equal('http://myrouter:8000')
  })

  it('getStatus returns safe config without secrets', () => {
    LlmProvider.provider = 'openai'
    LlmProvider.config.openai.apiKey = 'sk-secret'
    const status = LlmProvider.getStatus()
    expect(status.provider).to.equal('openai')
    expect(status.openai.hasKey).to.be.true
    expect(status.openai).to.not.have.property('apiKey')
  })
})
