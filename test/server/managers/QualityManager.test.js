const { expect } = require('chai')
const sinon = require('sinon')
const QualityManager = require('../../../server/managers/QualityManager')

describe('QualityManager', () => {
  afterEach(() => sinon.restore())

  describe('analyzeAudioFiles', () => {
    it('should return score 0 with issues for empty input', () => {
      const result = QualityManager.analyzeAudioFiles([])
      expect(result.score).to.equal(0)
      expect(result.issues).to.include('No audio files')
    })

    it('should return score 0 for null input', () => {
      expect(QualityManager.analyzeAudioFiles(null).score).to.equal(0)
    })

    it('should score high for good quality files', () => {
      const files = [{ bitRate: 192, chapters: [{ id: 1 }], format: 'mp3', channels: 2, codec: 'mp3' }]
      const result = QualityManager.analyzeAudioFiles(files)
      expect(result.score).to.equal(100)
      expect(result.issues).to.be.empty
      expect(result.hasChapters).to.be.true
    })

    it('should penalize low bitrate', () => {
      const files = [{ bitRate: 32, format: 'mp3', channels: 1, codec: 'mp3' }]
      const result = QualityManager.analyzeAudioFiles(files)
      expect(result.score).to.be.lessThan(50)
      expect(result.issues).to.include('Low bitrate: 32kbps')
    })

    it('should penalize mixed formats', () => {
      const files = [
        { bitRate: 128, format: 'mp3', channels: 2, codec: 'mp3' },
        { bitRate: 128, format: 'ogg', channels: 2, codec: 'vorbis' }
      ]
      const result = QualityManager.analyzeAudioFiles(files)
      expect(result.issues).to.include('Mixed formats: mp3, ogg')
    })

    it('should penalize missing codec info', () => {
      const files = [{ bitRate: 128, format: 'mp3', channels: 2 }]
      const result = QualityManager.analyzeAudioFiles(files)
      expect(result.issues).to.include('Missing codec info')
    })
  })
})
