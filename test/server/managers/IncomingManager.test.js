const { expect } = require('chai')
const sinon = require('sinon')
const Path = require('path')
const IncomingManager = require('../../../server/managers/IncomingManager')

describe('IncomingManager', () => {
  afterEach(() => sinon.restore())

  beforeEach(() => {
    IncomingManager.incomingPath = '/incoming'
  })

  describe('parseFilename', () => {
    it('should parse Author - Title from flat file', () => {
      const result = IncomingManager.parseFilename('/incoming/Brandon Sanderson - Mistborn.m4b')
      expect(result.author).to.equal('Brandon Sanderson')
      expect(result.title).to.equal('Mistborn')
      expect(result.fileFormat).to.equal('m4b')
    })

    it('should parse Author/Title from two-level path', () => {
      const result = IncomingManager.parseFilename(Path.join('/incoming', 'Author Name', 'Book Title.mp3'))
      expect(result.author).to.equal('Author Name')
      expect(result.title).to.equal('Book Title')
    })

    it('should parse Author/Series/Book N - Title from three-level path', () => {
      const result = IncomingManager.parseFilename(Path.join('/incoming', 'Tolkien', 'Lord of the Rings', 'Book 1 - Fellowship.m4b'))
      expect(result.author).to.equal('Tolkien')
      expect(result.series).to.equal('Lord of the Rings')
      expect(result.sequence).to.equal('1')
      expect(result.title).to.equal('Fellowship')
    })

    it('should use basename as title when no author separator', () => {
      const result = IncomingManager.parseFilename('/incoming/JustATitle.m4b')
      expect(result.title).to.equal('JustATitle')
      expect(result.author).to.be.null
    })
  })

  describe('titleSimilarity', () => {
    it('should return 1 for exact match', () => {
      expect(IncomingManager.titleSimilarity('Mistborn', 'Mistborn')).to.equal(1)
    })

    it('should return 0.8 when one contains the other', () => {
      expect(IncomingManager.titleSimilarity('Mistborn', 'Mistborn: The Final Empire')).to.equal(0.8)
    })

    it('should return 0 for no match', () => {
      expect(IncomingManager.titleSimilarity('Mistborn', 'Dune')).to.equal(0)
    })

    it('should return 0 for falsy input', () => {
      expect(IncomingManager.titleSimilarity(null, 'test')).to.equal(0)
    })
  })
})
