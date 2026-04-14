const { expect } = require('chai')
const sinon = require('sinon')
const ReviewManager = require('../../../server/managers/ReviewManager')

describe('ReviewManager', () => {
  afterEach(() => sinon.restore())

  describe('getAmazonReviewUrl', () => {
    it('should generate US URL by default', () => {
      expect(ReviewManager.getAmazonReviewUrl('B001234', 'com')).to.equal('https://www.amazon.com/dp/B001234#customerReviews')
    })

    it('should map locale codes to domains', () => {
      expect(ReviewManager.getAmazonReviewUrl('B001234', 'uk')).to.equal('https://www.amazon.co.uk/dp/B001234#customerReviews')
      expect(ReviewManager.getAmazonReviewUrl('B001234', 'de')).to.equal('https://www.amazon.de/dp/B001234#customerReviews')
      expect(ReviewManager.getAmazonReviewUrl('B001234', 'au')).to.equal('https://www.amazon.com.au/dp/B001234#customerReviews')
      expect(ReviewManager.getAmazonReviewUrl('B001234', 'jp')).to.equal('https://www.amazon.co.jp/dp/B001234#customerReviews')
    })

    it('should use locale as domain if not in map', () => {
      expect(ReviewManager.getAmazonReviewUrl('B001234', 'nl')).to.equal('https://www.amazon.nl/dp/B001234#customerReviews')
    })
  })

  describe('cache behavior', () => {
    it('should return cached data within TTL', async () => {
      const cachedData = { sources: [{ source: 'test', rating: 4.5 }], avgRating: 4.5, totalRatings: 10 }
      ReviewManager.cache.set('book123', { data: cachedData, fetchedAt: Date.now() })

      const result = await ReviewManager.getReviews('book123')
      expect(result).to.deep.equal(cachedData)

      ReviewManager.cache.delete('book123')
    })
  })
})
