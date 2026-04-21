const { execFile } = require('child_process')
const Path = require('path')
const fs = require('../libs/fsExtra')
const Logger = require('../Logger')

/**
 * Shared TTS utility — extracted from LanguageLearningManager, BookSummaryManager, TextToAudiobookManager.
 * Supports Piper (neural, 8+ languages) and espeak (fallback).
 */

const TTS_ENGINE = process.env.TTS_ENGINE || 'piper'
const TTS_BIN = process.env.TTS_BIN || 'piper'

const PIPER_MODELS = {
  en: 'en_US-lessac-medium', fr: 'fr_FR-siwis-medium', de: 'de_DE-thorsten-medium',
  es: 'es_ES-sharvard-medium', it: 'it_IT-riccardo-x_low', nl: 'nl_NL-mls-medium',
  pt: 'pt_BR-faber-medium', ru: 'ru_RU-irina-medium', zh: 'zh_CN-huayan-medium',
  ja: 'ja_JP-kokoro-medium', ko: 'ko_KR-kss-x_low',
}

const ESPEAK_VOICES = { en: 'en', fr: 'fr', de: 'de', es: 'es', it: 'it', nl: 'nl', pt: 'pt', ru: 'ru' }

/**
 * Generate speech from text, save as WAV.
 * @param {string} text
 * @param {string} outputPath - must end in .wav
 * @param {string} [language='en']
 * @param {number} [timeout=600000]
 * @returns {Promise<string>} outputPath
 */
function generateTtsWav(text, outputPath, language = 'en', timeout = 600000) {
  const lang = (language || 'en').slice(0, 2).toLowerCase()

  if (TTS_ENGINE === 'piper') {
    const model = PIPER_MODELS[lang] || PIPER_MODELS.en
    return new Promise((resolve, reject) => {
      const proc = execFile(TTS_BIN, ['--model', model, '--output_file', outputPath],
        { timeout }, (err) => err ? reject(err) : resolve(outputPath))
      proc.stdin.write(text)
      proc.stdin.end()
    })
  }

  const voice = ESPEAK_VOICES[lang] || 'en'
  return new Promise((resolve, reject) => {
    execFile('espeak', ['-v', voice, '-w', outputPath, text.slice(0, 50000)],
      { timeout: Math.min(timeout, 300000) }, (err) => err ? reject(err) : resolve(outputPath))
  })
}

/**
 * Generate speech and convert to MP3.
 * @returns {Promise<{mp3Path: string, duration: number}>}
 */
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

/**
 * Get audio duration in seconds via ffprobe.
 */
function getDuration(filePath) {
  return new Promise((resolve) => {
    execFile('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
      { timeout: 10000 }, (err, stdout) => resolve(parseFloat(stdout) || 0))
  })
}

module.exports = { generateTtsWav, generateTtsMp3, getDuration, PIPER_MODELS, ESPEAK_VOICES, TTS_ENGINE, TTS_BIN }
