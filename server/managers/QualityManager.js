const Sequelize = require('sequelize')
const Logger = require('../Logger')
const Database = require('../Database')

class QualityManager {
  constructor() {
    this.minBitrate = 64
    this.goodBitrate = 128
  }

  analyzeAudioFiles(audioFiles) {
    if (!audioFiles?.length) return { score: 0, bitrate: 0, hasChapters: false, format: null, channels: 0, issues: ['No audio files'] }

    const issues = []
    let totalBitrate = 0
    let hasChapters = false
    const formats = new Set()
    const channelSet = new Set()
    let hasCodec = true

    for (const af of audioFiles) {
      totalBitrate += af.bitRate || 0
      if (af.chapters?.length) hasChapters = true
      if (af.format) formats.add(af.format)
      if (af.channels) channelSet.add(af.channels)
      if (!af.codec) hasCodec = false
    }

    const avgBitrate = totalBitrate / audioFiles.length

    // Bitrate score: 0-40
    let bitrateScore = 0
    if (avgBitrate >= this.goodBitrate) {
      bitrateScore = 40
    } else if (avgBitrate >= this.minBitrate) {
      bitrateScore = Math.round(((avgBitrate - this.minBitrate) / (this.goodBitrate - this.minBitrate)) * 40)
    }
    if (avgBitrate < this.minBitrate) issues.push(`Low bitrate: ${Math.round(avgBitrate)}kbps`)

    // Chapters: 20
    const chapterScore = hasChapters ? 20 : 0
    if (!hasChapters) issues.push('No chapters')

    // Consistent format: 20
    const formatScore = formats.size <= 1 ? 20 : 0
    if (formats.size > 1) issues.push(`Mixed formats: ${[...formats].join(', ')}`)

    // Channels: 10 (mono=1 or stereo=2)
    const channelScore = channelSet.size > 0 && [...channelSet].every((c) => c <= 2) ? 10 : 0
    if ([...channelSet].some((c) => c > 2)) issues.push('Unusual channel count')

    // Codec info: 10
    const codecScore = hasCodec ? 10 : 0
    if (!hasCodec) issues.push('Missing codec info')

    return {
      score: bitrateScore + chapterScore + formatScore + channelScore + codecScore,
      bitrate: Math.round(avgBitrate),
      hasChapters,
      format: formats.size === 1 ? [...formats][0] : [...formats].join(', ') || null,
      channels: channelSet.size === 1 ? [...channelSet][0] : [...channelSet],
      issues
    }
  }

  async analyzeLibrary(libraryId) {
    const books = await Database.bookModel.findAll({
      include: {
        model: Database.libraryItemModel,
        where: { libraryId },
        attributes: ['id']
      },
      attributes: ['id', 'title', 'audioFiles']
    })

    const bookScores = []
    let totalScore = 0
    const allIssues = []

    for (const book of books) {
      const result = this.analyzeAudioFiles(book.audioFiles)
      bookScores.push({ bookId: book.id, title: book.title, ...result })
      totalScore += result.score
      for (const issue of result.issues) {
        if (!allIssues.includes(issue)) allIssues.push(issue)
      }
    }

    return {
      totalBooks: books.length,
      avgScore: books.length ? Math.round(totalScore / books.length) : 0,
      issues: allIssues,
      bookScores
    }
  }

  async getSeriesGaps(libraryId) {
    const seriesList = await Database.seriesModel.findAll({
      attributes: ['id', 'name'],
      include: {
        model: Database.bookSeriesModel,
        attributes: ['sequence'],
        required: true,
        include: {
          model: Database.bookModel,
          attributes: ['id'],
          include: {
            model: Database.libraryItemModel,
            where: { libraryId },
            attributes: []
          },
          required: true
        }
      }
    })

    const results = []
    for (const series of seriesList) {
      const sequences = series.bookSeries
        .map((bs) => parseFloat(bs.sequence))
        .filter((n) => !isNaN(n))
        .sort((a, b) => a - b)

      if (sequences.length < 2) continue

      const max = Math.floor(sequences[sequences.length - 1])
      const missing = []
      for (let i = Math.ceil(sequences[0]); i <= max; i++) {
        if (!sequences.includes(i)) missing.push(i)
      }

      if (missing.length) {
        results.push({ seriesId: series.id, seriesName: series.name, ownedSequences: sequences, missingSequences: missing })
      }
    }
    return results
  }

  async getNarratorConsistency(libraryId) {
    const seriesList = await Database.seriesModel.findAll({
      attributes: ['id', 'name'],
      include: {
        model: Database.bookSeriesModel,
        required: true,
        include: {
          model: Database.bookModel,
          attributes: ['id', 'title', 'narrators'],
          include: {
            model: Database.libraryItemModel,
            where: { libraryId },
            attributes: []
          },
          required: true
        }
      }
    })

    const results = []
    for (const series of seriesList) {
      const books = series.bookSeries.map((bs) => ({
        title: bs.book.title,
        narrators: bs.book.narrators || []
      }))

      const narratorSets = books.map((b) => JSON.stringify(b.narrators.slice().sort()))
      if (new Set(narratorSets).size > 1) {
        results.push({ seriesId: series.id, seriesName: series.name, books })
      }
    }
    return results
  }

  async getDurationStats(userId) {
    const progresses = await Database.mediaProgressModel.findAll({
      where: { userId, mediaItemType: 'book' },
      include: {
        model: Database.bookModel,
        attributes: ['id', 'audioFiles', 'duration'],
        required: true
      }
    })

    let totalListeningTime = 0
    let totalBookDuration = 0
    const formatBreakdown = {}
    let booksFinished = 0
    let booksInProgress = 0

    for (const mp of progresses) {
      totalListeningTime += mp.currentTime || 0
      totalBookDuration += mp.book?.duration || 0

      if (mp.isFinished) booksFinished++
      else if (mp.currentTime > 0) booksInProgress++

      if (mp.book?.audioFiles) {
        for (const af of mp.book.audioFiles) {
          const fmt = af.format || 'unknown'
          formatBreakdown[fmt] = (formatBreakdown[fmt] || 0) + 1
        }
      }
    }

    return {
      totalListeningTime,
      avgBookLength: progresses.length ? Math.round(totalBookDuration / progresses.length) : 0,
      formatBreakdown,
      booksFinished,
      booksInProgress
    }
  }

  async getSpaceSaverSuggestions(userId, limit = 10) {
    const finished = await Database.mediaProgressModel.findAll({
      where: { userId, isFinished: true, mediaItemType: 'book' },
      include: {
        model: Database.bookModel,
        attributes: ['id', 'title', 'audioFiles'],
        include: {
          model: Database.libraryItemModel,
          attributes: ['id', 'size']
        },
        required: true
      }
    })

    return finished
      .map((mp) => ({
        bookId: mp.book.id,
        title: mp.book.title,
        size: mp.book.libraryItem?.size || 0,
        finishedAt: mp.finishedAt
      }))
      .sort((a, b) => b.size - a.size)
      .slice(0, limit)
  }
}

module.exports = new QualityManager()
