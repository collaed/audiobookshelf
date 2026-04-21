# User Journeys

End-to-end scenarios covering every extended feature. Each journey maps to a Playwright test in `test/e2e/journeys.test.js`.

---

## Journey 1: New User Setup

**Persona:** Alex, first-time self-hoster
**Goal:** Get a working library from zero

1. Visit abs.ecb.pm — login page loads
2. Log in with credentials → redirected to dashboard
3. GET /api/libraries → see available libraries
4. GET /api/libraries/:id/items → browse existing books
5. GET /api/ai/status → check if AI features are available
6. GET /api/tools/conversion-check → check if Calibre is installed
7. GET /api/sync/check → check if Whisper is available
8. GET /api/ocr/status → check if OCR is available
9. GET /api/fts/status → check FTS index status

**Features covered:** Authentication, library browsing, service status checks

---

## Journey 2: Discover & Download Free Content

**Persona:** Alex wants to fill the library with free classics
**Goal:** Find and download books from LibriVox and Gutenberg

1. GET /api/gutenberg/search?q=pride+and+prejudice → find ebook
2. GET /api/gutenberg/:id → view book details
3. POST /api/gutenberg/:id/download → download to library
4. GET /api/gutenberg/browse?topic=science+fiction → browse by topic
5. GET /api/librivox/search?q=sherlock+holmes → find audiobook
6. GET /api/librivox/:id → view audiobook details
7. POST /api/librivox/:id/download → download to library
8. GET /api/librivox/browse?genre=mystery → browse by genre

**Features covered:** Gutenberg catalog, LibriVox catalog, free content acquisition

---

## Journey 3: Incoming Scanner & Metadata

**Persona:** Alex drops files into the incoming folder
**Goal:** Auto-detect metadata and add to library

1. POST /api/incoming/scan → trigger scan of incoming folder
2. GET /api/incoming/pending → see detected items with extracted metadata
3. GET /api/incoming → list all incoming items (pending + processed)
4. POST /api/incoming/:id/confirm → accept item into library
5. POST /api/incoming/:id/reject → reject bad item

**Features covered:** Incoming folder scanner, metadata extraction, confirmation workflow

---

## Journey 4: Enrich a Book

**Persona:** Alex picks a book and wants full metadata
**Goal:** Get reviews, tags, metadata from multiple sources

1. GET /api/items/:id → load book details
2. GET /api/items/:id/reviews → aggregated reviews from 7 sources
3. POST /api/items/:id/metadata-download → Calibre-style parallel metadata search
4. POST /api/items/:id/metadata-download/apply → apply best match
5. POST /api/items/:id/auto-tag → LLM-based genre/mood/theme tagging
6. POST /api/items/:id/auto-tag/apply → apply tags to book
7. GET /api/fts/search?q=detective → full-text search across content
8. POST /api/fts/index/:libraryId → index a library for FTS

**Features covered:** Reviews (7 sources), metadata download (4 providers), auto-tagging, full-text search

---

## Journey 5: AI Companion

**Persona:** Alex is halfway through a book and wants help
**Goal:** Get recap, ask questions, find characters

1. GET /api/ai/status → confirm AI is available
2. GET /api/ai/recap/:bookId → "What happened so far?"
3. POST /api/ai/ask/:bookId { question: "Who is the antagonist?" } → ask about the book
4. GET /api/ai/characters/:bookId → list all characters (NER + LLM fallback)
5. POST /api/ai/character/:bookId { name: "Holmes" } → deep dive on a character
6. GET /api/ai/chapter-summary/:bookId/0 → summary of chapter 1
7. POST /api/ai/search { query: "books about time travel" } → semantic search

**Features covered:** AI recap, Q&A, character tracking (NER), chapter summaries, smart search

---

## Journey 6: Book Summaries & Modernization

**Persona:** Alex wants a quick overview before committing to a long book
**Goal:** Generate summaries in different styles

1. POST /api/items/:id/summary { style: "executive" } → getAbstract-style summary
2. POST /api/items/:id/summary { style: "casual" } → casual summary
3. POST /api/items/:id/summary/audio { style: "executive" } → audio summary via TTS
4. POST /api/items/:id/modernize { style: "contemporary" } → modernize archaic text
5. POST /api/items/:id/modernize { style: "simplified" } → simplified version

