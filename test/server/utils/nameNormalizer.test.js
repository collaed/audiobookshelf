const chai = require('chai')
const expect = chai.expect
const { parseName, normalizeName, namesMatch, formatName } = require('../../../server/utils/nameNormalizer')

describe('nameNormalizer', () => {
  describe('parseName', () => {
    it('should parse first-last format', () => {
      expect(parseName('J.R.R. Tolkien')).to.deep.equal({ first: 'J.R.R.', last: 'Tolkien', full: 'J.R.R. Tolkien' })
    })

    it('should parse last-comma-first format', () => {
      expect(parseName('Tolkien, J.R.R.')).to.deep.equal({ first: 'J.R.R.', last: 'Tolkien', full: 'J.R.R. Tolkien' })
    })

    it('should parse name with suffix after comma', () => {
      const result = parseName('Alexandre Dumas, père')
      expect(result).to.deep.equal({ first: 'Alexandre', last: 'Dumas', suffix: 'père', full: 'Alexandre Dumas' })
    })

    it('should parse prefixed last name (Le Guin)', () => {
      expect(parseName('Ursula K. Le Guin')).to.deep.equal({ first: 'Ursula K.', last: 'Le Guin', full: 'Ursula K. Le Guin' })
    })

    it('should parse prefixed last name (van Beethoven)', () => {
      expect(parseName('Ludwig van Beethoven')).to.deep.equal({ first: 'Ludwig', last: 'van Beethoven', full: 'Ludwig van Beethoven' })
    })

    it('should parse single name', () => {
      expect(parseName('Homer')).to.deep.equal({ first: '', last: 'Homer', full: 'Homer' })
    })
  })

  describe('normalizeName', () => {
    it('should normalize first-last format', () => {
      expect(normalizeName('J.R.R. Tolkien')).to.equal('tolkien jrr')
    })

    it('should normalize last-comma-first format identically', () => {
      expect(normalizeName('Tolkien, J.R.R.')).to.equal('tolkien jrr')
    })

    it('should normalize all-caps last name format', () => {
      expect(normalizeName('TOLKIEN John Ronald Reuel')).to.equal('tolkien john ronald reuel')
    })
  })

  describe('namesMatch', () => {
    it('should match same name in different formats', () => {
      expect(namesMatch('J.R.R. Tolkien', 'Tolkien, J.R.R.')).to.be.true
    })

    it('should match first-last with last-comma-first', () => {
      expect(namesMatch('John Smith', 'Smith, John')).to.be.true
    })

    it('should match initial to full first name', () => {
      expect(namesMatch('J. Smith', 'John Smith')).to.be.true
    })

    it('should match with missing middle name', () => {
      expect(namesMatch('Ursula Le Guin', 'Le Guin, Ursula K.')).to.be.true
    })

    it('should match identical single names', () => {
      expect(namesMatch('Homer', 'Homer')).to.be.true
    })

    it('should not match different first names', () => {
      expect(namesMatch('John Smith', 'Jane Smith')).to.be.false
    })
  })

  describe('formatName', () => {
    const parsed = parseName('J.R.R. Tolkien')

    it('should format as first-last', () => {
      expect(formatName(parsed, 'first-last')).to.equal('J.R.R. Tolkien')
    })

    it('should format as last-first', () => {
      expect(formatName(parsed, 'last-first')).to.equal('Tolkien, J.R.R.')
    })

    it('should format as last-only', () => {
      expect(formatName(parsed, 'last-only')).to.equal('Tolkien')
    })

    it('should format as short', () => {
      expect(formatName(parsed, 'short')).to.equal('J. Tolkien')
    })
  })
})
