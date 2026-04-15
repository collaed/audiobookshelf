# Requirements Specification — Audiobookshelf Extended

## 1. Product Overview

Audiobookshelf Extended is a fork of advplyr/audiobookshelf (v2.33.1) adding 21 new managers, 19 controllers, 2 providers, 2 models, a Python agent, a Vue 3 frontend, and comprehensive testing — modifying only 174 lines across 3 upstream files.

## 2. Functional Requirements

### FR-01: Incoming Folder Scanner
- FR-01.1: Watch configurable folder for new audiobook files
- FR-01.2: Parse filenames/folders for author, title, series, sequence
- FR-01.3: Read embedded audio metadata (ID3/M4B/Vorbis) via music-metadata
- FR-01.4: Query Audible, Google Books, OpenLibrary for matches
- FR-01.5: Present pending items for user confirmation/rejection
- FR-01.6: Move confirmed files to library with Author/Title/ naming
- FR-01.7: Detect duplicates via normalized name matching

### FR-02: Library Intelligence
- FR-02.1: Analyze audio quality (bitrate, codec, channels, chapters)
- FR-02.2: Detect missing books in series (gap detection)
- FR-02.3: Flag narrator inconsistencies within series
- FR-02.4: Provide per-user listening statistics
- FR-02.5: Suggest space-saving candidates
- FR-02.6: Detect library-wide duplicates

### FR-03: Recommendations
- FR-03.1: Build profiles weighted by genre(1x), author(2x), narrator(1.5x), theme(1x)
- FR-03.2: 5 categories: DNA Match, Authors/Narrators You Love, Complete Series, Hidden Gems
- FR-03.3: Language preferences (fluent + secondary)
- FR-03.4: Format preferences (audiobook/ebook/both)
- FR-03.5: Import ratings from Goodreads CSV and OpenLibrary

### FR-04: Social/Community
- FR-04.1: Activity feed of finished books across users
- FR-04.2: Taste comparison between users
- FR-04.3: Collaborative filtering recommendations

### FR-05: Reviews & Ratings
- FR-05.1: Aggregate from 7 sources (Audible, OpenLibrary, Goodreads, Google Books, Hardcover, StoryGraph, Wikidata)
- FR-05.2: Weighted average across sources
- FR-05.3: 24h cache, no API keys required

### FR-06: Free Content Catalogs
- FR-06.1: LibriVox search/browse/download (free audiobooks)
- FR-06.2: Project Gutenberg search/browse/download (free ebooks)
- FR-06.3: One-click download into library

### FR-07: Device Delivery
- FR-07.1: Send to Kindle/Kobo/PocketBook/Tolino via email
- FR-07.2: OPDS catalog for mobile reader apps
- FR-07.3: Mobile deep links

### FR-08: File Grouping & Conversion
- FR-08.1: Detect split chapters uploaded in batches
- FR-08.2: Merge grouped files into library
- FR-08.3: Calibre-based format conversion (epub↔mobi↔azw3↔pdf)

### FR-09: Audio Restoration
- FR-09.1: Diagnose via 3-point sampling (noise, hiss, dynamics → 0-100 score)
- FR-09.2: Clean profiles: light, moderate, heavy, custom
- FR-09.3: One-click auto-clean, preserve originals

### FR-10: Audiobook ↔ Ebook Sync
- FR-10.1: Detect pairs by title similarity
- FR-10.2: Verify via Whisper STT
- FR-10.3: Chapter-level Whispersync-style alignment

### FR-11: Language Learning
- FR-11.1: Cross-language sentence alignment
- FR-11.2: Interleaved text (patterns: ab/aab/aba)
- FR-11.3: Interleaved audio (native narrator + TTS translation)

### FR-12: AI Book Companion
- FR-12.1: Spoiler-safe recaps, book chat, character tracking
- FR-12.2: Natural language library search
- FR-12.3: Translation quality checking
- FR-12.4: Backends: L'Intello, Ollama, OpenAI, custom, disabled

### FR-13: Auto-Tagging
- FR-13.1: Multi-sample LLM analysis (5 text points)
- FR-13.2: Genres, mood, themes, pace, content warnings, similar books
- FR-13.3: Batch tagging for untagged libraries

### FR-14: Book Summaries
- FR-14.1: getAbstract/Headway-style structured summaries
- FR-14.2: 3 styles × 3 lengths, text + audio output

### FR-15: Text Modernization
- FR-15.1: Modernize archaic text preserving meaning/tone
- FR-15.2: 4 styles: modern literary, casual, young adult, simplified

### FR-16: Ebook → Audiobook
- FR-16.1: Extract text, split chapters, TTS per chapter, save as MP3s

### FR-17: OCR
- FR-17.1: Delegate to L'Intello (Tesseract/OCRmyPDF)
- FR-17.2: Searchable PDF creation, text extraction, async jobs

### FR-18: Podcast Feeds
- FR-18.1: Drip-feed chapters as podcast episodes (daily/weekdays/weekly)

### FR-19: Agent System
- FR-19.1: Python agent with wrapper (exit 42=restart)
- FR-19.2: 15 task types, path mappings, offline buffering, background threads

### FR-20: Name Normalization
- FR-20.1: Parse/match First Last, Last First, initials, prefixes, suffixes

### FR-21: Cloud Storage
- FR-21.1: rclone FUSE mounts for 70+ cloud backends

## 3. Non-Functional Requirements

- NFR-01: ≤200 lines upstream modification (actual: 174)
- NFR-02: Graceful degradation for all optional services
- NFR-03: User-friendly error messages (no raw paths/traces)
- NFR-04: 464+ automated tests
- NFR-05: No API keys required for core features
