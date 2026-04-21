const axios = require('axios').default
const Logger = require('../Logger')
const Database = require('../Database')
const { namesMatch } = require('../utils/nameNormalizer')

/**
 * Calibre-style metadata download system.
 * Queries multiple sources in parallel, merges results with confidence scoring.
 *
 * Inspired by calibre/ebooks/metadata/sources/identify.py:
 * - Parallel workers per source
 * - Result merging with field-level confidence
 * - Best-match selection across sources
 */
class MetadataDownloadManager {
  constructor() {
    this.timeout = 15000
    this.sources = [
      { name: 'Audnexus', fn: this._fetchAudnexus.bind(this), weight: 3 },
      { name: 'GoogleBooks', fn: this._fetchGoogleBooks.bind(this), weight: 2 },
      { name: 'OpenLibrary', fn: this._fetchOpenLibrary.bind(this), weight: 2 },
      { name: 'Gutendex', fn: this._fetchGutendex.bind(this), weight: 1 },
    ]
  }

  /**
   * Download metadata from all sources in parallel, merge best results.
   * Calibre pattern: identify → merge → select best.
   *
   * @param {Object} query - { title, author, isbn, asin }
   * @returns {Promise<{results: Object[], bestMatch: Object, sources: string[]}>}
   */
  async identify(query) {
    const { title, author, isbn, asin } = query
    if (!title && !isbn && !asin) return { results: [], bestMatch: null, sources: [] }

    // Phase 1: Query all sources in parallel (Calibre Worker pattern)
    const promises = this.sources.map(async (source) => {
      try {
        const results = await source.fn({ title, author, isbn, asin })
        return { source: source.name, weight: source.weight, results: results || [] }
      } catch (err) {
        Logger.warn(`[MetadataDownload] ${source.name} failed: ${err.message}`)
        return { source: source.name, weight: source.weight, results: [] }
      }
    })

    const sourceResults = await Promise.all(promises)

    // Phase 2: Flatten and score all results
    const allResults = []
    for (const sr of sourceResults) {
      for (const r of sr.results) {
        r._source = sr.source
        r._sourceWeight = sr.weight
        r._score = this._scoreMatch(r, query)
        allResults.push(r)
      }
    }

    // Phase 3: Sort by score, deduplicate, select best
    allResults.sort((a, b) => b._score - a._score)

    const bestMatch = allResults.length ? this._mergeTopResults(allResults.slice(0, 5)) : null
    const activeSources = sourceResults.filter((s) => s.results.length > 0).map((s) => s.source)

    return {
      results: allResults.slice(0, 20),
      bestMatch,
      sources: activeSources,
      totalResults: allResults.length,
    }
  }

  /**
   * Download metadata and apply to a library item.
   */
  async downloadAndApply(bookId) {
    const book = await Database.bookModel.findByPk(bookId, {
      include: [{ model: Database.authorModel }]
    })
    if (!book) throw new Error('Book not found')

    const query = {
      title: book.title,
      author: book.authors?.[0]?.name || '',
      isbn: book.isbn,
      asin: book.asin,
    }

    const { bestMatch } = await this.identify(query)
    if (!bestMatch) return { updated: false, reason: 'No metadata found' }

    const updates = {}
    if (bestMatch.description && !book.description) updates.description = bestMatch.description
    if (bestMatch.publisher && !book.publisher) updates.publisher = bestMatch.publisher
    if (bestMatch.publishedYear && !book.publishedYear) updates.publishedYear = bestMatch.publishedYear
    if (bestMatch.isbn && !book.isbn) updates.isbn = bestMatch.isbn
    if (bestMatch.asin && !book.asin) updates.asin = bestMatch.asin
    if (bestMatch.language && !book.language) updates.language = bestMatch.language
    if (bestMatch.genres?.length && (!book.genres || !book.genres.length)) updates.genres = bestMatch.genres
    if (bestMatch.cover && !book.coverPath) updates.coverPath = bestMatch.cover

    if (Object.keys(updates).length) {
      await book.update(updates)
      return { updated: true, fields: Object.keys(updates), bestMatch }
    }

    return { updated: false, reason: 'All fields already populated', bestMatch }
  }

  /**
   * Score how well a result matches the query (0-100).
   */
  _scoreMatch(result, query) {
    let score = 0
    const stringSimilarity = require('string-similarity')

    // Title match (0-40)
    if (result.title && query.title) {
      score += stringSimilarity.compareTwoStrings(
        result.title.toLowerCase(), query.title.toLowerCase()
      ) * 40
    }

    // Author match (0-30)
    if (result.author && query.author) {
      if (namesMatch(result.author, query.author)) score += 30
      else score += stringSimilarity.compareTwoStrings(
        result.author.toLowerCase(), query.author.toLowerCase()
      ) * 20
    }

    // ISBN/ASIN exact match (bonus 20)
    if (query.isbn && result.isbn === query.isbn) score += 20
    if (query.asin && result.asin === query.asin) score += 20

    // Source weight bonus (0-10)
    score += (result._sourceWeight || 1) * 3

    // Has cover bonus
    if (result.cover) score += 5

    // Has description bonus
    if (result.description) score += 5

    return Math.round(Math.min(score, 100))
  }

