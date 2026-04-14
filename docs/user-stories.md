# User Stories

## 1. Incoming Scanner

**US-1.1** As a librarian, I want to upload audiobook files through the UI, so that new content is ingested into my library.
- Acceptance Criteria:
  - Drag-and-drop or file picker accepts audio files and archives
  - Upload progress is displayed
  - Files are stored in the configured incoming directory

**US-1.2** As a librarian, I want the system to auto-detect metadata from uploaded files, so that I don't have to enter it manually.
- Acceptance Criteria:
  - Title, author, narrator, and cover art are extracted when available
  - Detected metadata is shown for user confirmation before committing
  - User can edit detected fields before confirming

**US-1.3** As a librarian, I want to reject or delete incorrectly scanned items, so that my library stays clean.
- Acceptance Criteria:
  - Reject button removes the item from the incoming queue
  - Rejected files are moved to a rejected folder or deleted per config
  - Scan can be re-triggered on individual items

## 2. Library Intelligence

**US-2.1** As a listener, I want to see audio quality analysis for my books, so that I can identify low-quality files.
- Acceptance Criteria:
  - Bitrate, sample rate, and codec info are displayed per book
  - Books below a configurable quality threshold are flagged

**US-2.2** As a listener, I want to see gaps in my series collections, so that I know which books I'm missing.
- Acceptance Criteria:
  - Series view highlights missing sequence numbers
  - Missing entries link to search/purchase options when available

**US-2.3** As a listener, I want narrator consistency warnings for series, so that I notice when narrators change unexpectedly.
- Acceptance Criteria:
  - Series with mixed narrators show a warning badge
  - Stats dashboard shows library-wide narrator consistency metrics

## 3. Recommendations

**US-3.1** As a listener, I want personalized book recommendations based on my listening history, so that I discover new content I'll enjoy.
- Acceptance Criteria:
  - Recommendation profile is built from completed and rated books
  - Recommendations update as listening history changes

**US-3.2** As a listener, I want to filter recommendations by language and format preferences, so that results match what I can consume.
- Acceptance Criteria:
  - Language and format filters are available on the recommendations page
  - Preferences persist across sessions

**US-3.3** As a listener, I want recommendations grouped by category, so that I can browse by genre or mood.
- Acceptance Criteria:
  - Recommendations are organized into named categories
  - Each category shows at least 3 suggestions when available

## 4. Social

**US-4.1** As a listener, I want to see an activity feed of what others on my server are listening to, so that I feel connected to the community.
- Acceptance Criteria:
  - Feed shows recent listening activity from other users (respecting privacy settings)
  - Activity items link to the corresponding book

**US-4.2** As a listener, I want to compare my taste with another user, so that I can find shared interests.
- Acceptance Criteria:
  - Taste comparison shows overlap percentage and shared favorites
  - Comparison is available from any user's profile

**US-4.3** As a listener, I want to see community-sourced recommendations, so that I benefit from collective taste.
- Acceptance Criteria:
  - Users can mark a book as "recommended"
  - Community recommendations are ranked by endorsement count

## 5. Agent

**US-5.1** As an admin, I want the Python agent to send heartbeats, so that I know it's running and healthy.
- Acceptance Criteria:
  - Heartbeat is sent at a configurable interval
  - Server UI shows agent status (online/offline) with last-seen timestamp

**US-5.2** As an admin, I want to queue tasks (scan, quality check, clean) for the agent, so that background work is managed centrally.
- Acceptance Criteria:
  - Tasks can be queued via API or UI
  - Task status (pending/running/completed/failed) is visible
  - Agent picks up tasks in priority order

## 6. Audio Restoration

**US-6.1** As a listener, I want to diagnose audio issues in my files, so that I understand what problems exist.
- Acceptance Criteria:
  - Diagnosis reports clipping, noise levels, and silence gaps
  - Results are stored and viewable per book

**US-6.2** As a listener, I want to auto-clean common audio issues, so that my listening experience improves without manual effort.
- Acceptance Criteria:
  - Auto-clean removes excessive silence and reduces noise
  - Original file is preserved; cleaned version is created alongside
  - User can preview before/after a clean operation

## 7. Reviews

