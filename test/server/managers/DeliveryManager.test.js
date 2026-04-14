const { expect } = require('chai')
const sinon = require('sinon')
const DeliveryManager = require('../../../server/managers/DeliveryManager')

describe('DeliveryManager', () => {
  afterEach(() => sinon.restore())

  describe('detectReaderType', () => {
    it('should detect kindle emails', () => {
      expect(DeliveryManager.detectReaderType('user@kindle.com')).to.equal('kindle')
      expect(DeliveryManager.detectReaderType('user@free.kindle.com')).to.equal('kindle')
    })

    it('should detect kobo emails', () => {
      expect(DeliveryManager.detectReaderType('user@rakutenkobo.com')).to.equal('kobo')
    })

    it('should detect pocketbook emails', () => {
      expect(DeliveryManager.detectReaderType('user@pbsync.com')).to.equal('pocketbook')
    })

    it('should return generic for unknown domains', () => {
      expect(DeliveryManager.detectReaderType('user@gmail.com')).to.equal('generic')
    })

    it('should be case-insensitive', () => {
      expect(DeliveryManager.detectReaderType('User@Kindle.COM')).to.equal('kindle')
    })
  })

  describe('getMobileLinks', () => {
    it('should generate correct link structure', () => {
      const links = DeliveryManager.getMobileLinks('item123', 'https://abs.example.com')
      expect(links.audiobookshelf).to.equal('audiobookshelf://item/item123')
      expect(links.web).to.equal('https://abs.example.com/item/item123')
      expect(links.download).to.equal('https://abs.example.com/api/items/item123/download')
      expect(links.share).to.equal('https://abs.example.com/share/item123')
    })
  })

  describe('getOpdsEntry', () => {
    it('should generate entry with ebook and cover links', () => {
      const book = {
        id: 'b1',
        title: 'Test Book',
        description: 'A test',
        language: 'en',
        ebookFile: { ebookFormat: 'epub', ino: 'ino1' },
        audioFiles: null,
        coverPath: '/covers/b1.jpg'
      }
      const libraryItem = { id: 'li1', updatedAt: new Date() }
      const entry = DeliveryManager.getOpdsEntry(book, libraryItem, 'https://abs.example.com')

      expect(entry.id).to.equal('urn:abs:b1')
      expect(entry.title).to.equal('Test Book')
      expect(entry.links).to.have.length(2) // ebook + cover
      expect(entry.links[0].type).to.equal('application/epub+zip')
      expect(entry.links[1].rel).to.equal('http://opds-spec.org/image')
    })

    it('should include audio links when audioFiles present', () => {
      const book = {
        id: 'b2',
        title: 'Audio Book',
        description: '',
        language: 'en',
        ebookFile: null,
        audioFiles: [{ id: 'af1' }],
        coverPath: null
      }
      const entry = DeliveryManager.getOpdsEntry(book, { id: 'li2', updatedAt: new Date() }, 'https://abs.example.com')
      expect(entry.links).to.have.length(2) // zip download + stream
    })
  })
})