**Features covered:** Book summaries (3 styles), audio summaries, text modernization (4 styles)

---

## Journey 7: Format Conversion & TTS

**Persona:** Alex has an EPUB but wants MOBI for Kindle and an audiobook version
**Goal:** Convert between formats and generate audio

1. GET /api/tools/conversion-check → verify Calibre is available
2. POST /api/tools/convert { bookId, format: "mobi" } → convert EPUB to MOBI
3. POST /api/tools/convert { bookId, format: "azw3" } → convert to AZW3
4. POST /api/tools/convert { bookId, format: "pdf" } → convert to PDF
5. POST /api/items/:id/convert-to-audio { language: "en" } → TTS conversion
6. GET /api/items/:id/convert-to-audio/status → check conversion progress
7. POST /api/items/:id/ocr { language: "eng" } → OCR a scanned PDF

**Features covered:** Ebook conversion (10 formats), ebook-to-audiobook TTS, OCR

---

## Journey 8: Device Delivery

**Persona:** Alex wants to read on Kindle and listen on the go
**Goal:** Send books to devices

1. POST /api/items/:id/send-to-kindle { email: "user@kindle.com" } → email to Kindle
2. POST /api/items/:id/send-to-device { deviceName: "Kobo Clara" } → send to e-reader
3. GET /api/opds → OPDS catalog root
4. GET /api/opds/library/:id → OPDS library feed
5. GET /api/opds/search?q=mystery → OPDS search
6. GET /api/feeds → list podcast feeds
7. POST /api/feeds/item/:itemId/open → create drip feed for a book
8. GET /api/feeds/:id/schedule → view feed schedule

**Features covered:** Kindle delivery, device delivery, OPDS catalog, podcast drip feeds

---

## Journey 9: Library Intelligence

**Persona:** Alex wants to understand and optimize the library
**Goal:** Find quality issues, gaps, duplicates

1. GET /api/intelligence/library/:id/quality → audio quality analysis
2. GET /api/intelligence/library/:id/series-gaps → missing books in series
3. GET /api/intelligence/library/:id/narrator-consistency → narrator changes in series
4. GET /api/intelligence/space-savers → oversized files to re-encode
5. GET /api/intelligence/stats → library-wide statistics
6. GET /api/tools/duplicates → find duplicate files
7. GET /api/tools/groups → file grouping (split chapters, related files)
8. POST /api/tools/groups/:key/merge → merge grouped files

**Features covered:** Quality analysis, series gaps, narrator consistency, space savers, duplicates, file grouping

---

## Journey 10: Audio Restoration

**Persona:** Alex has old audiobooks with noise and quality issues
**Goal:** Diagnose and clean audio

1. POST /api/agent/tasks { type: "audio_diagnose", bookId } → diagnose quality (3-point sampling)
2. GET /api/agent/tasks → check task status
3. POST /api/agent/tasks { type: "audio_clean", bookId, preset: "moderate" } → clean audio
4. GET /api/agent/agents → list connected agents

**Features covered:** Audio diagnosis, audio cleaning (4 presets), agent system

---

## Journey 11: Recommendations & Social

**Persona:** Alex wants to discover what to read next
**Goal:** Get personalized recommendations and see what friends read

1. GET /api/recommendations/profile → view listener profile
2. POST /api/recommendations/profile/rebuild → rebuild profile from history
3. PATCH /api/recommendations/profile/preferences { languages: ["en"], formats: ["audiobook"] } → set preferences
4. GET /api/recommendations/dna-match → books matching taste DNA
5. GET /api/recommendations/authors-you-love → more from favorite authors
6. GET /api/recommendations/complete-series → finish series you started
7. GET /api/recommendations/hidden-gems → underrated books
8. GET /api/recommendations/narrators → favorite narrators' other work
9. GET /api/intelligence/activity → activity feed
10. GET /api/intelligence/compare/:userId → taste comparison
11. GET /api/intelligence/community-recommendations → what the community likes

**Features covered:** 5 recommendation categories, listener profile, preferences, social features

---

## Journey 12: AB↔EB Sync & Language Learning

