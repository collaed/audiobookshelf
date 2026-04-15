/**
 * Wraps an async Express handler to catch errors and return 500.
 * Prevents hanging requests from unhandled promise rejections.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || 'Internal server error' })
      }
    })
  }
}

module.exports = { asyncHandler }
