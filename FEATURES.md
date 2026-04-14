# Audiobookshelf Extended Features

A fork of [advplyr/audiobookshelf](https://github.com/advplyr/audiobookshelf) extending the self-hosted audiobook server with an incoming scanner, taste-based recommendations, library intelligence, social features, a Python agent system, audio restoration, aggregated reviews, LibriVox catalog, OPDS, send-to-Kindle, format conversion, audiobook↔ebook sync, language learning mode, and an AI book companion.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Docker Compose                     │
│                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐  │
│  │   audiobookshelf     │  │       agent           │  │
│  │   (Node.js server)   │  │   (Python worker)     │  │
│  │                      │  │                        │  │
│  │  Managers:           │  │  Tasks:                │  │
│  │  · IncomingManager   │◄─┤  · scan_incoming      │  │
│  │  · QualityManager    │  │  · audio_quality       │  │
│  │  · Recommendation    │  │  · audio_identify      │  │
│  │  · SocialManager     │  │  · audio_diagnose      │  │
│  │  · ReviewManager     │  │  · audio_clean         │  │
│  │  · LibriVoxManager   │  │  · audio_auto_clean    │  │
│  │  · DeliveryManager   │  │  · move_file           │  │
│  │  · GroupingManager   │  │  · download_metadata    │  │
│  │  · ConversionManager │  │  · diag                │  │
│  │  · SyncManager       │  │  · update_agent        │  │
│  │  · LanguageLearning  │  │                        │  │
│  │  · BookCompanion     │  │  abs-wrapper.py        │  │
│  │  · LlmProvider       │  │  (CineCross pattern)   │  │
│  │                      │  │                        │  │
│  │  :80 ◄───────────────┤  │  Heartbeat + polling   │  │
│  └──────────┬───────────┘  └──────────┬─────────────┘  │
│             │                         │                │
│        /audiobooks              /audiobooks             │
│        /incoming                /incoming               │
│        /config                                         │
│        /metadata                                       │
└─────────────────────────────────────────────────────┘
```

---

## Features

### Phase 1: Incoming Folder Scanner

`IncomingManager` watches a designated folder for new files, parses filenames, queries metadata providers, and creates pending items for user review.

- Filesystem watcher on the `/incoming` volume
- Filename parsing with author/title extraction
- Automatic metadata lookup from configured providers
- Pending queue with confirm/reject workflow

| Endpoint | Method | Description |
|---|---|---|
| `/api/incoming` | GET | List all incoming items |
| `/api/incoming/pending` | GET | List pending items only |
| `/api/incoming/:id/confirm` | POST | Confirm and import item |
| `/api/incoming/:id/reject` | POST | Reject item |
| `/api/incoming/scan` | POST | Trigger manual scan |

---

### Phase 2: Library Intelligence

`QualityManager` analyzes your library for bitrate, chapter structure, format quality, series gaps, narrator consistency, and duration statistics.

- Per-library quality scoring (bitrate, chapters, format)
- Series gap detection (missing books in a series)
- Narrator consistency checks across series
- Duration statistics and space-saving opportunities

| Endpoint | Method | Description |
|---|---|---|
| `/api/intelligence/library/:id/quality` | GET | Quality report for a library |
| `/api/intelligence/library/:id/series-gaps` | GET | Missing books in series |
| `/api/intelligence/library/:id/narrator-consistency` | GET | Narrator changes within series |
| `/api/intelligence/stats` | GET | Duration & listening statistics |
| `/api/intelligence/space-savers` | GET | Re-encode candidates to save space |

---

### Phase 3: Taste-Based Recommendations

`RecommendationManager` builds a listener profile and generates recommendations across five categories.

**Categories:**
1. DNA Match — books matching your listening fingerprint
2. Authors/Narrators You Love — more from favorites
3. Complete Series — finish what you started
4. Hidden Gems — low-popularity high-quality matches
5. (Custom category via profile preferences)

**Preferences:**
- Fluent + secondary language selection
- Ebook vs. audiobook format preference
- Profile rebuild on demand

| Endpoint | Method | Description |
|---|---|---|
| `/api/recommendations/profile` | GET | Get listener profile |
| `/api/recommendations/profile/rebuild` | POST | Rebuild profile from history |
| `/api/recommendations/profile/preferences` | PATCH | Update language/format prefs |
| `/api/recommendations/:category` | GET | Get recommendations by category |

---

### Phase 4: Social & Community

`SocialManager` provides an activity feed, taste comparison between users, and community-sourced recommendations.

| Endpoint | Method | Description |
|---|---|---|
| `/api/intelligence/activity` | GET | Activity feed |
| `/api/intelligence/compare/:userId` | GET | Compare tastes with another user |
| `/api/intelligence/community-recommendations` | GET | Community recommendations |

---

### Phase 5: Agent System

A Python agent (`agent/abs-agent.py`) with a wrapper (`abs-wrapper.py`, CineCross pattern) that polls the server for tasks and executes them locally where the audio files live.

**Task types:**

| Task | Aliases | Description |
|---|---|---|
| `scan_incoming` | `scan_incoming_audio` | Scan incoming folder for new files |
| `audio_quality` | `check_quality` | Analyze audio file quality |
| `audio_identify` | `identify_book` | Fingerprint and identify a book |
| `audio_diagnose` | — | Sample 3 points, score noise/hiss/dynamics 0–100 |
| `audio_clean` | — | Clean audio with a profile (light/moderate/heavy/custom) |
| `audio_auto_clean` | — | Diagnose then apply recommended profile |
| `audio_auto_clean_folder` | — | Auto-clean all files in a folder |
| `move_file` | — | Move file between paths |
| `download_metadata` | — | Fetch and apply metadata |
| `diag` | — | System diagnostics |
| `update_agent` | — | Self-update the agent |

**Features:** path mappings between server and agent volumes, offline task buffering, background thread execution for long-running tasks (`BG_TASK_TYPES`), self-update mechanism.

| Endpoint | Method | Description |
|---|---|---|
| `/api/agent/heartbeat` | POST | Agent heartbeat |
| `/api/agent/tasks` | POST | Queue a task |
| `/api/agent/tasks` | GET | List queued tasks |
| `/api/agent/agents` | GET | List connected agents |

---

### Audio Restoration

Handled by the agent's `audio_diagnose` and `audio_clean` tasks.

**Diagnose:** samples audio at 3 points (25%, 50%, 75%), measures noise floor, high-frequency hiss, and dynamic range, then produces a 0–100 score with a recommendation (`none`, `light`, `moderate`, `heavy`).

**Clean profiles:**

| Profile | Use case |
|---|---|
| `light` | Minor background noise |
| `moderate` | Noticeable hiss or hum |
| `heavy` | Significant restoration needed |
| `custom` | User-defined FFmpeg parameters |

**Auto-clean:** runs diagnose, then applies the recommended profile automatically. Works on single files or entire folders.

---

### Reviews & Ratings

`ReviewManager` aggregates reviews and ratings from multiple sources in parallel — no API keys required.

| Source | Data |
|---|---|
| Audible | Ratings, reviews (via ASIN) |
| OpenLibrary | Ratings, reviews (via ISBN / works key) |
| Goodreads | Rating, review count (scraped) |
| Google Books | Rating, review count |
| Hardcover | Rating (GraphQL API) |
| StoryGraph | Rating (scraped) |
| Wikidata | Genres, awards, original language, Wikipedia link |

Returns a unified response with per-source ratings and a weighted average.

---

### LibriVox Catalog

`LibriVoxManager` provides browse and search access to the LibriVox public domain audiobook catalog with one-click download into your library.

| Endpoint | Method | Description |
|---|---|---|
| `/api/librivox/search` | GET | Search LibriVox catalog |
| `/api/librivox/browse` | GET | Browse by genre/author |
| `/api/librivox/:id` | GET | Get audiobook details |
| `/api/librivox/:id/download` | POST | Download into library |

---

### Delivery & OPDS

`DeliveryManager` handles sending books to e-readers and serving an OPDS catalog.

**Send to device:** Kindle, Kobo, PocketBook, Tolino — via email delivery.

**OPDS catalog:** compatible with KyBook, Librera, Moon+ Reader, Calibre, and other OPDS clients. Supports mobile deep links.

| Endpoint | Method | Description |
|---|---|---|
| `/api/items/:id/send-to-kindle` | POST | Send ebook to Kindle |
| `/api/opds` | GET | OPDS root catalog |
| `/api/opds/library/:id` | GET | OPDS library feed |
| `/api/opds/search` | GET | OPDS search |

---

### File Grouping & Conversion

`GroupingManager` auto-detects split chapters uploaded in batches and finds duplicates. `ConversionManager` uses Calibre for format conversion.

- Auto-detect file groups (split chapters, related uploads)
- Duplicate detection
- Format conversion: epub ↔ mobi ↔ azw3 ↔ pdf (via Calibre)
- Metadata extraction

| Endpoint | Method | Description |
|---|---|---|
| `/api/tools/groups` | GET | Detect file groups |
| `/api/tools/groups/:key/merge` | POST | Merge a group |
| `/api/tools/duplicates` | GET | Detect duplicates |
| `/api/tools/convert` | POST | Convert a single item |
| `/api/tools/convert-all` | POST | Batch convert |
| `/api/tools/conversion-check` | GET | Check Calibre availability |
| `/api/tools/extract-metadata` | POST | Extract metadata from file |

---

### Audiobook ↔ Ebook Sync

`SyncManager` uses Whisper STT to align audio with ebook text at the chapter level, enabling Whispersync-style position tracking.

- Speech-to-text via Whisper for audio transcription
- Chapter-level alignment between audiobook and ebook
- Pair detection (matching audiobook + ebook in library)
- Verification and sync generation

| Endpoint | Method | Description |
|---|---|---|
| `/api/sync/check` | GET | Check sync prerequisites |
| `/api/sync/pairs` | GET | Detect audiobook/ebook pairs |
| `/api/sync/verify` | POST | Verify a pair alignment |
| `/api/sync/chapters` | POST | Generate chapter sync map |

---

### Language Learning

`LanguageLearningManager` interleaves text and audio across languages for immersive reading/listening.

**Text interleaving:** sentence or paragraph level, with patterns `ab`, `aab`, `aba` (native + target language).

**Audio interleaving:** native narrator audio interleaved with TTS-generated translation.

| Endpoint | Method | Description |
|---|---|---|
| `/api/language/interleave-text` | POST | Generate interleaved text |
| `/api/language/interleave-audio` | POST | Generate interleaved audio |
| `/api/language/align` | POST | Preview text alignment |

---

### AI Book Companion

`BookCompanionManager` + `LlmProvider` connect to Ollama (local, free) or any OpenAI-compatible API.

**Capabilities:**
- Recap — "what happened so far?" based on current progress
- Chapter summaries
- Smart search — semantic search across book content
- Book chat — ask questions with no-spoiler guardrails
- Character tracker — who's who and their arcs
- Translation QA — check alignment quality

| Endpoint | Method | Description |
|---|---|---|
| `/api/ai/status` | GET | LLM provider status |
| `/api/ai/recap/:bookId` | GET | Progress-aware recap |
| `/api/ai/chapter-summary/:bookId/:chapterIndex` | GET | Single chapter summary |
| `/api/ai/search` | POST | Semantic search |
| `/api/ai/ask/:bookId` | POST | Ask about a book (no spoilers) |
| `/api/ai/character/:bookId` | POST | Character information |
| `/api/ai/check-alignment` | POST | Translation alignment QA |

---

## Setup

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | — | `ollama` or `openai` |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | — | Model name (e.g. `llama3`) |
| `OPENAI_API_KEY` | — | OpenAI-compatible API key |
| `OPENAI_API_URL` | — | Custom OpenAI-compatible endpoint |
| `OPENAI_MODEL` | — | Model name |
| `WHISPER_BIN` | — | Path to Whisper binary |
| `TTS_ENGINE` | — | TTS engine for language learning |
| `TTS_BIN` | — | Path to TTS binary |
| `CALIBRE_BIN` | — | Path to `ebook-convert` |
| `CALIBRE_META_BIN` | — | Path to `ebook-meta` |
| `ABS_SERVER` | — | Server URL (agent) |
| `AGENT_ID` | — | Agent identifier |
| `INCOMING_PATH` | — | Incoming folder path (agent) |

### Docker Compose

```yaml
version: '3.8'
services:
  audiobookshelf:
    build: .
    ports:
      - "13378:80"
    volumes:
      - ./config:/config
      - ./metadata:/metadata
      - /path/to/audiobooks:/audiobooks
      - /path/to/incoming:/incoming
    environment:
      - AUDIOBOOKSHELF_UID=99
      - AUDIOBOOKSHELF_GID=100
    restart: unless-stopped

  agent:
    build:
      context: ./agent
      dockerfile: Dockerfile.agent
    volumes:
      - /path/to/audiobooks:/audiobooks
      - /path/to/incoming:/incoming
    environment:
      - ABS_SERVER=http://audiobookshelf:80
      - AGENT_ID=home-agent
      - INCOMING_PATH=/incoming
    depends_on:
      - audiobookshelf
    restart: unless-stopped
```

### Agent Setup

**Docker:** included in the compose file above — just set the volume paths and `AGENT_ID`.

**Windows:** run the PowerShell setup script:

```powershell
.\agent\setup-windows.ps1
```

This installs Python dependencies and registers the agent as a background service.

---

## API Reference

| Feature | Endpoint | Method |
|---|---|---|
| **Incoming** | `/api/incoming` | GET |
| | `/api/incoming/pending` | GET |
| | `/api/incoming/:id/confirm` | POST |
| | `/api/incoming/:id/reject` | POST |
| | `/api/incoming/scan` | POST |
| **Intelligence** | `/api/intelligence/library/:id/quality` | GET |
| | `/api/intelligence/library/:id/series-gaps` | GET |
| | `/api/intelligence/library/:id/narrator-consistency` | GET |
| | `/api/intelligence/stats` | GET |
| | `/api/intelligence/space-savers` | GET |
| **Social** | `/api/intelligence/activity` | GET |
| | `/api/intelligence/compare/:userId` | GET |
| | `/api/intelligence/community-recommendations` | GET |
| **Recommendations** | `/api/recommendations/profile` | GET |
| | `/api/recommendations/profile/rebuild` | POST |
| | `/api/recommendations/profile/preferences` | PATCH |
| | `/api/recommendations/:category` | GET |
| **Agent** | `/api/agent/heartbeat` | POST |
| | `/api/agent/tasks` | GET/POST |
| | `/api/agent/agents` | GET |
| **LibriVox** | `/api/librivox/search` | GET |
| | `/api/librivox/browse` | GET |
| | `/api/librivox/:id` | GET |
| | `/api/librivox/:id/download` | POST |
| **Delivery** | `/api/items/:id/send-to-kindle` | POST |
| **OPDS** | `/api/opds` | GET |
| | `/api/opds/library/:id` | GET |
| | `/api/opds/search` | GET |
| **Tools** | `/api/tools/groups` | GET |
| | `/api/tools/groups/:key/merge` | POST |
| | `/api/tools/duplicates` | GET |
| | `/api/tools/convert` | POST |
| | `/api/tools/convert-all` | POST |
| | `/api/tools/conversion-check` | GET |
| | `/api/tools/extract-metadata` | POST |
| **Sync** | `/api/sync/check` | GET |
| | `/api/sync/pairs` | GET |
| | `/api/sync/verify` | POST |
| | `/api/sync/chapters` | POST |
| **Language** | `/api/language/interleave-text` | POST |
| | `/api/language/interleave-audio` | POST |
| | `/api/language/align` | POST |
| **AI** | `/api/ai/status` | GET |
| | `/api/ai/recap/:bookId` | GET |
| | `/api/ai/chapter-summary/:bookId/:chapterIndex` | GET |
| | `/api/ai/search` | POST |
| | `/api/ai/ask/:bookId` | POST |
| | `/api/ai/character/:bookId` | POST |
| | `/api/ai/check-alignment` | POST |
