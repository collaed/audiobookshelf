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

    it('should return low score for completely different texts', () => {
      const score = SyncManager.wordOverlap('the magnificent elephant roamed freely', 'quantum physics explains gravity well')
      expect(score).to.be.lessThan(0.3)
    })

    it('should calculate partial overlap', () => {
      const score = SyncManager.wordOverlap('the quick brown foxes jumped', 'the slow brown foxes walked')
      expect(score).to.be.greaterThan(0.3).and.lessThan(1)
    })

    it('should return 0 for falsy input', () => {
      expect(SyncManager.wordOverlap(null, 'test')).to.equal(0)
      expect(SyncManager.wordOverlap('test', '')).to.equal(0)
    })
  })

  describe('findAlignmentPoints', () => {
    it('should find matching position with sufficient text', () => {
      const transcript = 'once upon a time there lived a brave knight in a faraway kingdom who fought dragons'
      const words = 'prologue introduction chapter one ' + transcript + ' chapter two the end of the story'
      const result = SyncManager.findAlignmentPoints(transcript, words)
      expect(result).to.have.property('matchScore')
      expect(result).to.have.property('ebookWordPosition')
      expect(result).to.have.property('matchedWords')
    })

    it('should return 0 score for no overlap', () => {
      const result = SyncManager.findAlignmentPoints('alpha beta', 'delta epsilon')
      expect(result.matchScore).to.equal(0)
    })
  })
})

describe('LanguageLearningManager', () => {
  afterEach(() => sinon.restore())

  describe('splitSentences', () => {
    it('should split on sentence-ending punctuation', () => {
      const result = LanguageLearningManager.splitSentences('Hello world. How are you? I am fine!')
      expect(result).to.have.lengthOf(3)
      expect(result[0]).to.include('Hello world')
      expect(result[1]).to.include('How are you')
      expect(result[2]).to.include('I am fine')
    })

    it('should filter out short fragments', () => {
      const result = LanguageLearningManager.splitSentences('This is a real sentence that should be kept.')
      expect(result.length).to.be.greaterThan(0)
      expect(result[0]).to.include('real sentence')
    })
  })
})
