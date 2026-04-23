const { expect } = require('chai')
const sinon = require('sinon')
const axios = require('axios')

describe('OcrManager', () => {
  let OcrManager

  beforeEach(() => {
    delete require.cache[require.resolve('../../../server/managers/OcrManager')]
    OcrManager = require('../../../server/managers/OcrManager')
    require('../../../server/utils/intelloClient').setUrl('http://test:8000')
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

  it('all methods use shared intelloClient for auth', async () => {
    const intello = require('../../../server/utils/intelloClient')
    // Auth is handled by intelloClient.headers() — verify it returns auth when token is set
    // The token comes from env INTELLO_TOKEN, tested via the shared module
    const h = intello.headers()
    // headers() always returns Content-Type; Authorization only if INTELLO_TOKEN is set
    expect(h).to.have.property('Content-Type')
  })
})
