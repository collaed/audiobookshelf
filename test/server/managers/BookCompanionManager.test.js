const { expect } = require('chai')
const sinon = require('sinon')

describe('BookCompanionManager', () => {
  let BookCompanionManager, LlmProvider, Database

  beforeEach(() => {
    LlmProvider = require('../../../server/managers/LlmProvider')
    Database = require('../../../server/Database')
  })

  afterEach(() => sinon.restore())

  it('getTextUpTo returns empty string for missing book', async () => {
    delete require.cache[require.resolve('../../../server/managers/BookCompanionManager')]
    BookCompanionManager = require('../../../server/managers/BookCompanionManager')
    sinon.stub(Database, 'bookModel').value({ findByPk: sinon.stub().resolves(null) })

    const result = await BookCompanionManager.getTextUpTo('missing-id', 50)
    expect(result).to.equal('')
  })

  it('smartSearch returns results array', async () => {
    delete require.cache[require.resolve('../../../server/managers/BookCompanionManager')]
    BookCompanionManager = require('../../../server/managers/BookCompanionManager')

    sinon.stub(Database, 'bookModel').value({
      findAll: sinon.stub().resolves([
        { id: 'b1', title: 'Dune', authors: [{ name: 'Herbert' }], genres: ['sci-fi'], language: 'en', description: 'Desert planet' }
      ])
    })
    sinon.stub(LlmProvider, 'complete').resolves('[{"id":"b1","reason":"matches sci-fi theme"}]')

    const result = await BookCompanionManager.smartSearch('science fiction', 'user1')
    expect(result.results).to.be.an('array')
    expect(result.results[0].title).to.equal('Dune')
    expect(result.results[0].reason).to.equal('matches sci-fi theme')
  })

  it('smartSearch handles malformed LLM response gracefully', async () => {
    delete require.cache[require.resolve('../../../server/managers/BookCompanionManager')]
    BookCompanionManager = require('../../../server/managers/BookCompanionManager')

    sinon.stub(Database, 'bookModel').value({ findAll: sinon.stub().resolves([]) })
    // Response contains brackets but invalid JSON inside — triggers catch branch
    sinon.stub(LlmProvider, 'complete').resolves('Here are results: [not valid json}]')

    const result = await BookCompanionManager.smartSearch('anything', 'user1')
    expect(result.results).to.deep.equal([])
    expect(result.rawResponse).to.be.a('string')
  })

  it('checkAlignmentQuality returns ratings array', async () => {
    delete require.cache[require.resolve('../../../server/managers/BookCompanionManager')]
    BookCompanionManager = require('../../../server/managers/BookCompanionManager')

    sinon.stub(LlmProvider, 'complete').resolves('[{"pair":1,"rating":"GOOD","note":"exact match"}]')

    const pairs = [{ source: 'Hello world', target: 'Bonjour le monde' }]
    const result = await BookCompanionManager.checkAlignmentQuality(pairs)
    expect(result.ratings).to.be.an('array').with.lengthOf(1)
    expect(result.ratings[0].rating).to.equal('GOOD')
    expect(result.pairsChecked).to.equal(1)
  })
})
