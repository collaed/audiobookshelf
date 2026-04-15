# Requirements Specification — Audiobookshelf Extended (Deep-Dive)

## 1. Product Overview

Fork of advplyr/audiobookshelf v2.33.1. Adds 21 managers, 19 controllers, 2 providers, 2 models, Python agent, Vue 3 frontend. Modifies 174 lines in 3 upstream files (Database.js, Server.js, ApiRouter.js).

## 2. Functional Requirements

---

### FR-01: Incoming Folder Scanner

**EARS User Stories:**
- When a new audio file (.m4b/.mp3/.m4a/.opus/.flac/.ogg) appears in the incoming folder, the system shall read embedded metadata via music-metadata, parse the filename as fallback, and query providers for matches, so that the user sees a pending item with proposed metadata.
- When the user confirms a pending item, the system shall move the file to the library folder under Author/Title/ naming, so that ABS scanner picks it up.
- When the user rejects a pending item, the system shall mark it as rejected, so that it no longer appears in the pending list.

**Edge Cases:**
- File has no embedded metadata → falls back to filename parsing
- File is already being processed (in processing Set) → skipped
- File extension not in audio set → skipped
- Duplicate detected (same title+author via namesMatch) → status set to 'duplicate'
- Provider query fails → continues to next provider (try/catch per provider)
- readEmbeddedMetadata throws → returns null, filename parsing used

**Input Validation:**
- POST /incoming/:id/confirm: libraryId AND libraryFolderId required (400)
- POST /incoming/scan: no params required