  /**
   * Merge top N results into one best metadata object.
   * Takes the best field from each source (Calibre merge pattern).
   */
  _mergeTopResults(results) {
    const merged = { _sources: [], _confidence: 0 }
    const fields = ['title', 'author', 'description', 'publisher', 'publishedYear',
      'isbn', 'asin', 'language', 'cover', 'genres', 'series', 'seriesSequence',
      'narrator', 'duration']

    for (const field of fields) {
      // Pick the first non-empty value from highest-scored results
      for (const r of results) {
        const val = r[field]
        if (val && (typeof val !== 'object' || (Array.isArray(val) && val.length))) {
          if (!merged[field]) {
            merged[field] = val
            if (!merged._sources.includes(r._source)) merged._sources.push(r._source)
          }
        }
      }
    }

    merged._confidence = results[0]?._score || 0
    return merged
  }

  // === Source implementations ===

  async _fetchAudnexus({ title, author, isbn, asin }) {
    const results = []
    if (asin) {
      try {
        const { data } = await axios.get(`https://api.audnex.us/books/${asin}`, { timeout: this.timeout })
        if (data) results.push(this._cleanAudnexus(data))
      } catch {}
    }
    if (!results.length && title) {
      try {
        const q = encodeURIComponent(`${title} ${author || ''}`.trim())
        const { data } = await axios.get(`https://api.audnex.us/books?name=${q}&region=us`, { timeout: this.timeout })
        if (data?.products) {
          for (const p of data.products.slice(0, 3)) {
            try {
              const { data: full } = await axios.get(`https://api.audnex.us/books/${p.asin}?region=us`, { timeout: this.timeout })
              if (full) results.push(this._cleanAudnexus(full))
            } catch {}
          }
        }
      } catch {}
    }
    return results
  }

  _cleanAudnexus(d) {
    return {
      title: d.title, author: d.authors?.map((a) => a.name).join(', '),
      description: d.summary, publisher: d.publisherName,
      publishedYear: d.releaseDate?.slice(0, 4), isbn: d.isbn, asin: d.asin,
      language: d.language, cover: d.image,
      genres: d.genres?.map((g) => g.name) || [],
      narrator: d.narrators?.map((n) => n.name).join(', '),
      series: d.seriesPrimary?.name, seriesSequence: d.seriesPrimary?.position,
      duration: d.runtimeLengthMin,
    }
  }

  async _fetchGoogleBooks({ title, author, isbn }) {
    let q = isbn ? `isbn:${isbn}` : `intitle:${encodeURIComponent(title)}`
    if (author && !isbn) q += `+inauthor:${encodeURIComponent(author)}`
    try {
      const { data } = await axios.get(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=5`, { timeout: this.timeout })
      return (data.items || []).map((item) => {
        const v = item.volumeInfo || {}
        return {
          title: v.title, author: (v.authors || []).join(', '),
          description: v.description, publisher: v.publisher,
          publishedYear: v.publishedDate?.slice(0, 4),
          isbn: (v.industryIdentifiers || []).find((i) => i.type === 'ISBN_13')?.identifier,
          language: v.language, cover: v.imageLinks?.thumbnail,
          genres: v.categories || [],
        }
      })
    } catch { return [] }
  }

  async _fetchOpenLibrary({ title, author, isbn }) {
    try {
      let url
      if (isbn) {
        url = `https://openlibrary.org/isbn/${isbn}.json`
        const { data } = await axios.get(url, { timeout: this.timeout })
        const worksKey = data?.works?.[0]?.key
        if (worksKey) {
          const { data: work } = await axios.get(`https://openlibrary.org${worksKey}.json`, { timeout: this.timeout })
          return [{ title: work.title || data.title, description: typeof work.description === 'string' ? work.description : work.description?.value,
            publishedYear: data.publish_date, cover: data.covers?.[0] ? `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg` : null,
            isbn, language: data.languages?.[0]?.key?.replace('/languages/', '') }]
        }
      }
      const q = encodeURIComponent(`${title} ${author || ''}`.trim())
      const { data } = await axios.get(`https://openlibrary.org/search.json?q=${q}&limit=5`, { timeout: this.timeout })
      return (data.docs || []).map((d) => ({
        title: d.title, author: (d.author_name || []).join(', '),
        publishedYear: d.first_publish_year ? String(d.first_publish_year) : null,
        isbn: (d.isbn || [])[0], language: (d.language || [])[0],
        cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
      }))
    } catch { return [] }
  }

  async _fetchGutendex({ title, author }) {
    if (!title) return []
    try {
      const q = encodeURIComponent(title)
      const { data } = await axios.get(`https://gutendex.com/books/?search=${q}&languages=en`, { timeout: this.timeout })
      return (data.results || []).slice(0, 3).map((b) => ({
        title: b.title, author: b.authors?.map((a) => a.name).join(', '),
        language: (b.languages || [])[0],
        cover: b.formats?.['image/jpeg'],
        genres: b.subjects || [],
      }))
    } catch { return [] }
  }
}

module.exports = new MetadataDownloadManager()
