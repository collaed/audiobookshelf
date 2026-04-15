const { expect } = require('chai')
const sinon = require('sinon')
const axios = require('axios')

describe('LlmProvider', () => {
  let LlmProvider

  beforeEach(() => {
    delete require.cache[require.resolve('../../../server/managers/LlmProvider')]
    LlmProvider = require('../../../server/managers/LlmProvider')
  })

  afterEach(() => sinon.restore())

  it('isAvailable returns false when ollama is unreachable', async () => {
    LlmProvider.provider = 'ollama'
    sinon.stub(axios, 'get').rejects(new Error('ECONNREFUSED'))
    const result = await LlmProvider.isAvailable()
    expect(result).to.deep.equal({ available: false, provider: 'ollama' })
  })

  it('complete calls ollama API with correct format', async () => {
    LlmProvider.provider = 'ollama'
    LlmProvider.ollamaModel = 'llama3.2'
    const stub = sinon.stub(axios, 'post').resolves({ data: { message: { content: 'hello' } } })
    const result = await LlmProvider.complete('sys', 'user')
    expect(result).to.equal('hello')
    expect(stub.calledOnce).to.be.true
    const [url, body] = stub.firstCall.args
    expect(url).to.include('/api/chat')
    expect(body.model).to.equal('llama3.2')
    expect(body.messages).to.deep.equal([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'user' }
    ])
    expect(body.stream).to.equal(false)
  })

  it('complete calls openai API when provider is openai', async () => {
    LlmProvider.provider = 'openai'
    LlmProvider.openaiKey = 'sk-test'
    LlmProvider.openaiModel = 'gpt-4o-mini'
    const stub = sinon.stub(axios, 'post').resolves({ data: { choices: [{ message: { content: 'response' } }] } })
    const result = await LlmProvider.complete('sys', 'user', { maxTokens: 500 })
    expect(result).to.equal('response')
    const [url, body, opts] = stub.firstCall.args
    expect(url).to.include('/chat/completions')
    expect(body.model).to.equal('gpt-4o-mini')
    expect(body.max_tokens).to.equal(500)
    expect(opts.headers['Authorization']).to.equal('Bearer sk-test')
  })

  it('complete returns empty string on error', async () => {
    LlmProvider.provider = 'ollama'
    sinon.stub(axios, 'post').resolves({ data: {} })
    const result = await LlmProvider.complete('sys', 'user')
    expect(result).to.equal('')
  })
})