**Security:** Global auth only (no per-route middleware). All /incoming/* routes.

---

### FR-02: Library Intelligence

**EARS User Stories:**
- When the user requests quality analysis for a library, the system shall analyze bitrate, chapters, format consistency, and channels for all books, so that quality issues are identified.
- When the user requests series gaps, the system shall compare owned sequence numbers against the full series, so that missing books are identified.
- When the user requests narrator consistency, the system shall flag series where narrators differ between books.

**Edge Cases:**
- Library not found → 404
- Book has no audioFiles → score 0, issues: ['No audio files']
- audioFiles is null/empty array → returns default score object
- Series has no sequence numbers → skipped in gap detection

**Input Validation:**
- GET /intelligence/library/:id/*: library ID from URL params
- GET /intelligence/stats: no params (uses req.user.id)

**Security:** Global auth only.

---

### FR-03: Recommendations

**EARS User Stories:**
- When the user requests recommendations, the system shall build a taste profile from finished books weighted by genre(1x), author(2x), narrator(1.5x), theme(1x), filter by language/format preferences, and return 5 categories.
- When the user updates preferences (fluentLanguages, secondaryLanguages, includeEbooks, preferredFormat), the system shall persist them and apply to future recommendations.

**Edge Cases:**
- No finished books → returns null profile, empty recommendations
- Invalid category → 400 with valid category list
- Book has no genres/narrators → contributes 0 to those scores
- Language filter set but book has no language field → book passes filter

**Input Validation:**
- GET /recommendations/:category: must be one of: all, dna_match, authors_you_love, narrators_you_love, complete_series, hidden_gems (400)
- PATCH /recommendations/profile/preferences: all fields optional

**Security:** Global auth only.

---

### FR-04: Social/Community

**EARS User Stories:**
- When the user requests the activity feed, the system shall return recently finished books across all users with user name, book title, and author.
- When the user compares tastes with another user, the system shall compute shared books, authors, genres, and a compatibility score (0-100).

**Edge Cases:**
- Target user not found → empty comparison
- No shared books → compatibilityScore = 0

**Input Validation:**
- GET /intelligence/compare/:userId: userId from URL params

**Security:** Global auth only.

---

### FR-05: Reviews & Ratings

**EARS User Stories:**
- When the user requests reviews for a book, the system shall query 7 sources in parallel (Audnexus, OpenLibrary, Goodreads, Google Books, Hardcover, StoryGraph, Wikidata), compute weighted average, cache for 24h, and return aggregated results.

**Edge Cases:**
- Book has no ASIN → Audnexus skipped (returns null)
- Book has no ISBN → OpenLibrary/Goodreads fall back to title+author search
- Invalid ASIN format → Audnexus returns null immediately
- Any provider network error → that source returns null, others still work
- All providers fail → returns { sources: [], avgRating: 0, totalRatings: 0 }
- Cache hit within 24h → returns cached data without API calls
- Goodreads HTML has no ratingValue JSON-LD → returns null
- Wikidata entity not found → returns null (rating=0, won't affect average)

**Input Validation:** None (book ID from middleware).

**Security:** Per-item middleware (LibraryItemController.middleware).

---

### FR-06: LibriVox Catalog

**EARS User Stories:**
- When the user searches LibriVox, the system shall query the LibriVox API and return cleaned results with title, author, duration, language, download URL.
- When the user downloads a LibriVox book, the system shall download the zip from archive.org, extract MP3s to Author/Title/ folder, and clean up the zip.

**Edge Cases:**
- LibriVox book not found → throw 'LibriVox book not found: {id}'
- No download URL → throw 'No download URL for book: {id}'
- Zip extraction fails → zip cleaned up in finally block
- q parameter missing → 400

**Input Validation:**
- GET /librivox/search: q required (400)
- POST /librivox/:id/download: libraryFolderId required (400)
- Library folder not found → 404

**Security:** Global auth only.

---

### FR-07: Gutenberg Catalog

**EARS User Stories:**
- When the user searches Gutenberg, the system shall query the Gutendex API and return books with available formats (epub, mobi, text, html, cover).
- When the user downloads a Gutenberg book, the system shall download the requested format to Author/Title/ folder.

**Edge Cases:**
- Gutenberg book not found → throw 'Gutenberg book not found: {id}'
- Requested format not available → throw 'Format not available for book: {id}'
- q parameter missing → 400

**Input Validation:**
- GET /gutenberg/search: q required (400)
- POST /gutenberg/:id/download: libraryFolderId required (400)

**Security:** Global auth only.

---

### FR-08: Device Delivery

**EARS User Stories:**
- When the user sends a book to Kindle, the system shall validate the ebook format (epub/pdf/mobi/azw3 supported), send via configured SMTP, and confirm delivery.
- When the user requests the OPDS catalog, the system shall generate Atom XML with acquisition links for ebooks and audiobooks.

**Edge Cases:**
- No ebook file → throw 'No ebook file found'
- Kindle unsupported format (e.g., cbz) → throw "Kindle doesn't support {format}"
- Device not found → throw 'Device "{name}" not found'
- email missing → 400
- deviceName missing → 400
- SMTP not configured → friendlyError from EmailManager

**Input Validation:**
- POST /items/:id/send-to-kindle: email required (400)
- POST /items/:id/send-to-device: deviceName required (400)

**Security:** Per-item middleware for /items/:id/* routes. OPDS routes use global auth only.

---

### FR-09: File Grouping & Conversion

**EARS User Stories:**
- When the user requests group detection, the system shall normalize titles (strip chapter/part/disc words), group by author+title, and identify related files uploaded in separate batches.
- When the user merges a group, the system shall move all files to a single Author/Title/ folder.
- When the user requests format conversion, the system shall invoke Calibre's ebook-convert CLI.

**Edge Cases:**
- Group not found → throw 'Group not found'
- Calibre not installed → throw 'Calibre ebook-convert not found. Install Calibre or set CALIBRE_BIN env var.'
- Library folder not found → 404
- bookId or format missing → 400

**Input Validation:**
- POST /tools/groups/:key/merge: libraryFolderId required (400)
- POST /tools/convert: bookId AND format required (400)
- POST /tools/convert-all: bookId required (400)
- POST /tools/extract-metadata: filePath required (400)

**Security:** Global auth only.

---

### FR-10: Audio Restoration

**EARS User Stories:**
- When the agent receives an audio_diagnose task, it shall sample 3 points (10%, 50%, 90%), measure noise floor, high-frequency energy, and dynamic range, and return a 0-100 score with recommendation (none/light/moderate/heavy).
- When the agent receives an audio_auto_clean task, it shall diagnose first, then apply the recommended ffmpeg filter profile if score >= min_score, preserving the original as .original.ext.

**Edge Cases:**
- File not found → {error: 'file not found'}
- File too short (<5s) → {error: 'file too short'}
- ffmpeg/ffprobe not available → subprocess error
- Score below min_score → {action: 'skipped'}
- Timeout (>1h for clean) → temp file removed, error returned

**Input Validation:** Via agent task params (path required).

**Security:** Agent tasks queued via /agent/tasks (global auth). Agent authenticates via heartbeat.

---

### FR-11: Audiobook ↔ Ebook Sync

**EARS User Stories:**
- When the user requests pair detection, the system shall compare all audiobook-only and ebook-only items by normalized title similarity, returning pairs with confidence scores.
- When the user requests STT verification, the system shall transcribe 60s of audio via Whisper and compare word overlap against ebook text.

**Edge Cases:**
- No audio files in audiobook → throw 'No audio files in audiobook'
- No ebook file → throw 'No ebook file'
- Both audio and ebook required for chapter sync → throw 'Both audio and ebook files required'
- Whisper not installed → subprocess error → friendlyError
- libraryId missing → 400
- audioBookId and ebookBookId missing → 400

**Input Validation:**
- GET /sync/pairs: libraryId required (400)
- POST /sync/verify: audioBookId AND ebookBookId required (400)
- POST /sync/chapters: audioBookId AND ebookBookId required (400)

**Security:** Global auth only.

---

### FR-12: Language Learning

**EARS User Stories:**
- When the user requests text interleaving, the system shall align sentences between two language editions using sbd for splitting and proportional mapping, generating styled HTML with configurable patterns (ab/aab/aba).
- When the user requests audio interleaving, the system shall segment the native audiobook via Whisper STT, generate TTS for translation sentences via Piper/espeak, and concatenate with pauses.

**Edge Cases:**
- bookIdA or bookIdB missing → 400
- Both books need ebook files for text alignment → 400
- audioBookId or translationBookId missing → 400
- No audio files in source book → throw
- No ebook file for translation → throw
- TTS fails for a segment → logged, segment skipped

**Input Validation:**
- POST /language/interleave-text: bookIdA AND bookIdB required (400)
- POST /language/interleave-audio: audioBookId AND translationBookId required (400)
- POST /language/align: bookIdA AND bookIdB required (400), Both books need ebook files (400)

**Security:** Global auth only.

---

### FR-13: AI Book Companion

**EARS User Stories:**
- When the user requests a recap, the system shall extract text up to the user's current reading position (from MediaProgress), send to LLM with a no-spoilers system prompt, and return a summary.
- When the user asks a question about a book, the system shall scope the context to their current position and instruct the LLM to never reveal future events.
- When the user searches their library with natural language, the system shall send the catalog to the LLM and return matching book IDs with reasons.

**Edge Cases:**
- LLM provider disabled → complete() returns empty string
- LLM unreachable → axios error → friendlyError
- LLM returns malformed JSON (smart search) → returns { rawResponse }
- Book not found → returns empty string for text
- No MediaProgress → defaults to 10% position
- query missing → 400
- question missing → 400
- name missing → 400
- pairs array missing → 400

**Input Validation:**
- POST /ai/search: query required (400)
- POST /ai/ask/:bookId: question required (400)
- POST /ai/character/:bookId: name required (400)
- POST /ai/check-alignment: pairs array required (400)

**Security:** Global auth only. LLM config via PATCH /ai/config (global auth).

---

### FR-14: Auto-Tagging

**EARS User Stories:**
- When the user requests auto-tagging, the system shall sample 5 points in the book text (beginning, 25%, 45%, 65%, end), send to LLM, and return structured tags (genres, mood, themes, pace, content warnings, similar books, one-liner).
- When the user applies tags, the system shall merge generated genres with existing ones (deduplicating) and save to the book model.

**Edge Cases:**
- Book not found → {error: 'Book not found'}
- No ebook file and no description → {metadata, samples: null}
- LLM returns no JSON → {error: 'LLM returned no JSON', raw: first 200 chars}
- LLM returns invalid JSON → {error: 'Failed to parse LLM response', raw: first 200 chars}
- tags.error returned → controller returns 400

**Input Validation:** Book ID from middleware.

**Security:** Per-item middleware for /items/:id/auto-tag*. Batch /libraries/:id/auto-tag uses global auth.

---

### FR-15: Book Summaries

**EARS User Stories:**
- When the user requests a summary, the system shall sample the book text, send to LLM with a structured prompt requesting getAbstract-style output, and return JSON with oneLiner, keyInsight, summary, keyPoints, actionItems, quotes, whoShouldRead, readingTime.
- When the user requests an audio summary, the system shall generate the text summary, build a narration script, generate TTS, convert to MP3, and return the audio path.

**Edge Cases:**
- Book not found or no ebook → throw 'Book not found or has no ebook file'
- Could not extract text → throw
- LLM returns empty → throw 'LLM returned empty response'
- Failed to parse JSON → throw 'Failed to parse summary JSON from LLM response'
- TTS fails → friendlyError

**Input Validation:** Book ID from middleware. Optional body: style, length, language.

**Security:** Per-item middleware.

---

### FR-16: Text Modernization

**EARS User Stories:**
- When the user requests modernization preview, the system shall modernize the first chapter and return both original and modernized text.
- When the user requests full modernization, the system shall process all chapters sequentially (to maintain context), saving as HTML in metadata/modernized/.

**Edge Cases:**
- Book not found or no ebook → throw
- Could not extract text → throw
- LLM returns empty → throw 'LLM returned empty response'
- Chapter index out of range → throw 'Chapter {n} not found ({total} chapters detected)'

**Input Validation:** Book ID from middleware. Optional body: style, chapters.

**Security:** Per-item middleware.

---

### FR-17: Ebook → Audiobook

**EARS User Stories:**
- When the user requests conversion, the system shall extract text from the ebook, split into chapters, generate TTS per chapter via Piper/espeak, convert to MP3, and save as numbered files.

**Edge Cases:**
- No ebook file → throw "This book doesn't have an ebook file attached."
- Could not extract text → throw 'Could not extract text from ebook. Try running OCR first.'
- No chapter markers found → falls back to size-based splitting (~5000 chars)
- TTS fails for a chapter → logged, error in results array, other chapters continue
- ffmpeg conversion fails → chapter error

**Input Validation:** Book ID from middleware. Optional body: voice/language.

**Security:** Per-item middleware.

---

### FR-18: OCR

**EARS User Stories:**
- When the user requests OCR on a PDF, the system shall submit an async job to L'Intello, poll for completion, and download the searchable PDF.

**Edge Cases:**
- No ebook file → 400 'No ebook file found'
- Not a PDF → 400 'OCR only supports PDF, got {format}'
- L'Intello unreachable → friendlyError
- OCR job fails → throw from status check
- Job timeout → keeps polling (no explicit timeout)

**Input Validation:**
- POST /items/:id/ocr: book must have ebook file, must be PDF
- Optional body: language (default 'eng')

**Security:** Per-item middleware.

---

### FR-19: Podcast Feeds

**EARS User Stories:**
- When the user creates a scheduled feed, the system shall calculate release dates based on schedule (daily/weekdays/weekly/twice-weekly), create the feed via ABS's RssFeedManager, and update episode pubDates.

**Edge Cases:**
- Library item not found → throw
- Book has no chapters or audio files → throw
- Feed creation fails → friendlyError

**Input Validation:** Book ID from middleware. Optional body: schedule, releaseTime, startDate, slug.

**Security:** Per-item middleware for /items/:id/podcast-feed. Global auth for /feeds/:id/schedule.

---

### FR-20: Agent System

**EARS User Stories:**
- When an agent sends a heartbeat, the system shall update agent info (lastSeen, version, hostname), process any completed task result, and return the next queued task.
- When a task is queued, the system shall validate the type, assign priority, and add to the queue.

**Edge Cases:**
- agentId missing → 400
- Invalid task type → 400 with valid type list
- No tasks in queue → returns { task: null }
- Agent reports error result → logged, processed by type
- Result processing throws → caught, logged

**Input Validation:**
- POST /agent/heartbeat: agentId required (400)
- POST /agent/tasks: type must be valid (400)

**Security:** Global auth only. Agent authenticates via JWT in heartbeat.

---

### FR-21: Rating Import

**EARS User Stories:**
- When the user uploads a Goodreads CSV, the system shall parse ratings, match books by ISBN/title+author, update MediaProgress, and rebuild the listener profile.
- When the user provides an OpenLibrary username, the system shall fetch the reading log and match entries to library books.

**Edge Cases:**
- No CSV file uploaded → 400
- OpenLibrary username missing → 400
- CSV parsing error → friendlyError
- No matching books found → imported=0, unmatched=N

**Input Validation:**
- POST /ratings/import/goodreads: file upload required (400)
- POST /ratings/import/openlibrary: username required (400)

**Security:** Global auth only.

---

### FR-22: Name Normalization (Cross-cutting)

**EARS User Stories:**
- When comparing author names, the system shall normalize 'Tolkien, J.R.R.' and 'J.R.R. Tolkien' to the same canonical form, so that duplicates are detected regardless of name format.

**Edge Cases:**
- Single name ('Homer') → { first: '', last: 'Homer' }
- Prefixed last name ('Ursula K. Le Guin') → last: 'Le Guin'
- Suffix ('Alexandre Dumas, père') → suffix detected, not confused with Last, First
- All-caps ('TOLKIEN') → lowercased in normalization
- Initial matching: 'J.' matches any first name starting with 'J'
- Empty/null input → { first: '', last: '', full: '' }

---

### FR-23: LLM Provider (Cross-cutting)

**EARS User Stories:**
- When the LLM provider is set to 'disabled', all AI features shall return empty results without errors.
- When the LLM provider is set to 'airouter', the system shall send requests to L'Intello's OpenAI-compatible endpoint with Bearer token auth.
- When the LLM is unreachable, the system shall log the error and return empty string, so that non-AI features are unaffected.

**Edge Cases:**
- Provider disabled → complete() returns ''
- Provider not configured → _getEndpoint() returns null → returns ''
- Network error → caught, logged, returns ''
- Response has no choices/content → returns ''

---

### FR-24: Cloud Storage (Cross-cutting)

**EARS User Stories:**
- When the user runs setup-cloud-storage.sh, the system shall install rclone, configure the chosen provider, create a FUSE mount, and set up a systemd service for persistence.

---

## 3. Non-Functional Requirements

- **NFR-01 Upstream Compatibility:** ≤200 lines upstream modification (actual: 174 in 3 files)
- **NFR-02 Graceful Degradation:** Every optional service (LLM, OCR, Whisper, Calibre, TTS, agent) returns null/empty on failure
- **NFR-03 Error Handling:** asyncHandler wraps all 63 async controller methods; friendlyError maps ECONNREFUSED, 401, 429, missing tools to user-friendly messages; file paths sanitized; messages capped at 200 chars
- **NFR-04 Security:** JWT auth via passport-jwt; no raw paths in errors; parameterized Sequelize queries; no eval/exec in server code
- **NFR-05 Testing:** 464+ tests (mocha unit/integration/contract + pytest agent + playwright E2E)
- **NFR-06 Performance:** Duplicate detection reads <8KB per file (size+hash); review cache 24h; unread book query limit 500; OPDS limit 500

## 4. Security Constraints

**Routes with per-item auth middleware (17):** All /items/:id/* routes (reviews, send-to-kindle, send-to-device, mobile-links, ocr, auto-tag, modernize, summary, convert-to-audio, podcast-feed)

**Routes with global auth only (65 new):** /incoming/*, /intelligence/*, /recommendations/*, /agent/*, /ai/*, /librivox/*, /gutenberg/*, /opds/*, /sync/*, /language/*, /tools/*, /ratings/*, /feeds/:id/schedule, /ocr/status, /libraries/:id/auto-tag

**File upload routes:** /ratings/import/goodreads (CSV), /upload (audiobooks/ebooks)

**External process execution:** ebook-convert (ConversionManager), whisper (SyncManager), ffmpeg/ffprobe (SyncManager, LanguageLearningManager, TextToAudiobookManager, BookSummaryManager, agent), piper/espeak (LanguageLearningManager, TextToAudiobookManager, BookSummaryManager)

**Outbound HTTP:** ReviewManager (7 sources), LibriVoxManager (librivox.org, archive.org), GutenbergManager (gutendex.com), OcrManager (intello), LlmProvider (intello/ollama/openai), RatingImportManager (openlibrary.org)