**Persona:** Alex reads and listens to the same book
**Goal:** Sync position between audiobook and ebook

1. GET /api/sync/check → verify Whisper is available
2. GET /api/sync/pairs → list synced audiobook/ebook pairs
3. POST /api/sync/chapters { bookId } → sync chapter positions
4. POST /api/sync/verify { audioChapter: 5, ebookChapter: 5 } → verify alignment
5. POST /api/items/:id/language-learning { targetLang: "fr", pattern: "aba" } → interleaved learning
6. POST /api/ai/check-alignment { pairs: [...] } → AI alignment check

**Features covered:** AB↔EB sync, Whisper STT, language learning (3 patterns)

---

## Journey 13: Rating Import & Metadata Search

**Persona:** Alex migrates from Goodreads
**Goal:** Import existing ratings and search for metadata

1. POST /api/ratings/import/goodreads { csv: "..." } → import Goodreads CSV
2. POST /api/ratings/import/openlibrary { username: "alex" } → import OpenLibrary log
3. GET /api/ratings/import/status → check import progress
4. POST /api/metadata/search { title: "Dune", author: "Herbert" } → free metadata search

**Features covered:** Goodreads import, OpenLibrary import, metadata search

---

## Journey 14: Webhooks & System Administration

**Persona:** Alex configures the system
**Goal:** Set up integrations and manage the system

1. POST /api/webhooks/register → register ABS with L'Intello for events
2. POST /api/webhooks/intello { event: "ocr.complete", data: {} } → receive webhook
3. GET /api/ai/config → view AI configuration
4. PATCH /api/ai/config { provider: "airouter" } → update AI config
5. GET /api/fts/status → check search index
6. POST /api/fts/index/:libraryId → rebuild search index

**Features covered:** Webhook registration, webhook receiving, AI config, FTS management

---

## Journey 15: Vue 3 Client Walkthrough

**Persona:** Alex uses the new UI
**Goal:** Navigate all pages and features

1. Visit /v3/ → loads single-file Vue 3 app (or Caddy auth redirect)
2. Dashboard shows AI status and quick actions
3. Library page lists books with audio/ebook filter and search
4. Click a book → book detail with 5 tabs (Overview, AI, Summary, Convert, Send)
5. Overview tab: load reviews, download metadata, auto-tag
6. AI tab: get recap, ask questions
7. Summary tab: generate summary in different styles
8. Convert tab: convert format, TTS, OCR
9. Send tab: send to Kindle/device
10. Discover page: search Gutenberg
11. Settings page: view service status

**Features covered:** Vue 3 SPA, all UI pages and tabs

---

## Feature Coverage Matrix

| Feature | Journey(s) |
|---|---|
| Authentication | 1, 15 |
| Library browsing | 1, 15 |
| Gutenberg catalog | 2 |
| LibriVox catalog | 2 |
| Incoming scanner | 3 |
| Reviews (7 sources) | 4 |
| Metadata download (4 providers) | 4, 13 |
| Auto-tagging | 4 |
| Full-text search (FTS5) | 4, 14 |
| AI recap | 5, 15 |
| AI Q&A | 5, 15 |
| Character tracking (NER) | 5 |
| Chapter summaries | 5 |
| Smart search | 5 |
| Book summaries | 6, 15 |
| Text modernization | 6 |
| Ebook conversion | 7, 15 |
| Ebook→audiobook TTS | 7, 15 |
| OCR | 7, 15 |
| Kindle delivery | 8, 15 |
| Device delivery | 8, 15 |
| OPDS catalog | 8 |
| Podcast drip feeds | 8 |
| Quality analysis | 9 |
| Series gaps | 9 |
| Narrator consistency | 9 |
| Space savers | 9 |
| Duplicates | 9 |
| File grouping | 9 |
| Audio diagnosis | 10 |
| Audio cleaning | 10 |
| Agent system | 10 |
| Recommendations (5 categories) | 11 |
| Listener profile | 11 |
| Social (activity, compare) | 11 |
| AB↔EB sync | 12 |
| Language learning | 12 |
| Goodreads import | 13 |
| OpenLibrary import | 13 |
| Webhooks (intello) | 14 |
| AI config | 14 |
| Vue 3 UI | 15 |
