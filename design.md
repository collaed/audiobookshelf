# Architectural Design — Audiobookshelf Extended

## 1. System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Docker Host                                │
│                                                                    │
│  ┌─────────────────────────────────┐  ┌─────────────────────────┐ │
│  │  Audiobookshelf (Node.js)       │  │  L'Intello (Python)     │ │
│  │                                 │  │  - 24 LLM providers     │ │
│  │  Express + Sequelize + SQLite   │  │  - OCR (Tesseract)      │ │
│  │  Socket.io for real-time        │  │  - OpenAI-compatible API│ │
│  │                                 │  └─────────────────────────┘ │
│  │  ┌───────────┐ ┌─────────────┐ │                               │
│  │  │ Upstream   │ │ Extended    │ │  ┌─────────────────────────┐ │
│  │  │ (96K lines)│ │ (6.4K lines)│ │  │  Agent (Python)         │ │
│  │  │ unchanged  │ │ 21 managers │ │  │  - File scanning        │ │
│  │  │            │ │ 19 controllers│  │  - Audio cleaning       │ │
│  │  │            │ │ 2 providers │ │  │  - Quality analysis     │ │
│  │  │            │ │ 2 models    │ │  │  - Duplicate detection  │ │
│  │  └───────────┘ └─────────────┘ │  └─────────────────────────┘ │
│  │                                 │                               │
│  │  ┌───────────┐ ┌─────────────┐ │  Volumes:                     │
│  │  │ Client v2  │ │ Client v3   │ │  /audiobooks (persistent)    │
│  │  │ (Nuxt 2)   │ │ (Nuxt 3)    │ │  /config (SQLite DB)        │
│  │  │ at /       │ │ at /v3/     │ │  /metadata (covers, cache)   │
│  │  └───────────┘ └─────────────┘ │  /incoming (drop zone)        │
│  └─────────────────────────────────┘                               │
└──────────────────────────────────────────────────────────────────┘
```

## 2. Design Principles

### 2.1 Additive Architecture
All new functionality lives in new files. Only 3 upstream files modified:
- `Database.js`: +15 lines (register 2 models)
- `Server.js`: +4 lines (init IncomingManager, serve /v3/)
- `ApiRouter.js`: +155 lines (register routes)

### 2.2 Singleton Manager Pattern
Every manager is a class exported as a singleton instance:
```js
class SomeManager { ... }
module.exports = new SomeManager()
```
Matches upstream ABS pattern. Managers are stateless or use in-memory caches.

### 2.3 Controller → Manager → Provider
```
HTTP Request → Controller (validation, auth) → Manager (business logic) → Provider (external API)
                    ↓                                    ↓
              asyncHandler                          try/catch → null
              friendlyError                         Logger.error
