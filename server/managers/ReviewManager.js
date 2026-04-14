const axios = require('axios').default
const Logger = require('../Logger')
const Database = require('../Database')
const { isValidASIN } = require('../utils/index')

/**
 * @typedef ReviewData
 * @property {string} source
 * @property {number} rating - 0-5 scale
 * @property {number} ratingCount
 * @property {string[]} reviews - text excerpts
 * @property {string} url - link to reviews page
 */

class ReviewManager {
  constructor() {
    this.timeout = 10000
    this.cache = new Map() // bookId -> { data, fetchedAt }
    this.cacheTTL = 24 * 60 * 60 * 1000 // 24h
  }

  /**
   * Aggregate reviews from all available sources for a book
   * @param {string} bookId
   * @returns {Promise<{sources: ReviewData[], avgRating: number, totalRatings: number}>}
   */
  async getReviews(bookId) {
    // Check cache
    const cached = this.cache.get(bookId)
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) {
      return cached.data
    }

    const book = await Database.bookModel.findByPk(bookId, {
      include: [{ model: Database.authorModel }]
    })
    if (!book) return { sources: [], avgRating: 0, totalRatings: 0 }

    const title = book.title
    const author = book.authors?.[0]?.name || ''
    const asin = book.asin
    const isbn = book.isbn

    // Fetch from all sources in parallel
    const fetchers = [
      this.fetchAudnexusRating(asin),
      this.fetchOpenLibraryRatings(isbn, title, author),
      this.fetchGoodreads(isbn, title, author),
      this.fetchHardcoverRatings(isbn, title),
      this.fetchStorygraph(isbn, title, author),
    ]

    const results = await Promise.allSettled(fetchers)
    const sources = results
      .filter((r) => r.status === 'fulfilled' && r.value)
      .map((r) => r.value)

    // Calculate weighted average
    let totalWeightedRating = 0
    let totalRatings = 0
    for (const s of sources) {
      if (s.rating > 0 && s.ratingCount > 0) {
        totalWeightedRating += s.rating * s.ratingCount
        totalRatings += s.ratingCount
      }
    }
    const avgRating = totalRatings > 0 ? Math.round((totalWeightedRating / totalRatings) * 100) / 100 : 0

