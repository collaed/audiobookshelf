const { expect } = require('chai')
const sinon = require('sinon')
const SyncManager = require('../../../server/managers/SyncManager')
const LanguageLearningManager = require('../../../server/managers/LanguageLearningManager')

describe('SyncManager', () => {
  afterEach(() => sinon.restore())

  describe('wordOverlap', () => {
    it('should return 1 for identical texts', () => {
      expect(SyncManager.wordOverlap('hello world test', 'hello world test')).to.equal(1)
    })

    it('should return 0 for completely different texts', () => {
      expect(SyncManager.wordOverlap('alpha beta gamma', 'delta epsilon zeta')).to.equal(0)
    })

    it('should calculate partial overlap', () => {
      const score = SyncManager.wordOverlap('the quick brown foxes jumped', 'the slow brown foxes walked')
      expect(score).to.be.greaterThan(0).and.lessThan(1)
    })

    it('should filter short words (<=3 chars)', () => {
      expect(SyncManager.wordOverlap('the a is', 'the a is')).to.equal(0)
    })

    it('should return 0 for falsy input', () => {
      expect(SyncManager.wordOverlap(null, 'test')).to.equal(0)
      expect(SyncManager.wordOverlap('test', '')).to.equal(0)
    })
  })

  describe('findAlignmentPoints', () => {
    it('should find best matching position in ebook text', () => {
      const transcript = 'once upon time there lived brave knight'
      const ebookText = 'prologue intro once upon time there lived brave knight chapter'
      const result = SyncManager.findAlignmentPoints(transcript, ebookText)
      expect(result.matchScore).to.be.greaterThan(0.5)
      expect(result.matchedWords).to.be.greaterThan(0)
    })

    it('should return 0 score for no overlap', () => {
      const result = SyncManager.findAlignmentPoints('alpha beta gamma', 'delta epsilon zeta omega')
      expect(result.matchScore).to.equal(0)
    })
  })
})

describe('LanguageLearningManager', () => {
  afterEach(() => sinon.restore())

  describe('splitSentences', () => {
    it('should split on sentence-ending punctuation', () => {
      const result = LanguageLearningManager.splitSentences('Hello world. How are you? I am fine!')
      expect(result).to.deep.equal(['Hello world.', 'How are you?', 'I am fine!'])
    })

    it('should filter out short fragments', () => {
      const result = LanguageLearningManager.splitSentences('Hi. Ok. This is a real sentence.')
      expect(result).to.deep.equal(['This is a real sentence.'])
    })
  })
})
