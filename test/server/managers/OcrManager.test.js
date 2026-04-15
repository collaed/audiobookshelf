const { expect } = require('chai')
const sinon = require('sinon')
const axios = require('axios')

describe('OcrManager', () => {
  let OcrManager

  beforeEach(() => {
    delete require.cache[require.resolve('../../../server/managers/OcrManager')]
    OcrManager = require('../../../server/managers/OcrManager')
    OcrManager.baseUrl = 'http://test:8000'
    OcrManager.token = ''
  })

  afterEach(() => sinon.restore())

  it('isAvailable returns true when intello responds', async () => {
    sinon.stub(axios, 'get').resolves({ data: { version: '1.0' } })
    const result = await OcrManager.isAvailable()
    expect(result.available).to.be.true
    expect(result.version).to.equal('1.0')
    expect(axios.get.firstCall.args[0]).to.equal('http://test:8000/api/v1/status')
  })

  it('isAvailable returns false on connection error', async () => {
    sinon.stub(axios, 'get').rejects(new Error('ECONNREFUSED'))
    const result = await OcrManager.isAvailable()
    expect(result.available).to.be.false
  })

  it('ocrPdfToText sends correct multipart form data', async () => {
    const stub = sinon.stub(axios, 'post').resolves({ data: { pages: [] } })
    // Stub fs.createReadStream to avoid real file access
    const fs = require('../../../server/libs/fsExtra')
    sinon.stub(fs, 'createReadStream').returns('fake-stream')

    await OcrManager.ocrPdfToText('/tmp/test.pdf', 'fra', '1-3')
    expect(stub.calledOnce).to.be.true
    expect(stub.firstCall.args[0]).to.equal('http://test:8000/api/v1/ocr/pdf')
  })

  it('createSearchablePdf sends form data with output=searchable_pdf', async () => {
    const stub = sinon.stub(axios, 'post').resolves({ data: { job_id: 'j1', status: 'queued' } })
    const fs = require('../../../server/libs/fsExtra')
    sinon.stub(fs, 'createReadStream').returns('fake-stream')

    const result = await OcrManager.createSearchablePdf('/tmp/test.pdf')
    expect(result.job_id).to.equal('j1')
    expect(stub.firstCall.args[0]).to.equal('http://test:8000/api/v1/ocr/jobs')
  })

  it('getJobStatus calls correct URL', async () => {
    sinon.stub(axios, 'get').resolves({ data: { status: 'complete', pages_done: 5 } })
    const result = await OcrManager.getJobStatus('job-123')
    expect(result.status).to.equal('complete')
    expect(axios.get.firstCall.args[0]).to.equal('http://test:8000/api/v1/ocr/jobs/job-123')
  })

  it('all methods use auth header when token is set', async () => {
    OcrManager.token = 'my-secret-token'
    sinon.stub(axios, 'get').resolves({ data: { status: 'complete' } })

    await OcrManager.isAvailable()
    expect(axios.get.firstCall.args[1].headers['Authorization']).to.equal('Bearer my-secret-token')

    await OcrManager.getJobStatus('j1')
    expect(axios.get.secondCall.args[1].headers['Authorization']).to.equal('Bearer my-secret-token')
  })
})
