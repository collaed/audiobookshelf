const { expect } = require('chai')
const sinon = require('sinon')
const GroupingManager = require('../../../server/managers/GroupingManager')

describe('GroupingManager', () => {
  afterEach(() => sinon.restore())

  describe('normalizeTitle', () => {
    it('should strip chapter/part/disc words and numbers', () => {
      expect(GroupingManager.normalizeTitle('The Great Book Chapter 5')).to.equal('the great')
      expect(GroupingManager.normalizeTitle('My Audiobook Disc 2')).to.equal('my')
      expect(GroupingManager.normalizeTitle('Volume 3 - Part 1')).to.equal('')
    })

    it('should normalize punctuation and whitespace', () => {
      expect(GroupingManager.normalizeTitle('Hello: World (Unabridged)')).to.equal('hello world')
    })

    it('should return empty string for falsy input', () => {
      expect(GroupingManager.normalizeTitle(null)).to.equal('')
      expect(GroupingManager.normalizeTitle('')).to.equal('')
    })
  })

  describe('extractSequence', () => {
    it('should extract chapter numbers', () => {
      expect(GroupingManager.extractSequence('Chapter 5 - The Beginning')).to.equal(5)
      expect(GroupingManager.extractSequence('ch3_intro')).to.equal(3)
    })

    it('should extract part/disc numbers', () => {
      expect(GroupingManager.extractSequence('Part 2')).to.equal(2)
      expect(GroupingManager.extractSequence('Disc 10')).to.equal(10)
    })

    it('should return null when no sequence found', () => {
      expect(GroupingManager.extractSequence('Just a title')).to.be.null
      expect(GroupingManager.extractSequence(null)).to.be.null
    })
  })

  describe('similarity', () => {
    it('should return 1 for identical strings', () => {
      expect(GroupingManager.similarity('hello world', 'hello world')).to.equal(1)
    })

    it('should return 0.9 when one contains the other', () => {
      expect(GroupingManager.similarity('hello', 'hello world')).to.equal(0.9)
    })

    it('should calculate Jaccard overlap for partial matches', () => {
      const score = GroupingManager.similarity('the quick brown fox', 'the quick red dog')
      expect(score).to.be.greaterThan(0).and.lessThan(0.9)
    })

    it('should return 0 for falsy input', () => {
      expect(GroupingManager.similarity(null, 'test')).to.equal(0)
      expect(GroupingManager.similarity('test', '')).to.equal(0)
    })
  })

  describe('detectMissingParts', () => {
    it('should find gaps in sequences', () => {
      expect(GroupingManager.detectMissingParts([1, 2, 4, 6])).to.deep.equal([3, 5])
    })

    it('should return empty for consecutive sequences', () => {
      expect(GroupingManager.detectMissingParts([1, 2, 3])).to.deep.equal([])
    })

    it('should handle duplicates', () => {
      expect(GroupingManager.detectMissingParts([1, 1, 3])).to.deep.equal([2])
    })

    it('should return empty for empty input', () => {
      expect(GroupingManager.detectMissingParts([])).to.deep.equal([])
    })
  })
})
