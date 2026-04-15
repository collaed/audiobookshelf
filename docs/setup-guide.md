# Audiobookshelf Extended — Setup Guide

Welcome! This guide walks you through features from basic to advanced. **Skip any section you don't need.**

---

## Level 1: Core (5 minutes)

### 1.1 Create your account
Go to your ABS instance and create a root account on first visit.

### 1.2 Create a library
Settings → Libraries → Add Library → point to your audiobooks folder.
ABS scans automatically and imports books with metadata from Audible/Google Books/OpenLibrary.

### 1.3 Start listening
Click any book → Play. That's it. You have a working audiobook server.

**You can stop here.** Everything below is optional.

---

## Level 2: Incoming Scanner (10 minutes)

*Drop files in a folder, ABS identifies and organizes them.*

### 2.1 How it works
ABS watches an "incoming" folder. When you drop audio files in, it:
- Reads embedded tags (ID3/M4B) via music-metadata
- Falls back to parsing the filename/folder structure
- Queries Audible, Google Books, OpenLibrary for matches
- Creates a "pending" item for you to confirm or reject

### 2.2 Check pending items
```
GET /api/incoming/pending
```

### 2.3 Confirm or reject
```
POST /api/incoming/{id}/confirm   { "libraryId": "...", "libraryFolderId": "..." }
POST /api/incoming/{id}/reject
```

### 2.4 Trigger a manual scan
```
POST /api/incoming/scan
```

---

## Level 3: Reviews & Ratings (2 minutes)

*See what others think before you start a book.*

No setup needed. For any book in your library:
```
GET /api/items/{id}/reviews
```
Returns aggregated ratings from Audible, Goodreads, OpenLibrary, Google Books, Hardcover, StoryGraph, plus Wikidata enrichment (genres, awards, original language).

**No API keys required** — all sources are free/public.

---

## Level 4: Library Intelligence (2 minutes)

*Find quality issues, missing books, and stats.*

No setup needed. All endpoints work on your existing library:

```
GET /api/intelligence/library/{id}/quality          # bitrate, chapters, format analysis
GET /api/intelligence/library/{id}/series-gaps       # missing books in series
GET /api/intelligence/library/{id}/narrator-consistency  # narrator changes in series
GET /api/intelligence/stats                          # your listening stats
GET /api/intelligence/space-savers                   # largest finished books (free up space)
```

---

## Level 5: Recommendations (5 minutes)

*"What should I read next?"*

### 5.1 Set your preferences
```
PATCH /api/recommendations/profile/preferences
{
  "fluentLanguages": ["English", "French"],
  "secondaryLanguages": ["German"],
  "includeEbooks": true,
  "preferredFormat": "all"
}
```

### 5.2 Get recommendations
```
GET /api/recommendations/all
```
Returns 5 categories: DNA Match, Authors You Love, Narrators You Love, Complete the Series, Hidden Gems.

### 5.3 Rebuild your profile
After rating/finishing more books:
```
POST /api/recommendations/profile/rebuild
```

---

## Level 6: Free Audiobooks from LibriVox (5 minutes)

*Thousands of free public domain audiobooks.*

```
GET /api/librivox/search?q=sherlock+holmes    # search
GET /api/librivox/browse?page=1               # browse catalog
GET /api/librivox/{id}                        # details + chapters
POST /api/librivox/{id}/download              # one-click download to library
  { "libraryFolderId": "..." }
```

---

## Level 7: Send to Devices (10 minutes)

*Read on Kindle, Kobo, phone, or any e-reader.*

### 7.1 Configure email (required for Kindle/Kobo)
In ABS admin: Settings → Email → configure your SMTP server.

