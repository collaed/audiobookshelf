const intello = require('../utils/intelloClient')
const fs = require('../libs/fsExtra')
const Path = require('path')
const Logger = require('../Logger')

/**
 * OCR client — calls L'Intello's OCR endpoints.
 * Uses shared intelloClient for URL/auth/timeout.
 */
class OcrManager {
  async isAvailable() {
    try {
      const data = await intello.get('/api/v1/status', { timeout: 5000 })
      return { available: true, ...data }
    } catch (err) {
      Logger.debug(`[OcrManager] Status check failed: ${err.message}`)
      return { available: false }
    }
  }

  async ocrWithEscalation(imagePath, language = 'eng') {
    // Stage 1: Primary OCR (Tesseract via intello)
    try {
      const result = await this.ocrImage(imagePath, language)
      if (result?.text?.length > 50 && (result.confidence || 100) > 70) {
        return { ...result, _method: 'tesseract' }
      }
    } catch (err) {
      Logger.debug(`[OcrManager] Stage 1 failed: ${err.message}`)
    }

    // Stage 2: Retry with English if different language was tried
    if (language !== 'eng') {
      try {
        const result = await this.ocrImage(imagePath, 'eng')
        if (result?.text?.length > 50) return { ...result, _method: 'tesseract-fallback-eng' }
      } catch (err) {
        Logger.debug(`[OcrManager] Stage 2 failed: ${err.message}`)
      }
    }

    // Stage 3: LLM vision fallback
    try {
      const LlmProvider = require('./LlmProvider')
      if (LlmProvider.provider !== 'disabled') {
        const imageData = await fs.readFile(imagePath)
        const base64 = imageData.toString('base64')
        const text = await LlmProvider.complete(
          'Extract all text from this image. Return only the text, no commentary.',
          `[Image attached as base64: data:image/png;base64,${base64.slice(0, 5000)}...]`,
          { maxTokens: 2000 }
        )
        if (text?.length > 20) return { text, confidence: 60, _method: 'llm-vision' }
      }
    } catch (err) {
      Logger.debug(`[OcrManager] Stage 3 (LLM vision) failed: ${err.message}`)
    }

    return { text: '', confidence: 0, _method: 'failed', error: 'All OCR methods failed' }
  }

  async ocrImage(imagePath, language = 'eng') {
    const FormData = require('form-data')
    const form = new FormData()
    form.append('file', fs.createReadStream(imagePath))
    form.append('language', language)
    form.append('output', 'json')
    return intello.postForm('/api/v1/ocr', form, { timeout: 120000 })
  }

  async ocrPdfToText(pdfPath, language = 'eng', pages = '') {
    const FormData = require('form-data')
    const form = new FormData()
    form.append('file', fs.createReadStream(pdfPath))
    form.append('language', language)
    form.append('output', 'json')
    if (pages) form.append('pages', pages)
    return intello.postForm('/api/v1/ocr/pdf', form, { timeout: 120000 })
  }

  async createSearchablePdf(pdfPath, language = 'eng') {
    const FormData = require('form-data')
    const form = new FormData()
    form.append('file', fs.createReadStream(pdfPath))
    form.append('language', language)
    form.append('output', 'searchable_pdf')
    return intello.postForm('/api/v1/ocr/jobs', form, { timeout: 120000 })
  }

  async getJobStatus(jobId) {
    return intello.get(`/api/v1/ocr/jobs/${jobId}`, { timeout: 10000 })
  }

  async downloadJobResult(jobId, outputPath) {
    const axios = require('axios').default
    const { INTELLO_URL, headers } = require('../utils/intelloClient')
    const response = await axios.get(`${INTELLO_URL}/api/v1/ocr/jobs/${jobId}/result`, {
      headers: headers(), timeout: 120000, responseType: 'stream'
    })
    const writer = fs.createWriteStream(outputPath)
    response.data.pipe(writer)
    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(outputPath))
      writer.on('error', reject)
    })
  }

  async ocrLibraryItemPdf(ebookFilePath, language = 'eng') {
    Logger.info(`[OcrManager] Starting OCR for ${Path.basename(ebookFilePath)}`)
    const job = await this.createSearchablePdf(ebookFilePath, language)
    if (job.error) throw new Error(job.error)

    let status = job
    while (status.status !== 'complete' && status.status !== 'failed') {
      await new Promise((r) => setTimeout(r, 3000))
      status = await this.getJobStatus(job.job_id)
      if (status.progress) Logger.debug(`[OcrManager] OCR progress: ${status.progress}%`)
    }
    if (status.status === 'failed') throw new Error(status.error || 'OCR job failed')

    const outputPath = ebookFilePath.replace('.pdf', '_ocr.pdf')
    await this.downloadJobResult(job.job_id, outputPath)
    Logger.info(`[OcrManager] OCR complete: ${outputPath}`)
    return { outputPath, jobId: job.job_id, pages: status.pages_done || status.total_pages }
  }
}

module.exports = new OcrManager()
