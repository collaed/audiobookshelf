const { execFile } = require('child_process')
const Path = require('path')
const fs = require('../libs/fsExtra')
const Logger = require('../Logger')
const axios = require('axios').default

/**
 * Shared TTS/STT utility.
 * Priority: L'Intello API (Piper TTS + Groq Whisper) → local binary fallback.
 */

const INTELLO_URL = process.env.INTELLO_URL || process.env.AIROUTER_URL || ''
const INTELLO_TOKEN = process.env.INTELLO_TOKEN || ''
const TTS_BIN = process.env.TTS_BIN || 'piper'

const PIPER_MODELS = {
  en: 'en_US-lessac-medium', fr: 'fr_FR-siwis-medium', de: 'de_DE-thorsten-medium',
  es: 'es_ES-sharvard-medium', it: 'it_IT-riccardo-x_low', nl: 'nl_NL-mls-medium',
  pt: 'pt_BR-faber-medium', ru: 'ru_RU-irina-medium',
}

function _intelloHeaders() {
  const h = {}
  if (INTELLO_TOKEN) h['Authorization'] = `Bearer ${INTELLO_TOKEN}`
  return h
}

/**
 * TTS via intello — auto-routes to Orpheus (EN, expressive) or Piper (other langs).
 * Orpheus voices: tara, leah, jess, leo, dan, mara, troy, austin, hannah
 * Expressive tags: [cheerful] [sad] [whisper] [laughing] [surprised]
 */
async function _ttsViaIntello(text, language, voice) {
  if (!INTELLO_URL) return null
  try {
    const params = new URLSearchParams()
    params.append('text', text.slice(0, 50000))
    params.append('language', language)
    params.append('engine', 'auto')
    if (voice) params.append('voice', voice)
    const { data } = await axios.post(`${INTELLO_URL}/api/v1/voice/synthesize`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ..._intelloHeaders() },
      responseType: 'arraybuffer', timeout: 120000
    })
    if (data?.length > 100) return Buffer.from(data)
  } catch (err) {
    Logger.debug(`[ttsHelper] Intello TTS failed: ${err.message}`)
  }
  return null
}

/**
 * STT via intello's Groq Whisper endpoint. Returns { text, provider } or null.
 */
async function transcribeViaIntello(audioPath, language = '') {
  if (!INTELLO_URL) return null
  try {
    const FormData = require('form-data')
    const form = new FormData()
    form.append('file', require('fs').createReadStream(audioPath))
    if (language) form.append('language', language)
    const { data } = await axios.post(`${INTELLO_URL}/api/v1/voice/transcribe`, form, {
      headers: { ...form.getHeaders(), ..._intelloHeaders() }, timeout: 120000
    })
    if (data?.text) return data
  } catch (err) {
    Logger.debug(`[ttsHelper] Intello STT failed: ${err.message}`)
  }
  return null
}

/**
 * Generate speech from text, save as WAV.
 * Tries intello first, falls back to local piper/espeak.
 */
async function generateTtsWav(text, outputPath, language = 'en', timeout = 600000, voice = '') {
  const lang = (language || 'en').slice(0, 2).toLowerCase()

  // Try intello (Orpheus for EN, Piper for others)
  const wavBytes = await _ttsViaIntello(text, lang, voice)
  if (wavBytes) {
    await fs.ensureDir(Path.dirname(outputPath))
    await fs.writeFile(outputPath, wavBytes)
    return outputPath
  }

  // Local fallback
  const model = PIPER_MODELS[lang] || PIPER_MODELS.en
  return new Promise((resolve, reject) => {
    const proc = execFile(TTS_BIN, ['--model', model, '--output_file', outputPath],
      { timeout }, (err) => err ? reject(err) : resolve(outputPath))
    proc.stdin.write(text)
    proc.stdin.end()
  })
}

async function generateTtsMp3(text, outputMp3Path, language = 'en') {
  const wavPath = outputMp3Path.replace(/\.mp3$/, '.wav')
  await fs.ensureDir(Path.dirname(outputMp3Path))
  await generateTtsWav(text, wavPath, language)
  await new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', '-i', wavPath, '-codec:a', 'libmp3lame', '-q:a', '4', outputMp3Path],
      { timeout: 120000 }, (err) => err ? reject(err) : resolve())
  })
  const duration = await getDuration(outputMp3Path)
  await fs.remove(wavPath).catch(() => {})
  return { mp3Path: outputMp3Path, duration }
}

function getDuration(filePath) {
  return new Promise((resolve) => {
    execFile('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
      { timeout: 10000 }, (err, stdout) => resolve(parseFloat(stdout) || 0))
  })
}

const ORPHEUS_VOICES = ['tara', 'leah', 'jess', 'leo', 'dan', 'mara', 'troy', 'austin', 'hannah']

module.exports = { generateTtsWav, generateTtsMp3, getDuration, transcribeViaIntello, PIPER_MODELS, ORPHEUS_VOICES }