### 7.2 Send to Kindle
```
POST /api/items/{id}/send-to-kindle
{ "email": "yourname@kindle.com" }
```
Add your ABS sender email to [Amazon's approved senders](https://www.amazon.com/hz/mycd/myx#/home/settings/payment).

### 7.3 Send to other e-readers
Settings → Email → E-Reader Devices → add your device (name + email).
```
POST /api/items/{id}/send-to-device
{ "deviceName": "My Kobo" }
```

### 7.4 OPDS for mobile apps
Point any OPDS reader at: `https://your-server/api/opds`

Works with: KyBook (iOS), Moon+ Reader (Android), Librera, FBReader, Calibre.

---

## Level 8: Agent System (15 minutes)

*A helper that runs on your network, scans files, checks quality, cleans audio.*

### 8.1 Install the agent

**Docker** (alongside ABS):
Uncomment the `agent` service in docker-compose.yml.

**Windows** (your desktop, access to NAS):
```powershell
cd C:\abs-agent
python abs-wrapper.py --server https://your-server
```
Edit `abs-agent.json` for path mappings (server paths ↔ your local/UNC paths).

### 8.2 Queue tasks
```
POST /api/agent/tasks
{ "type": "scan_incoming", "params": { "path": "/incoming" } }
```

### 8.3 Available task types
| Task | What it does |
|------|-------------|
| `scan_incoming` | Find audio files in a folder |
| `audio_quality` | Check bitrate, codec, chapters via ffprobe |
| `audio_identify` | Read embedded metadata tags |
| `audio_diagnose` | Sample file, score noise/hiss, suggest cleaning level |
| `audio_auto_clean` | Diagnose + clean in one shot |
| `audio_clean` | Clean with specific profile (light/moderate/heavy) |
| `move_file` | Move file to destination |
| `download_metadata` | Fetch from OpenLibrary |
| `diag` | System diagnostics |

---

## Level 9: Audio Restoration (5 minutes)

*Clean up old, scratchy audiobooks.*

Requires: agent running with ffmpeg installed.

### 9.1 Diagnose first
```
POST /api/agent/tasks
{ "type": "audio_diagnose", "params": { "path": "/audiobooks/Old Book/file.mp3" } }
```
Returns a 0-100 score and recommends: none / light / moderate / heavy.

### 9.2 One-click clean
```
POST /api/agent/tasks
{ "type": "audio_auto_clean", "params": { "path": "/audiobooks/Old Book/file.mp3" } }
```
Diagnoses, picks the right profile, cleans. Original saved as `.original.mp3`.

### 9.3 Clean an entire book
```
POST /api/agent/tasks
{ "type": "audio_auto_clean_folder", "params": { "path": "/audiobooks/Old Book/" } }
```

---

## Level 10: Format Conversion (5 minutes)

*Convert ebooks between formats for different readers.*

Requires: Calibre installed on the server (`apt install calibre`).

```
POST /api/tools/convert        { "bookId": "...", "format": "mobi" }
POST /api/tools/convert-all    { "bookId": "..." }   # epub + mobi + azw3
GET  /api/tools/conversion-check                      # verify Calibre available
```

Also: detect duplicate books and group split chapters:
```
GET  /api/tools/duplicates?libraryId=...
GET  /api/tools/groups
POST /api/tools/groups/{key}/merge  { "libraryFolderId": "..." }
```

---

## Level 11: AI Features (10 minutes)

*Book recaps, smart search, reading companion — powered by LLM.*

### 11.1 Configure your LLM backend

In ABS settings or via API:
```
PATCH /api/ai/config
{ "provider": "airouter", "baseUrl": "http://intello:8000", "token": "..." }
```

Options:
| Provider | Setup | Cost |
|----------|-------|------|
| L'Intello / airouter | Docker container, routes to 24 LLMs | Free (uses free tiers) |
| Ollama | `docker run ollama/ollama` | Free (local) |
| OpenAI | API key | Pay per token |
| Disabled | No setup | AI features hidden |

### 11.2 Use AI features
```
GET  /api/ai/recap/{bookId}                    # "What happened so far?"
POST /api/ai/search { "query": "..." }         # natural language library search
POST /api/ai/ask/{bookId} { "question": "..." } # ask about the book (no spoilers)
POST /api/ai/character/{bookId} { "name": "..." } # character tracker
```

### 11.3 Check status
```
GET /api/ai/status
```

---

## Level 12: Audiobook ↔ Ebook Sync (10 minutes)

*Match audiobooks to ebooks, Whispersync-style chapter alignment.*

Requires: Whisper (`pip install openai-whisper`) on the server.

```
GET  /api/sync/pairs?libraryId=...              # auto-detect AB↔EB pairs by title
POST /api/sync/verify { "audioBookId", "ebookBookId" }  # verify with STT
POST /api/sync/chapters { "audioBookId", "ebookBookId" } # chapter-level sync
```

---

## Level 13: Language Learning (10 minutes)

*Interleave two language editions for reading/listening practice.*

```
POST /api/language/align          # preview sentence alignment
  { "bookIdA": "french", "bookIdB": "english" }

POST /api/language/interleave-text   # generate bilingual ebook
  { "bookIdA": "...", "bookIdB": "...", "pattern": "ab" }

POST /api/language/interleave-audio  # native narrator + TTS translation
  { "audioBookId": "...", "translationBookId": "..." }
```

Patterns: `ab` (alternating), `aab` (immersion), `aba` (reinforcement).

---

## Level 14: OCR for Scanned Books (5 minutes)

*Make scanned PDFs searchable and usable by AI features.*

Requires: L'Intello with OCR enabled (Tesseract + OCRmyPDF).

```
POST /api/items/{id}/ocr          { "language": "eng" }  # create searchable PDF
POST /api/items/{id}/ocr/text     { "language": "fra" }  # extract text only
GET  /api/ocr/status                                      # check OCR availability
```

---

## Level 15: Cloud Storage (15 minutes)

*Use Google Drive, Dropbox, OneDrive, S3 as your audiobook storage.*

```bash
sudo ./scripts/setup-cloud-storage.sh
```

Choose your provider, authorize, and a mount appears as a local folder. Add it as a Docker volume and create an ABS library pointing to it.

---

## Environment Variables Reference

| Variable | Default | What |
|----------|---------|------|
| `LLM_PROVIDER` | `disabled` | `airouter` / `ollama` / `openai` / `disabled` |
| `INTELLO_URL` | `http://intello:8000` | L'Intello backend URL |
| `INTELLO_TOKEN` | | Auth token for intello |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama URL (if using directly) |
| `OLLAMA_MODEL` | `llama3.2` | Ollama model name |
| `OPENAI_API_KEY` | | OpenAI key (if using directly) |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model |
| `WHISPER_BIN` | `whisper` | Path to Whisper CLI |
| `TTS_ENGINE` | `piper` | TTS engine (`piper` or `espeak`) |
| `CALIBRE_BIN` | `ebook-convert` | Path to Calibre CLI |
