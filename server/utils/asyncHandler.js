const Logger = require('../Logger')

/**
 * User-friendly error messages for common failure modes.
 * Maps technical errors to actionable messages.
 */
const FRIENDLY_MESSAGES = {
  ECONNREFUSED: 'Service is not reachable. Check that the service is running and the URL is correct.',
  ENOTFOUND: 'Service address not found. Check the URL in your configuration.',
  ETIMEDOUT: 'Request timed out. The service may be overloaded or unreachable.',
  ECONNRESET: 'Connection was reset. Try again in a moment.',
  'socket hang up': 'Connection dropped unexpectedly. The service may have restarted.',
  'Request failed with status code 401': 'Authentication failed. Check your API key or token.',
  'Request failed with status code 403': 'Access denied. You don\'t have permission for this action.',
  'Request failed with status code 404': 'Resource not found.',
  'Request failed with status code 429': 'Too many requests. Please wait a moment and try again.',
  'ebook-convert': 'Calibre is not installed. Install it with: apt install calibre',
  'whisper': 'Whisper is not installed. Install it with: pip install openai-whisper',
  'ffprobe': 'ffprobe is not available. Install ffmpeg.',
  'ffmpeg': 'ffmpeg is not available. Install it with: apt install ffmpeg',
  'SQLITE_ERROR': 'Database error. Try restarting the server.',
  'No ebook file': 'This book doesn\'t have an ebook file attached.',
  'No audio files': 'This book doesn\'t have any audio files.',
}

/**
 * Convert a technical error into a user-friendly response.
 */
function friendlyError(err) {
  const msg = err.message || String(err)

  // Check for known patterns
  for (const [pattern, friendly] of Object.entries(FRIENDLY_MESSAGES)) {
    if (msg.includes(pattern)) {
      return { error: friendly, code: pattern.startsWith('E') ? pattern : undefined }
    }
  }

  // Sanitize: remove file paths, stack traces
  let safe = msg
    .replace(/\/[\w/.-]+/g, '[path]')        // strip absolute paths
    .replace(/at\s+\w+\s+\(.*\)/g, '')       // strip stack frames
    .replace(/\n.*/g, '')                      // only first line
    .trim()

  // Cap length
  if (safe.length > 200) safe = safe.slice(0, 200) + '...'

  return { error: safe || 'An unexpected error occurred. Check the server logs for details.' }
}

/**
 * Wraps an async Express handler with error catching and friendly messages.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      Logger.error(`[${req.method} ${req.path}] ${err.message}`)
      if (!res.headersSent) {
        const status = err.status || (err.message?.includes('not found') ? 404 : 500)
        res.status(status).json(friendlyError(err))
      }
    })
  }
}

module.exports = { asyncHandler, friendlyError }
