const { expect } = require('chai')
const sinon = require('sinon')
const axios = require('axios')
const ReviewManager = require('../../../server/managers/ReviewManager')

describe('ReviewManager - Provider Contracts', () => {
  afterEach(() => sinon.restore())

  describe('fetchOpenLibraryRatings', () => {
    it('handles valid response', async () => {
      const stub = sinon.stub(axios, 'get')
      // ISBN lookup -> works key
      stub.withArgs(sinon.match(/openlibrary\.org\/isbn/)).resolves({
        data: { works: [{ key: '/works/OL123W' }] }
      })
      // Ratings endpoint
      stub.withArgs(sinon.match(/ratings\.json/)).resolves({
        data: { summary: { average: 4.25, count: 150 } }
      })
      // Reviews endpoint
      stub.withArgs(sinon.match(/reviews\.json/)).resolves({
        data: { entries: [{ body: { value: 'Great book!' } }, { body: 'Loved it' }] }
      })

      const result = await ReviewManager.fetchOpenLibraryRatings('9780123456789', 'Test', 'Author')

      expect(result.source).to.equal('OpenLibrary')
      expect(result.rating).to.equal(4.25)
      expect(result.ratingCount).to.equal(150)
      expect(result.reviews).to.include('Great book!')
      expect(result.reviews).to.include('Loved it')
      expect(result.url).to.equal('https://openlibrary.org/works/OL123W')
    })

    it('handles missing data gracefully', async () => {
      sinon.stub(axios, 'get').resolves({ data: {} })

      const result = await ReviewManager.fetchOpenLibraryRatings(null, null, null)
      expect(result).to.be.null
    })
  })

  describe('fetchGoodreads', () => {
    it('handles valid response with JSON-LD', async () => {
      const html = `<html><script type="application/ld+json">{"@type":"Book","ratingValue":"4.12","ratingCount":"98432"}</script></html>`
      sinon.stub(axios, 'get').resolves({ data: html })

      const result = await ReviewManager.fetchGoodreads('9780123456789', 'Test', 'Author')

      expect(result.source).to.equal('Goodreads')
      expect(result.rating).to.equal(4.12)
      expect(result.ratingCount).to.equal(98432)
    })

    it('returns null on non-book page', async () => {
      sinon.stub(axios, 'get').resolves({ data: '<html><body>No books here</body></html>' })

      const result = await ReviewManager.fetchGoodreads(null, 'Nonexistent', 'Nobody')
      expect(result).to.be.null
    })
  })

  describe('fetchGoogleBooksRating', () => {
    it('handles valid response', async () => {
      sinon.stub(axios, 'get').resolves({
        data: {
          items: [{
            volumeInfo: {
              averageRating: 4.5,
              ratingsCount: 200,
              description: 'A great audiobook about testing.',
              previewLink: 'https://books.google.com/books?id=abc'
            }
          }]
        }
      })

      const result = await ReviewManager.fetchGoogleBooksRating('9780123456789', 'Test', 'Author')

      expect(result.source).to.equal('Google Books')
      expect(result.rating).to.equal(4.5)
      expect(result.ratingCount).to.equal(200)
      expect(result.reviews).to.have.lengthOf(1)
      expect(result.url).to.equal('https://books.google.com/books?id=abc')
    })
  })

  describe('fetchAudnexusRating', () => {
    it('handles valid ASIN', async () => {
      sinon.stub(axios, 'get').resolves({
        data: { rating: '4.7', ratingCount: '1234' }
      })

      const result = await ReviewManager.fetchAudnexusRating('B08G9PRS1K')

      expect(result.source).to.equal('Audible')
      expect(result.rating).to.equal(4.7)
      expect(result.ratingCount).to.equal(1234)
      expect(result.url).to.include('B08G9PRS1K')
    })

    it('returns null for invalid ASIN', async () => {
      const result = await ReviewManager.fetchAudnexusRating('invalid')
      expect(result).to.be.null
    })
  })

  describe('all providers return null on network error', () => {
    beforeEach(() => {
      sinon.stub(axios, 'get').rejects(new Error('ECONNREFUSED'))
      sinon.stub(axios, 'post').rejects(new Error('ECONNREFUSED'))
    })

    it('fetchOpenLibraryRatings returns null', async () => {
      expect(await ReviewManager.fetchOpenLibraryRatings('isbn', 'title', 'author')).to.be.null
    })

    it('fetchGoodreads returns null', async () => {
      expect(await ReviewManager.fetchGoodreads('isbn', 'title', 'author')).to.be.null
    })

    it('fetchGoogleBooksRating returns null', async () => {
      expect(await ReviewManager.fetchGoogleBooksRating('isbn', 'title', 'author')).to.be.null
    })

    it('fetchAudnexusRating returns null', async () => {
      expect(await ReviewManager.fetchAudnexusRating('B08G9PRS1K')).to.be.null
    })

    it('fetchHardcoverRatings returns null', async () => {
      expect(await ReviewManager.fetchHardcoverRatings('isbn', 'title')).to.be.null
    })

    it('fetchStorygraph returns null', async () => {
      expect(await ReviewManager.fetchStorygraph('isbn', 'title', 'author')).to.be.null
    })

    it('fetchWikidataEnrichment returns null', async () => {
      expect(await ReviewManager.fetchWikidataEnrichment('title', 'author')).to.be.null
    })
  })
})