```

### 2.4 Graceful Degradation
Every optional dependency returns null/empty on failure:
- LLM unavailable → AI endpoints return empty, non-AI features unaffected
- Whisper missing → sync endpoints return error, everything else works
- Calibre missing → conversion returns error
- Agent offline → tasks queue but aren't picked up
- External APIs down → individual sources return null, others still work

## 3. Data Model Extensions

### 3.1 IncomingItem (new table)
```
id, filePath, fileName, fileSize, fileFormat,
parsedTitle, parsedAuthor, parsedSeries, parsedSequence,
matchedTitle, matchedAuthor, matchedCover, matchedAsin, matchedIsbn,
matchProvider, matchConfidence,
status (pending|confirmed|rejected|duplicate),
libraryId (FK → libraries)
```

### 3.2 ListenerProfile (new table)
```
id, userId (FK → users, unique),
favoriteGenres, favoriteAuthors, favoriteNarrators, themeKeywords (all JSON),
avgBookLength, totalListeningTime, booksFinished,
fluentLanguages, secondaryLanguages (JSON),
includeEbooks (boolean), preferredFormat (string),
lastCalculatedAt
```

## 4. Component Catalog

### 4.1 Server Managers (21 new)

| Manager | Purpose | External Deps |
|---------|---------|---------------|
| IncomingManager | Folder watcher, file processing | music-metadata, fs.watch |
| RecommendationManager | Taste profiles, 5 recommendation categories | natural (TF-IDF, stopwords) |
| QualityManager | Audio analysis, series gaps, narrator consistency | None |
| ReviewManager | 7-source rating aggregation | axios (HTTP) |
| SocialManager | Activity feed, taste comparison | None |
| DeliveryManager | Kindle/OPDS/mobile delivery | xmlbuilder2 |
| GroupingManager | Split chapter detection, dedup | string-similarity |
| ConversionManager | Calibre ebook-convert wrapper | child_process |
| SyncManager | Whisper STT, audiobook↔ebook matching | child_process (whisper, ffmpeg) |
| LanguageLearningManager | Cross-language interleaving | sbd (sentence boundary) |
| BookCompanionManager | AI recap, chat, character tracking | LlmProvider |
| LlmProvider | Unified LLM client (4 backends) | axios |
| AutoTagManager | Multi-sample LLM tagging | LlmProvider |
| BookSummaryManager | Structured summaries + audio | LlmProvider, child_process (TTS) |
| ModernizeManager | Archaic text modernization | LlmProvider |
| TextToAudiobookManager | Ebook → audiobook via TTS | child_process (piper/espeak, ffmpeg) |
| OcrManager | OCR client for L'Intello | axios |
| LibriVoxManager | Free audiobook catalog | LibriVox provider |
| GutenbergManager | Free ebook catalog | Gutenberg provider |
| RatingImportManager | Goodreads/OpenLibrary import | axios |
| ScheduledFeedManager | Drip-feed podcast scheduling | RssFeedManager (upstream) |

### 4.2 Agent Task Types (15)

| Task | Runs on | I/O |
|------|---------|-----|
| scan_incoming | Agent | Filesystem walk |
| audio_quality | Agent | ffprobe |
| audio_identify | Agent | ffprobe (metadata tags) |
| audio_diagnose | Agent | ffmpeg (3-point sampling) |
| audio_clean | Agent | ffmpeg (filter chain) |
| audio_auto_clean | Agent | diagnose + clean |
| audio_auto_clean_folder | Agent | Batch clean |
| find_duplicates | Agent | Size grouping + MD5 head/tail |
| move_file | Agent | shutil.move |
| download_metadata | Agent | OpenLibrary API |
| diag | Agent | System info |
| update_agent | Agent | Self-update + exit 42 |
| scan_incoming_audio | Agent | Alias for scan_incoming |
| identify_book | Agent | Alias for audio_identify |
| check_quality | Agent | Alias for audio_quality |

### 4.3 OSS Libraries Integrated

| Library | Replaces | Used By |
|---------|----------|---------|
| string-similarity | Hand-rolled Jaccard | GroupingManager, SyncManager |
| natural | Hand-rolled stopwords/TF-IDF | RecommendationManager, SyncManager |
| sbd | Regex sentence splitting | LanguageLearningManager |
| xmlbuilder2 | Manual XML concatenation | DeliveryManager (OPDS) |
| music-metadata | Filename-only parsing | IncomingManager |
| better-queue | Raw array task queue | AgentController |

## 5. API Surface

Total routes: 230+ (170 upstream + 65 new)

New route groups:
- `/api/incoming/*` (5 routes)
- `/api/recommendations/*` (4 routes)
- `/api/intelligence/*` (7 routes)
- `/api/agent/*` (4 routes)
- `/api/librivox/*` (4 routes)
- `/api/gutenberg/*` (4 routes)
- `/api/opds/*` (3 routes)
- `/api/sync/*` (4 routes)
- `/api/language/*` (3 routes)
- `/api/ai/*` (9 routes)
- `/api/tools/*` (7 routes)
- `/api/ratings/*` (3 routes)
- `/api/items/:id/*` (18 new sub-routes)

## 6. Frontend Architecture

### 6.1 Dual Client
- **Client v2** (Nuxt 2): Serves at `/` — all original ABS pages, unchanged
- **Client v3** (Nuxt 3): Serves at `/v3/` — 8 new feature pages

### 6.2 Vue 3 Migration
- 238 total .vue files compiled in client-v3
- 42 legacy pages + 184 components migrated from Vue 2
- Options API preserved (works unchanged in Vue 3)
- 9 plugins rewritten for Nuxt 3 (globalProperties pattern)
- Vuex 4 (drop-in Vue 3 compatible, same this.$store API)
- mitt event bus replacing Vue 2 event bus
- 156 mechanical sed fixes (.native, $set, nuxt-link, static paths)

### 6.3 Auth Bridge
Client v3 reads JWT from `localStorage.token` (set by client v2 login).
Same-origin, shared storage — log in once via main UI, /v3/ is authenticated.

## 7. Error Handling

### 7.1 asyncHandler
All 63 async controller methods wrapped:
```js
asyncHandler(fn) → catches unhandled rejections → returns 500 JSON
```

### 7.2 friendlyError
Maps technical errors to user-friendly messages:
```
ECONNREFUSED → "Service is not reachable..."
401 → "Authentication failed..."
ebook-convert → "Calibre is not installed..."
```
Sanitizes file paths, caps message length at 200 chars.

## 8. Testing Architecture

| Layer | Framework | Count | What |
|-------|-----------|-------|------|
| Unit | mocha+chai+sinon | 464 | Pure logic, mocked deps |
| DB Integration | mocha + in-memory SQLite | 11 | Model CRUD, constraints |
| File Ops | mocha + real temp dirs | 9 | Filesystem safety |
| Contract | mocha + mocked axios | 16 | External API parsing |
| Agent Unit | pytest | 9 | Task handlers, registry |
| Agent Integration | pytest + mock HTTP | 3 | Heartbeat, buffering |
| E2E | Playwright | 11 | Live API endpoints |
| **Total** | | **~470** | |

## 9. Deployment

### 9.1 Docker
Multi-stage Dockerfile:
1. Build client v2 (Nuxt 2 generate)
2. Build client v3 (Nuxt 3 generate)
3. Build server (npm ci --production)
4. Runtime image (node:20-alpine + ffmpeg + tini)

### 9.2 Volumes
All persistent, bind-mounted:
- `/config` → SQLite DB + settings
- `/metadata` → covers, cache, summaries, modernized texts
- `/audiobooks` → library content
- `/incoming` → drop zone

### 9.3 Environment Variables
| Variable | Default | Purpose |
|----------|---------|---------|
| LLM_PROVIDER | disabled | airouter/ollama/openai/custom/disabled |
| INTELLO_URL | http://intello:8000 | L'Intello backend |
| INTELLO_TOKEN | | Auth token |
| OLLAMA_URL | http://localhost:11434 | Ollama (if direct) |
| WHISPER_BIN | whisper | Whisper CLI path |
| TTS_ENGINE | piper | piper or espeak |
| CALIBRE_BIN | ebook-convert | Calibre CLI path |
