# Airouter Integration Requirements for Audiobookshelf

## Context

Audiobookshelf needs an LLM backend for: book recaps, smart search, book chat (no spoilers), character tracking, and translation quality checking. Rather than bundling a toy LLM client, we integrate with airouter which already handles 12+ providers, routing, fallbacks, caching, and cost optimization.

## Deployment Models

### Model A: Shared airouter (your setup)
- Your private airouter instance at ecb.pm serves your audiobookshelf
- Other users of your ABS instance don't get AI features (or you allow it)

### Model B: Self-hosted airouter (other users)
- Users run their own airouter alongside audiobookshelf in Docker
- Needs: airouter Docker image published, docker-compose example

### Model C: Direct LLM (no airouter)
- Users point ABS directly at Ollama, OpenAI, or any OpenAI-compatible API
- Fallback for users who don't want to run airouter

ABS should support all three via a settings page.

---

## Requirements for Airouter

### R1: HTTP API endpoint for audiobookshelf
Airouter needs a simple POST endpoint that ABS can call:

```
POST /api/v1/chat
Content-Type: application/json
Authorization: Bearer <token>  (optional, for multi-user)

{
  "messages": [
    {"role": "system", "content": "You are a reading companion..."},
    {"role": "user", "content": "What happened so far in this book?"}
  ],
  "max_tokens": 500,
  "task_hint": "analysis",       // optional: helps routing
  "prefer_free": true,           // optional: cost control
  "stream": false                // optional: streaming support later
}

Response:
{
  "content": "Here's what happened...",
  "provider": "groq",
  "model": "llama-3.3-70b",
  "input_tokens": 320,
  "output_tokens": 180,
  "cost": 0.0,
  "cached": false
}
```

**Status**: airouter's web.py already has `/ask` and `/api/ask`. This may just need a thin wrapper or alias to match the OpenAI-compatible chat format.

### R2: OpenAI-compatible chat/completions endpoint
So ABS (and any other client) can treat airouter as a drop-in OpenAI proxy:

```
POST /v1/chat/completions
```

Same format as OpenAI's API. This lets ABS use the same code path for airouter, Ollama, and OpenAI — they all speak the same protocol.

### R3: API key / token authentication
For multi-user or public-facing deployments:
- Simple bearer token auth (can be a static token from env var)
- Or: no auth when running on localhost/Docker internal network

### R4: Ollama backend
Add Ollama as a backend in airouter's `_BACKENDS` dict:

```python
async def _call_ollama(provider: LLMProvider, prompt: str, max_tokens: int, system: str | None = None) -> LLMResponse:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key="ollama", base_url=provider.api_key or "http://localhost:11434/v1")
    # Ollama exposes an OpenAI-compatible API at /v1
    ...
```

And register it in `get_providers()` with:
```python
LLMProvider(
    name="Ollama (local)",
    model_id="llama3.2",  # or auto-detect from /api/tags
    provider="ollama",
    tier=Tier.FREE,
    context_window=128000,
    strengths=[TaskType.GENERAL, TaskType.CODE, TaskType.ANALYSIS, TaskType.CREATIVE],
    env_key="OLLAMA_URL",  # default http://localhost:11434
)
```

### R5: Health/status endpoint
ABS needs to check if airouter is reachable and what providers are available:

```
GET /api/v1/status

Response:
{
  "available": true,
  "providers": [
    {"name": "Groq", "model": "llama-3.3-70b", "tier": "free", "available": true},
    {"name": "Ollama", "model": "llama3.2", "tier": "free", "available": true},
    ...
  ],
  "total_available": 5,
  "free_available": 3
}
```

### R6: Docker image
Publish airouter as a Docker image so other users can run it:

```yaml
# In audiobookshelf's docker-compose.yml
services:
  airouter:
    image: ghcr.io/collaed/airouter:latest  # or build from source
    environment:
      - GROQ_API_KEY=...        # optional
      - OPENAI_API_KEY=...      # optional
      - OLLAMA_URL=http://ollama:11434  # optional
    networks:
      - web

  ollama:  # optional, for free local LLM
    image: ollama/ollama
    volumes:
      - ollama-data:/root/.ollama
    networks:
      - web
```

---

## Requirements for Audiobookshelf (my side)

### A1: LLM settings page
In ABS admin settings, add an "AI / LLM" section:

```
LLM Provider: [dropdown]
  - Airouter (recommended)
  - Ollama (local)
  - OpenAI
  - OpenAI-compatible (custom URL)
  - Disabled

Airouter URL: [text field]  (default: http://airouter:8000)
Airouter Token: [text field] (optional)

Ollama URL: [text field]    (default: http://localhost:11434)
Ollama Model: [text field]  (default: llama3.2)

OpenAI API Key: [text field]
OpenAI Model: [text field]  (default: gpt-4o-mini)

Custom URL: [text field]
Custom API Key: [text field]
Custom Model: [text field]

[Test Connection]
```

### A2: Rewrite LlmProvider.js
Replace current implementation with a unified client that speaks OpenAI chat/completions format to any backend:

```js
// All backends speak the same protocol:
// POST {baseUrl}/v1/chat/completions (OpenAI, Ollama, airouter with R2)
// POST {baseUrl}/api/v1/chat (airouter native)
```

### A3: Graceful degradation
When no LLM is configured or available:
- AI features show "Configure AI in Settings" instead of errors
- All non-AI features work normally
- Status endpoint reports `{ aiAvailable: false }`

---

## Priority Order

1. **R2** (OpenAI-compatible endpoint in airouter) — unlocks everything
2. **R4** (Ollama backend in airouter) — free local LLM
3. **R5** (Status endpoint) — ABS can check availability
4. **R3** (Token auth) — needed for non-localhost deployments
5. **R6** (Docker image) — for other users
6. **R1** (Native chat endpoint) — nice to have, R2 covers it

Once R2 is done, ABS can talk to airouter using the exact same code it uses for Ollama and OpenAI. That's the key insight — OpenAI's chat/completions format is the universal protocol.
