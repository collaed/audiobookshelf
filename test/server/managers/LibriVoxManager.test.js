const { expect } = require('chai')
const sinon = require('sinon')
const axios = require('axios')
const LibriVox = require('../../../server/providers/LibriVox')

describe('LibriVox Provider', () => {
  afterEach(() => sinon.restore())

  describe('cleanResult', () => {
    const provider = new LibriVox()

    it('transforms API response correctly', () => {
      const raw = {
        title: 'Pride and Prejudice',
        authors: [{ first_name: 'Jane', last_name: 'Austen' }],
        description: 'A classic novel',
        language: 'English',
        copyright_year: '1813',
        totaltime: '11:30:00',
        totaltimesecs: '41400',
        num_sections: '61',
        url_rss: 'http://example.com/rss',
        url_zip_file: 'http://example.com/zip',
        url_librivox: 'http://example.com/book'
      }
      const result = provider.cleanResult(raw)
      expect(result.title).to.equal('Pride and Prejudice')
      expect(result.author).to.equal('Jane Austen')
      expect(result.durationSeconds).to.equal(41400)
      expect(result.sections).to.equal(61)
      expect(result.rssUrl).to.equal('http://example.com/rss')
    })

    it('handles missing fields', () => {
      const result = provider.cleanResult({ title: 'Unknown' })
      expect(result.author).to.be.null
      expect(result.year).to.be.null
      expect(result.durationSeconds).to.equal(0)
      expect(result.sections).to.equal(0)
      expect(result.rssUrl).to.be.null
    })
  })
})

describe('LibriVoxManager', () => {
  let LibriVoxManager

  beforeEach(() => {
    delete require.cache[require.resolve('../../../server/managers/LibriVoxManager')]
    LibriVoxManager = require('../../../server/managers/LibriVoxManager')
  })

  afterEach(() => sinon.restore())

  it('search returns cleaned results', async () => {
    sinon.stub(axios, 'get').resolves({
      data: {
        books: [{ title: 'Moby Dick', authors: [{ first_name: 'Herman', last_name: 'Melville' }], totaltimesecs: '100' }]
      }
    })
    const results = await LibriVoxManager.search('Moby Dick')
    expect(results).to.be.an('array').with.lengthOf(1)
    expect(results[0].title).to.equal('Moby Dick')
    expect(results[0].author).to.equal('Herman Melville')
  })

  it('getChaptersFromRss parses RSS XML', async () => {
    const rssXml = `<rss><channel>
      <item>
        <title>Chapter 1</title>
        <enclosure url="http://example.com/ch1.mp3"/>
        <itunes:duration>10:30</itunes:duration>
      </item>
    </channel></rss>`
    sinon.stub(axios, 'get').resolves({ data: rssXml })

    const chapters = await LibriVoxManager.getChaptersFromRss('http://example.com/rss')
    expect(chapters).to.be.an('array').with.lengthOf(1)
    expect(chapters[0].title).to.equal('Chapter 1')
    expect(chapters[0].url).to.equal('http://example.com/ch1.mp3')
    expect(chapters[0].duration).to.equal('10:30')
  })
})
