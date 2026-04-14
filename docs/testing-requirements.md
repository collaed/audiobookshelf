# Testing Requirements

## Test Stack

| Layer | Framework | Scope |
|-------|-----------|-------|
| Unit | mocha + chai + sinon | Whitebox logic, services, utilities |
| Integration | mocha + chai + supertest | API endpoints, DB interactions |
| E2E | Playwright | Full user workflows in browser |
| Agent | pytest | Python agent tasks, heartbeat, queue |

---

## 1. Incoming Scanner

| What to Test | Type | Priority |
|---|---|---|
| File upload validation (type, size limits) | Unit | P0 |
| Metadata extraction from audio tags | Unit | P0 |
| Upload endpoint accepts files and returns incoming item | Integration | P0 |
| Confirm/reject incoming item endpoints | Integration | P0 |
| Full upload → detect → confirm flow in UI | E2E | P1 |
| Re-scan individual item | Integration | P1 |

## 2. Library Intelligence

| What to Test | Type | Priority |
|---|---|---|
| Quality analysis scoring logic | Unit | P0 |
| Series gap detection algorithm | Unit | P0 |
| Narrator consistency check logic | Unit | P1 |
| Quality analysis API endpoint | Integration | P1 |
| Series gaps visible in series view | E2E | P2 |
| Stats dashboard renders correctly | E2E | P2 |

## 3. Recommendations

| What to Test | Type | Priority |
|---|---|---|
| Profile building from listening history | Unit | P0 |
| Category grouping logic | Unit | P1 |
| Language/format filtering | Unit | P1 |
| Recommendations API returns filtered results | Integration | P1 |
| Recommendations page displays grouped results | E2E | P2 |

## 4. Social

| What to Test | Type | Priority |
|---|---|---|
| Activity feed query respects privacy settings | Unit | P0 |
| Taste comparison overlap calculation | Unit | P1 |
| Activity feed API endpoint | Integration | P1 |
| Community recommendation ranking | Integration | P1 |
| Activity feed renders in UI | E2E | P2 |

## 5. Agent

| What to Test | Type | Priority |
|---|---|---|
| Heartbeat send/receive interval | Agent (pytest) | P0 |
| Task queue pick-up and ordering | Agent (pytest) | P0 |
| Task status transitions (pending→running→completed/failed) | Agent (pytest) | P0 |
| Agent status API endpoint | Integration | P0 |
| Task queue API (create, list, cancel) | Integration | P1 |
| Agent status indicator in admin UI | E2E | P2 |

## 6. Audio Restoration

| What to Test | Type | Priority |
|---|---|---|
| Diagnosis detection (clipping, noise, silence) | Unit | P0 |
| Clean operation preserves original file | Unit | P0 |
| Diagnosis API endpoint | Integration | P1 |
| Auto-clean API endpoint | Integration | P1 |
| Preview before/after clean in UI | E2E | P2 |

## 7. Reviews

| What to Test | Type | Priority |
|---|---|---|
| Rating aggregation calculation | Unit | P0 |
| Review CRUD API endpoints | Integration | P0 |
| Reviews display on book detail page | E2E | P1 |

## 8. LibriVox

| What to Test | Type | Priority |
|---|---|---|
| LibriVox API response parsing | Unit | P0 |
| Search query construction | Unit | P1 |
| Search endpoint returns formatted results | Integration | P1 |
| Download endpoint triggers library ingest | Integration | P1 |
| Search → download flow in UI | E2E | P2 |

## 9. Delivery

| What to Test | Type | Priority |
|---|---|---|
| Send-to-Kindle email formatting | Unit | P0 |
| OPDS feed XML generation | Unit | P0 |
| Deep link URL construction | Unit | P1 |
| Send-to-Kindle API endpoint | Integration | P1 |
| OPDS feed endpoint returns valid XML | Integration | P0 |
| Send-to-device flow in UI | E2E | P2 |

## 10. Grouping & Conversion

| What to Test | Type | Priority |
|---|---|---|
| Duplicate detection matching logic | Unit | P0 |
| Multi-part file grouping | Unit | P0 |
| Merge logic (metadata + progress reconciliation) | Unit | P0 |
| Format conversion output validation | Unit | P1 |
| Merge API endpoint | Integration | P1 |
| Conversion API endpoint | Integration | P1 |
| Duplicate detection UI flow | E2E | P2 |

## 11. Sync

| What to Test | Type | Priority |
|---|---|---|
| Audio/ebook pair detection by title+author | Unit | P0 |
| Chapter position mapping logic | Unit | P0 |
| Pair detection API endpoint | Integration | P1 |
| Chapter sync API endpoint | Integration | P1 |
| Switch format resumes at correct chapter in UI | E2E | P2 |

## 12. Language Learning

| What to Test | Type | Priority |
|---|---|---|
| Text interleaving algorithm | Unit | P0 |
| Audio segment interleaving logic | Unit | P0 |
| Alignment preview generation | Unit | P1 |
| Interleave API endpoints | Integration | P1 |
| Bilingual playback in UI | E2E | P2 |

## 13. AI Companion

| What to Test | Type | Priority |
|---|---|---|
| Recap generation respects current position (no spoilers) | Unit | P0 |
| Smart search query parsing | Unit | P0 |
| Book chat context scoping | Unit | P1 |
| Character info extraction | Unit | P1 |
| Translation QA response formatting | Unit | P2 |
| Recap API endpoint | Integration | P1 |
| Smart search API endpoint | Integration | P1 |
| Chat and recap UI flow | E2E | P2 |

---

## Priority Summary

| Priority | Count | Description |
|---|---|---|
| P0 | ~30 | Core logic and critical API paths — must pass before merge |
| P1 | ~25 | Important coverage — should pass before release |
| P2 | ~15 | UI/E2E polish — nice to have, run nightly |
