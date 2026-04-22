const Logger = require('../Logger')

/**
 * MCP (Model Context Protocol) server — expose library operations to AI clients.
 * Compatible with Claude, Cursor, and other MCP-aware tools.
 *
 * Protocol: JSON-RPC 2.0 over HTTP POST /api/mcp
 * Tools are discoverable via tools/list, callable via tools/call.
 */
class McpServer {
  constructor() {
    this.tools = [
      { name: 'search_books', description: 'Search library by title, author, or keyword', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } },
      { name: 'get_book', description: 'Get full book details by ID', inputSchema: { type: 'object', properties: { bookId: { type: 'string' } }, required: ['bookId'] } },
      { name: 'library_stats', description: 'Get library statistics (counts, durations, formats)', inputSchema: { type: 'object', properties: {} } },
      { name: 'recommendations', description: 'Get personalized recommendations', inputSchema: { type: 'object', properties: { category: { type: 'string', enum: ['all', 'dna_match', 'authors_you_love', 'hidden_gems', 'anti'] } } } },
      { name: 'recap', description: 'Get AI recap of a book up to current reading position', inputSchema: { type: 'object', properties: { bookId: { type: 'string' } }, required: ['bookId'] } },
      { name: 'ask_book', description: 'Ask a question about a book', inputSchema: { type: 'object', properties: { bookId: { type: 'string' }, question: { type: 'string' } }, required: ['bookId', 'question'] } },
      { name: 'auto_tag', description: 'Auto-tag a book with genres/moods/themes via LLM', inputSchema: { type: 'object', properties: { bookId: { type: 'string' } }, required: ['bookId'] } },
      { name: 'search_gutenberg', description: 'Search Project Gutenberg for free ebooks', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      { name: 'search_librivox', description: 'Search LibriVox for free audiobooks', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      { name: 'full_text_search', description: 'Search inside book content (FTS5)', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      { name: 'send_to_kindle', description: 'Send a book to a Kindle email address', inputSchema: { type: 'object', properties: { bookId: { type: 'string' }, email: { type: 'string' } }, required: ['bookId', 'email'] } },
      { name: 'convert_format', description: 'Convert ebook to another format', inputSchema: { type: 'object', properties: { bookId: { type: 'string' }, format: { type: 'string', enum: ['epub', 'mobi', 'azw3', 'pdf', 'txt', 'html', 'docx'] } }, required: ['bookId', 'format'] } },
      { name: 'convert_to_audio', description: 'Convert ebook to audiobook via TTS', inputSchema: { type: 'object', properties: { bookId: { type: 'string' }, voice: { type: 'string' }, language: { type: 'string' } }, required: ['bookId'] } },
      { name: 'list_characters', description: 'List characters in a book (NER + LLM)', inputSchema: { type: 'object', properties: { bookId: { type: 'string' } }, required: ['bookId'] } },
      { name: 'translate', description: 'Translate book text to another language', inputSchema: { type: 'object', properties: { bookId: { type: 'string' }, targetLang: { type: 'string' } }, required: ['bookId', 'targetLang'] } },
      { name: 'generate_cover', description: 'Generate a cover for a book without one', inputSchema: { type: 'object', properties: { bookId: { type: 'string' } }, required: ['bookId'] } },
    ]
  }

  /** Handle JSON-RPC 2.0 MCP request */
  async handle(method, params, userId) {
    switch (method) {
      case 'initialize':
        return { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'openbookshelf', version: '1.0.0' } }
      case 'tools/list':
        return { tools: this.tools }
      case 'tools/call':
        return this._callTool(params.name, params.arguments || {}, userId)
      default:
        throw new Error(`Unknown method: ${method}`)
    }
  }

  async _callTool(name, args, userId) {
    const Database = require('../Database')
    const { Op } = require('sequelize')

    switch (name) {
      case 'search_books': {
        const books = await Database.bookModel.findAll({
          where: { title: { [Op.like]: `%${args.query}%` } },
          limit: args.limit || 10,
          include: [{ model: Database.authorModel }]
        })
        return { content: [{ type: 'text', text: JSON.stringify(books.map((b) => ({ id: b.id, title: b.title, authors: b.authors?.map((a) => a.name) }))) }] }
      }
      case 'get_book': {
        const book = await Database.bookModel.findByPk(args.bookId, { include: [{ model: Database.authorModel }] })
        if (!book) return { content: [{ type: 'text', text: 'Book not found' }], isError: true }
        return { content: [{ type: 'text', text: JSON.stringify({ id: book.id, title: book.title, authors: book.authors?.map((a) => a.name), description: book.description?.slice(0, 500), genres: book.genres, duration: book.duration }) }] }
      }
      case 'library_stats': {
        const [bookCount, authorCount] = await Promise.all([Database.bookModel.count(), Database.authorModel.count()])
        return { content: [{ type: 'text', text: JSON.stringify({ books: bookCount, authors: authorCount }) }] }
      }
      case 'recommendations': {
        const RecommendationManager = require('./RecommendationManager')
        const recs = await RecommendationManager.getRecommendations(userId, args.category || 'all')
        return { content: [{ type: 'text', text: JSON.stringify(recs) }] }
      }
      case 'recap': {
        const BookCompanionManager = require('./BookCompanionManager')
        const recap = await BookCompanionManager.getRecap(args.bookId, userId)
        return { content: [{ type: 'text', text: JSON.stringify(recap) }] }
      }
      case 'ask_book': {
        const BookCompanionManager = require('./BookCompanionManager')
        const answer = await BookCompanionManager.askAboutBook(args.bookId, userId, args.question)
        return { content: [{ type: 'text', text: JSON.stringify(answer) }] }
      }
      case 'auto_tag': {
        const AutoTagManager = require('./AutoTagManager')
        const tags = await AutoTagManager.analyzeBook(args.bookId)
        return { content: [{ type: 'text', text: JSON.stringify(tags) }] }
      }
      case 'search_gutenberg': {
        const GutenbergManager = require('./GutenbergManager')
        const results = await GutenbergManager.search(args.query)
        return { content: [{ type: 'text', text: JSON.stringify(results) }] }
      }
      case 'search_librivox': {
        const LibriVoxManager = require('./LibriVoxManager')
        const results = await LibriVoxManager.search(args.query)
        return { content: [{ type: 'text', text: JSON.stringify(results) }] }
      }
      case 'full_text_search': {
        const FtsManager = require('./FtsManager')
        const results = await FtsManager.search(args.query)
        return { content: [{ type: 'text', text: JSON.stringify(results) }] }
      }
      case 'send_to_kindle': {
        const DeliveryManager = require('./DeliveryManager')
        const result = await DeliveryManager.sendToKindle(args.bookId, args.email)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      }
      case 'convert_format': {
        const ConversionManager = require('./ConversionManager')
        const result = await ConversionManager.convert(args.bookId, args.format)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      }
      case 'convert_to_audio': {
        const TextToAudiobookManager = require('./TextToAudiobookManager')
        const result = await TextToAudiobookManager.convert(args.bookId, { voice: args.voice, language: args.language })
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      }
      case 'list_characters': {
        const BookCompanionManager = require('./BookCompanionManager')
        const result = await BookCompanionManager.listCharacters(args.bookId, userId)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      }
      case 'translate': {
        const TranslationManager = require('./TranslationManager')
        const result = await TranslationManager.translateBook(args.bookId, args.targetLang)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      }
      case 'generate_cover': {
        const CoverGenerator = require('./CoverGenerator')
        const result = await CoverGenerator.generateForBook(args.bookId)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      }
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
    }
  }
}

module.exports = new McpServer()
