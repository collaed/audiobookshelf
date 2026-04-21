const axios = require('axios').default
const fs = require('../libs/fsExtra')
const Path = require('path')
const Logger = require('../Logger')

/**
 * OCR client — calls L'Intello's OCR endpoints for scanned PDF/image text extraction.
 * Uses the same backend as the LLM features (intello service).
 */
class OcrManager {
  constructor() {
    this.baseUrl = process.env.INTELLO_URL || process.env.AIROUTER_URL || 'http://intello:8000'
    this.token = process.env.INTELLO_TOKEN || process.env.AIROUTER_TOKEN || ''
    this.timeout = 120000
  }

  _headers() {
    const h = {}
    if (this.token) h['Authorization'] = `Bearer ${this.token}`
    return h
  }

  async isAvailable() {
    try {
      const { data } = await axios.get(`${this.baseUrl}/api/v1/status`, {
        headers: this._headers(), timeout: 5000
      })
      return { available: true, ...data }
    } catch {
      return { available: false }
    }
  }

  /**
   * OCR with escalation (Intello pattern): primary → fallback → LLM vision.
   * Tries the cheapest method first, escalates if confidence is low.
   */
  async ocrWithEscalation(imagePath, language = 'eng') {
    // Stage 1: Primary OCR (Tesseract via intello)
    try {
      const result = await this.ocrImage(imagePath, language)
      if (result?.text?.length > 50 && (result.confidence || 100) > 70) {
        result._method = 'tesseract'
        return result
      }
    } catch {}

    // Stage 2: Retry with different language hint if short result
    if (language !== 'eng') {
      try {
        const result = await this.ocrImage(imagePath, 'eng')
        if (result?.text?.length > 50) {
          result._method = 'tesseract-fallback-eng'
          return result
        }
      } catch {}
    }

    // Stage 3: LLM vision (if available) — send image to LLM for text extraction
    try {
      const LlmProvider = require('./LlmProvider')
      if (LlmProvider.provider !== 'disabled') {
        const fs = require('../libs/fsExtra')
        const imageData = await fs.readFile(imagePath)
        const base64 = imageData.toString('base64')
        const text = await LlmProvider.complete(
          'Extract all text from this image. Return only the text, no commentary.',
          `[Image attached as base64: data:image/png;base64,${base64.slice(0, 5000)}...]`,
          { maxTokens: 2000 }
        )
        if (text?.length > 20) {
          return { text, confidence: 60, _method: 'llm-vision' }
        }
      }
    } catch {}

    return { text: '', confidence: 0, _method: 'failed', error: 'All OCR methods failed' }
  }

  /**
   * OCR a single image, return text + blocks
   */
  async ocrImage(imagePath, language = 'eng') {
    const FormData = require('form-data')
    const form = new FormData()
    form.append('file', fs.createReadStream(imagePath))
    form.append('language', language)
    form.append('output', 'json')

    const { data } = await axios.post(`${this.baseUrl}/api/v1/ocr`, form, {
      headers: { ...this._headers(), ...form.getHeaders() },
      timeout: this.timeout
    })
    return data
  }

  /**
   * OCR a PDF, return per-page text
   */
  async ocrPdfToText(pdfPath, language = 'eng', pages = '') {
    const FormData = require('form-data')
    const form = new FormData()
    form.append('file', fs.createReadStream(pdfPath))
    form.append('language', language)
    form.append('output', 'json')
    if (pages) form.append('pages', pages)

    const { data } = await axios.post(`${this.baseUrl}/api/v1/ocr/pdf`, form, {
      headers: { ...this._headers(), ...form.getHeaders() },
      timeout: this.timeout
    })
    return data
  }

  /**
   * Create a searchable PDF (async job for large files)
   */
  async createSearchablePdf(pdfPath, language = 'eng') {
    const FormData = require('form-data')
    const form = new FormData()
    form.append('file', fs.createReadStream(pdfPath))
    form.append('language', language)
    form.append('output', 'searchable_pdf')

    const { data } = await axios.post(`${this.baseUrl}/api/v1/ocr/jobs`, form, {
      headers: { ...this._headers(), ...form.getHeaders() },
      timeout: this.timeout
    })
    return data // { job_id, status }
  }

  /**
   * Create a searchable PDF from a URL (intello fetches the file)
   */
  async createSearchablePdfFromUrl(fileUrl, language = 'eng') {
    const FormData = require('form-data')
    const form = new FormData()
    form.append('file_url', fileUrl)
    form.append('language', language)
    form.append('output', 'searchable_pdf')

    const { data } = await axios.post(`${this.baseUrl}/api/v1/ocr/jobs`, form, {
      headers: { ...this._headers(), ...form.getHeaders() },
      timeout: 30000
    })
    return data
  }

  /**
   * Check job status
   */
  async getJobStatus(jobId) {
    const { data } = await axios.get(`${this.baseUrl}/api/v1/ocr/jobs/${jobId}`, {
      headers: this._headers(), timeout: 10000
    })
    return data
  }

  /**
   * Download completed job result (searchable PDF)
   */
  async downloadJobResult(jobId, outputPath) {
    const response = await axios.get(`${this.baseUrl}/api/v1/ocr/jobs/${jobId}/result`, {
      headers: this._headers(), timeout: this.timeout, responseType: 'stream'
    })
    const writer = fs.createWriteStream(outputPath)
    response.data.pipe(writer)
    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(outputPath))
      writer.on('error', reject)
    })
  }

  /**
   * Full workflow: OCR a library item's PDF ebook
   * 1. Submit job to intello
   * 2. Poll until complete
   * 3. Download searchable PDF
   * 4. Replace or add alongside original
   */
  async ocrLibraryItemPdf(ebookFilePath, language = 'eng') {
    Logger.info(`[OcrManager] Starting OCR for ${Path.basename(ebookFilePath)}`)

    const job = await this.createSearchablePdf(ebookFilePath, language)
    if (job.error) throw new Error(job.error)

    // Poll for completion
    let status = job
    while (status.status !== 'complete' && status.status !== 'failed') {
      await new Promise((r) => setTimeout(r, 3000))
      status = await this.getJobStatus(job.job_id)
      if (status.progress) {
        Logger.debug(`[OcrManager] OCR progress: ${status.progress}%`)
      }
    }

    if (status.status === 'failed') {
      throw new Error(status.error || 'OCR job failed')
    }

    // Download result
    const outputPath = ebookFilePath.replace('.pdf', '_ocr.pdf')
    await this.downloadJobResult(job.job_id, outputPath)
    Logger.info(`[OcrManager] OCR complete: ${outputPath}`)

    return { outputPath, jobId: job.job_id, pages: status.pages_done || status.total_pages }
  }
}

module.exports = new OcrManager()
