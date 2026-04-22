const { asyncHandler } = require('../utils/asyncHandler')
const McpServer = require('../managers/McpServer')

class McpController {
  /** POST /api/mcp — JSON-RPC 2.0 MCP endpoint */
  async handle(req, res) {
    const { method, params, id, jsonrpc } = req.body || {}
    if (jsonrpc !== '2.0' || !method) {
      return res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid JSON-RPC request' }, id: id || null })
    }
    try {
      const result = await McpServer.handle(method, params || {}, req.user?.id)
      res.json({ jsonrpc: '2.0', result, id })
    } catch (err) {
      res.json({ jsonrpc: '2.0', error: { code: -32603, message: err.message }, id })
    }
  }
}

const _inst = new McpController()
_inst.handle = asyncHandler(_inst.handle.bind(_inst))
module.exports = _inst