    const data = { sources, avgRating, totalRatings }
    this.cache.set(bookId, { data, fetchedAt: Date.now() })
    return data
  }

  /**
   * Audnexus — already used by ABS, has Audible ratings
   */
  async fetchAudnexusRating(asin) {
    if (!asin || !isValidASIN(asin)) return null
    try {
      const { data } = await axios.get(`https://api.audnex.us/books/${asin}`, { timeout: this.timeout })
      if (!data?.rating) return null
      return {
        source: 'Audible',
        rating: parseFloat(data.rating) || 0,
        ratingCount: parseInt(data.ratingCount) || 0,
        reviews: [],
        url: `https://www.audible.com/pd/${asin}`
      }
    } catch {
      return null
    }
  }

  /**
   * Open Library — free API, has ratings and reviews
   */
  async fetchOpenLibraryRatings(isbn, title, author) {
    try {
      let worksKey = null
      if (isbn) {
        const { data } = await axios.get(`https://openlibrary.org/isbn/${isbn}.json`, { timeout: this.timeout })
        worksKey = data?.works?.[0]?.key
      }
      if (!worksKey && title) {
        const q = encodeURIComponent(`${title} ${author}`.trim())
        const { data } = await axios.get(`https://openlibrary.org/search.json?q=${q}&limit=1`, { timeout: this.timeout })
        worksKey = data?.docs?.[0]?.key
      }
      if (!worksKey) return null

      const { data } = await axios.get(`https://openlibrary.org${worksKey}/ratings.json`, { timeout: this.timeout })
      if (!data?.summary?.average) return null

      // Also try to get reviews
      let reviews = []
      try {
        const rev = await axios.get(`https://openlibrary.org${worksKey}/reviews.json`, { timeout: this.timeout })
        reviews = (rev.data?.entries || []).slice(0, 5).map((e) => e.body?.value || e.body || '').filter(Boolean)
      } catch {}

      return {
        source: 'OpenLibrary',
        rating: Math.round(data.summary.average * 100) / 100,
        ratingCount: data.summary.count || 0,
        reviews,
        url: `https://openlibrary.org${worksKey}`
      }
    } catch {
      return null
    }
  }

  /**
   * Goodreads — scrape rating from public book page via ISBN
   * No API key needed, just the public page
   */
  async fetchGoodreads(isbn, title, author) {
    try {
      let url
      if (isbn) {
        url = `https://www.goodreads.com/book/isbn/${isbn}`
      } else {
        const q = encodeURIComponent(`${title} ${author}`.trim())
        url = `https://www.goodreads.com/search?q=${q}`
      }

      const { data } = await axios.get(url, {
        timeout: this.timeout,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Audiobookshelf/1.0)' },
        maxRedirects: 5
      })

      // Extract rating from JSON-LD or meta tags
      const ratingMatch = data.match(/"ratingValue":\s*"?([\d.]+)"?/)
      const countMatch = data.match(/"ratingCount":\s*"?(\d+)"?/)

      if (!ratingMatch) return null

      // Extract a few review snippets
      const reviews = []
      const reviewMatches = data.matchAll(/<span[^>]*class="[^"]*reviewText[^"]*"[^>]*>(.*?)<\/span>/gs)
      for (const m of reviewMatches) {
        const text = m[1].replace(/<[^>]+>/g, '').trim()
        if (text.length > 20 && text.length < 500) {
          reviews.push(text)
          if (reviews.length >= 3) break
        }
      }

      return {
        source: 'Goodreads',
        rating: parseFloat(ratingMatch[1]) || 0,
        ratingCount: parseInt(countMatch?.[1]) || 0,
        reviews,
        url
      }
    } catch {
      return null
    }
  }

  /**
   * Hardcover.app — newer book community, has a public GraphQL API
   */
  async fetchHardcoverRatings(isbn, title) {
    try {
      const query = isbn
        ? `query { books(where: {isbn_13: {_eq: "${isbn}"}}, limit: 1) { title rating users_read_count } }`
        : `query { books(where: {title: {_ilike: "%${title.replace(/"/g, '')}%"}}, limit: 1) { title rating users_read_count } }`

      const { data } = await axios.post('https://api.hardcover.app/v1/graphql', { query }, {
        timeout: this.timeout,
        headers: { 'Content-Type': 'application/json' }
      })

      const book = data?.data?.books?.[0]
      if (!book?.rating) return null

      return {
        source: 'Hardcover',
        rating: Math.round(book.rating * 100) / 100,
        ratingCount: book.users_read_count || 0,
        reviews: [],
        url: `https://hardcover.app/books/${encodeURIComponent(title)}`
      }
    } catch {
      return null
    }
  }

  /**
   * The StoryGraph — audiobook-friendly community
   * Scrape public search results
   */
  async fetchStorygraph(isbn, title, author) {
    try {
      const q = encodeURIComponent(isbn || `${title} ${author}`.trim())
      const { data } = await axios.get(`https://app.thestorygraph.com/browse?search_term=${q}`, {
        timeout: this.timeout,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Audiobookshelf/1.0)' }
      })

      const ratingMatch = data.match(/([\d.]+)\s*(?:\/\s*5|stars?)/)
      if (!ratingMatch) return null

      return {
        source: 'StoryGraph',
        rating: parseFloat(ratingMatch[1]) || 0,
        ratingCount: 0,
        reviews: [],
        url: `https://app.thestorygraph.com/browse?search_term=${q}`
      }
    } catch {
      return null
    }
  }

  /**
   * Build a review URL for Amazon by locale
   */
  getAmazonReviewUrl(asin, locale = 'com') {
    const domains = { us: 'com', fr: 'fr', de: 'de', uk: 'co.uk', it: 'it', es: 'es', ca: 'ca', au: 'com.au', jp: 'co.jp' }
    const domain = domains[locale] || locale
    return `https://www.amazon.${domain}/dp/${asin}#customerReviews`
  }
}

module.exports = new ReviewManager()
