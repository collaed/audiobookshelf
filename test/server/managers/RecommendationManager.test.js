const { expect } = require('chai')
const sinon = require('sinon')
const RecommendationManager = require('../../../server/managers/RecommendationManager')

describe('RecommendationManager', () => {
  afterEach(() => sinon.restore())

  describe('extractThemes', () => {
    it('should extract word frequencies from text', () => {
      const themes = RecommendationManager.extractThemes('adventure adventure mystery mystery mystery')
      expect(themes.adventure).to.equal(2)
      expect(themes.mystery).to.equal(3)
    })

    it('should strip HTML tags', () => {
      const themes = RecommendationManager.extractThemes('<p>adventure <b>quest</b></p>')
      expect(themes.adventure).to.equal(1)
      expect(themes.quest).to.equal(1)
    })

    it('should filter stopwords and short words', () => {
      const themes = RecommendationManager.extractThemes('the is a an cat adventure')
      expect(themes).to.not.have.property('the')
      expect(themes).to.not.have.property('cat') // length <= 3
      expect(themes.adventure).to.equal(1)
    })

    it('should return empty object for falsy input', () => {
      expect(RecommendationManager.extractThemes(null)).to.deep.equal({})
      expect(RecommendationManager.extractThemes('')).to.deep.equal({})
    })
  })

  describe('scoreBook', () => {
    const profile = {
      genres: { fantasy: 3, scifi: 1 },
      narrators: { 'John Smith': 2 },
      authors: { 'Jane Doe': 4 },
      themes: { dragon: 5, magic: 3 }
    }

    it('should score higher for matching genres', () => {
      const book1 = { genres: ['fantasy'], narrators: [], authorNames: [] }
      const book2 = { genres: ['romance'], narrators: [], authorNames: [] }
      expect(RecommendationManager.scoreBook(book1, profile)).to.be.greaterThan(RecommendationManager.scoreBook(book2, profile))
    })

    it('should score higher for matching authors', () => {
      const book = { genres: [], narrators: [], authorNames: ['Jane Doe'] }
      expect(RecommendationManager.scoreBook(book, profile)).to.be.greaterThan(0)
    })

    it('should score 0 for no matches', () => {
      const book = { genres: ['romance'], narrators: ['Nobody'], authorNames: ['Unknown'] }
      expect(RecommendationManager.scoreBook(book, profile)).to.equal(0)
    })

    it('should include theme scoring from description', () => {
      const book = { genres: [], narrators: [], authorNames: [], description: 'dragon magic dragon' }
      expect(RecommendationManager.scoreBook(book, profile)).to.be.greaterThan(0)
    })
  })
})