**US-7.1** As a listener, I want to see aggregated ratings for books, so that I can gauge quality before listening.
- Acceptance Criteria:
  - Average rating and rating count are displayed on the book detail page
  - Ratings are sourced from local users and optionally external sources

**US-7.2** As a listener, I want to read and write reviews for books, so that I can share and discover opinions.
- Acceptance Criteria:
  - Reviews support text and a star rating
  - Reviews are visible on the book detail page sorted by recency

## 8. LibriVox

**US-8.1** As a listener, I want to search the LibriVox catalog from within the app, so that I can find free public domain audiobooks.
- Acceptance Criteria:
  - Search by title, author, or genre returns LibriVox results
  - Results show title, author, duration, and language

**US-8.2** As a listener, I want to download LibriVox books directly into my library, so that free books are added seamlessly.
- Acceptance Criteria:
  - One-click download adds the book to the library
  - Download progress is shown
  - Metadata from LibriVox is applied automatically

## 9. Delivery

**US-9.1** As a listener, I want to send a book to my Kindle, so that I can read ebook versions on my device.
- Acceptance Criteria:
  - Send-to-Kindle button is available on eligible books
  - Delivery status (sent/failed) is reported to the user

**US-9.2** As a listener, I want to access my library via OPDS, so that third-party reader apps can browse and download content.
- Acceptance Criteria:
  - OPDS feed is available at a stable URL
  - Feed includes all library items with metadata and download links

**US-9.3** As a mobile user, I want to open a book directly in the mobile app via a link, so that I can start listening quickly.
- Acceptance Criteria:
  - Deep links open the correct book in the mobile app
  - Fallback to web player if app is not installed

## 10. Grouping & Conversion

**US-10.1** As a librarian, I want the system to detect related book groups (duplicates, multi-part files), so that my library is organized.
- Acceptance Criteria:
  - Duplicate detection identifies books with matching title+author
  - Multi-part files for the same book are grouped together

**US-10.2** As a librarian, I want to merge duplicate entries, so that each book has a single canonical record.
- Acceptance Criteria:
  - Merge UI lets the user pick which metadata and files to keep
  - Merged items retain listening progress from all sources

**US-10.3** As a listener, I want to convert audiobook formats, so that I can use files on any device.
- Acceptance Criteria:
  - Conversion supports at least MP3, M4B, and OPUS targets
  - Original file is preserved; converted file is added alongside

## 11. Sync

**US-11.1** As a listener, I want the system to detect audiobook/ebook pairs, so that I can switch between reading and listening.
- Acceptance Criteria:
  - Pairs are detected by matching title and author
  - Paired items are linked in the UI

**US-11.2** As a listener, I want chapter-level sync between audio and ebook, so that switching formats resumes at the right place.
- Acceptance Criteria:
  - Switching from audio to ebook opens the corresponding chapter
  - Sync accuracy is within one chapter

## 12. Language Learning

**US-12.1** As a language learner, I want to interleave native and target-language text, so that I can read bilingually.
- Acceptance Criteria:
  - Interleaved view shows alternating paragraphs in each language
  - User selects native and target languages

**US-12.2** As a language learner, I want to interleave audio segments in two languages, so that I can listen bilingually.
- Acceptance Criteria:
  - Audio playback alternates between native and target language segments
  - Segment length is configurable

**US-12.3** As a language learner, I want to preview text/audio alignment before committing, so that I can verify quality.
- Acceptance Criteria:
  - Preview mode shows aligned segments side by side
  - User can adjust alignment before saving

## 13. AI Companion

**US-13.1** As a listener, I want AI-generated recaps of where I left off, so that I can resume a book after a break.
- Acceptance Criteria:
  - Recap summarizes plot up to current listening position
  - Recap avoids spoilers beyond current position

**US-13.2** As a listener, I want to search my library using natural language, so that I can find books without exact titles.
- Acceptance Criteria:
  - Queries like "that mystery set in London" return relevant results
  - Search considers metadata, descriptions, and user notes

**US-13.3** As a listener, I want to chat with an AI about a book I'm reading, so that I can discuss characters, themes, and get translation help.
- Acceptance Criteria:
  - Chat is scoped to the selected book's content
  - Character info and plot questions are answered without spoilers beyond current progress
  - Translation QA explains word choices and idioms when the book is in a foreign language
