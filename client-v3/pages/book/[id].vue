<script setup>
const { get, post } = useApi()
const id = useRoute().params.id

const tab = ref('overview')
const loading = ref(false)

// Overview
const reviews = ref(null)
const convStatus = ref(null)

// AI
const recap = ref(''); const recapLoading = ref(false)
const chatQ = ref(''); const chatA = ref(''); const chatLoading = ref(false)
const charName = ref(''); const charInfo = ref('')

// Tags
const tagPreview = ref(null); const tagApplied = ref(false)

// Summary
const summary = ref(null); const summaryStyle = ref('executive'); const summaryLength = ref('medium')
const audioSummary = ref(null)

// Modernize
const modernPreview = ref(null); const modernStyle = ref('modern literary')
const modernFull = ref(null)

// Send
const kindleEmail = ref(''); const deviceName = ref('')
const mobileLinks = ref(null)

// Podcast
const feedSchedule = ref('daily'); const feedTime = ref('08:00'); const feedStart = ref('')
const feedResult = ref(null)

// Convert
const ttsLang = ref('en'); const converting = ref(false); const convertResult = ref(null)

// OCR
const ocrLang = ref('eng'); const ocrResult = ref(null); const ocrRunning = ref(false)

onMounted(async () => {
  convStatus.value = await get(`/items/${id}/convert-to-audio/status`).catch(() => null)
})

// Overview actions
const loadReviews = async () => { loading.value = true; reviews.value = await get(`/items/${id}/reviews`); loading.value = false }

// AI actions
const getRecap = async () => { recapLoading.value = true; recap.value = (await get(`/ai/recap/${id}`)).recap; recapLoading.value = false }
const askQuestion = async () => { chatLoading.value = true; chatA.value = (await post(`/ai/ask/${id}`, { question: chatQ.value })).answer; chatLoading.value = false }
const lookupChar = async () => { charInfo.value = (await post(`/ai/character/${id}`, { name: charName.value })).answer }

// Tag actions
const generateTags = async () => { tagPreview.value = await post(`/items/${id}/auto-tag`) }
const applyTags = async () => { await post(`/items/${id}/auto-tag/apply`); tagApplied.value = true }

// Summary actions
const genSummary = async () => { loading.value = true; summary.value = await post(`/items/${id}/summary`, { style: summaryStyle.value, length: summaryLength.value }); loading.value = false }
const genAudioSummary = async () => { audioSummary.value = await post(`/items/${id}/summary/audio`, { style: summaryStyle.value }) }

// Modernize actions
const previewModern = async () => { loading.value = true; modernPreview.value = await post(`/items/${id}/modernize/preview`, { style: modernStyle.value }); loading.value = false }
const fullModern = async () => { loading.value = true; modernFull.value = await post(`/items/${id}/modernize`, { style: modernStyle.value }); loading.value = false }

// Send actions
const sendKindle = async () => { await post(`/items/${id}/send-to-kindle`, { email: kindleEmail.value }) }
const sendDevice = async () => { await post(`/items/${id}/send-to-device`, { deviceName: deviceName.value }) }
const loadLinks = async () => { mobileLinks.value = await get(`/items/${id}/mobile-links`) }

// Podcast
const createFeed = async () => { feedResult.value = await post(`/items/${id}/podcast-feed`, { schedule: feedSchedule.value, releaseTime: feedTime.value, startDate: feedStart.value }) }

// Convert to audio
const convertToAudio = async () => { converting.value = true; convertResult.value = await post(`/items/${id}/convert-to-audio`, { language: ttsLang.value }); converting.value = false }

// OCR
const runOcr = async () => { ocrRunning.value = true; ocrResult.value = await post(`/items/${id}/ocr`, { language: ocrLang.value }); ocrRunning.value = false }

// Metadata download
const metadataResults = ref(null); const metadataLoading = ref(false)
const searchMetadata = async () => { metadataLoading.value = true; metadataResults.value = await post(`/items/${id}/metadata-download`); metadataLoading.value = false }
const applyMetadata = async () => { const r = await post(`/items/${id}/metadata-download/apply`); if (r) metadataResults.value = { ...metadataResults.value, applied: r } }

// Format conversion
const convertFormat = ref('epub'); const ebookConvertResult = ref(null)
const convertEbook = async () => { ebookConvertResult.value = await post('/tools/convert', { bookId: id, format: convertFormat.value }) }

const tabs = [
  { id: 'overview', label: '⭐ Overview' },
  { id: 'ai', label: '🤖 AI' },
  { id: 'summary', label: '📝 Summary' },
  { id: 'tags', label: '🏷️ Tags' },
  { id: 'modernize', label: '✨ Modernize' },
  { id: 'convert', label: '🔄 Convert' },
  { id: 'send', label: '📤 Send' },
  { id: 'podcast', label: '🎙️ Podcast' },
]
</script>

<template>
  <div>
    <div class="flex items-center gap-2 mb-4">
      <NuxtLink to="/library" class="text-[#636e72] hover:text-white">← Library</NuxtLink>
      <h1 class="text-xl font-bold">Book Details</h1>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 mb-6 flex-wrap">
      <button v-for="t in tabs" :key="t.id" @click="tab = t.id"
        :class="tab === t.id ? 'bg-[#6c5ce7] text-white' : 'bg-[#2d3436] text-[#636e72] hover:text-white'"
        class="px-3 py-1.5 rounded text-sm transition">{{ t.label }}</button>
    </div>

    <!-- Overview -->
    <div v-if="tab === 'overview'" class="space-y-4">
      <div class="flex gap-2 flex-wrap">
        <button @click="loadReviews" class="bg-abs-accent px-4 py-2 rounded text-sm">Load Reviews</button>
        <button @click="searchMetadata" :disabled="metadataLoading" class="bg-abs-card border border-abs-accent px-4 py-2 rounded text-sm">{{ metadataLoading ? 'Searching...' : '📥 Download Metadata' }}</button>
        <span v-if="convStatus?.canConvert" class="bg-yellow-600/20 text-yellow-400 px-3 py-2 rounded text-sm">📖 Ebook only — can convert to audio</span>
        <span v-if="convStatus?.hasAudio && convStatus?.hasEbook" class="bg-green-600/20 text-green-400 px-3 py-2 rounded text-sm">🎧📖 Both formats</span>
      </div>

      <!-- Metadata download results -->
      <div v-if="metadataResults?.bestMatch" class="bg-abs-card p-4 rounded space-y-2">
        <h3 class="font-medium">📥 Metadata Found ({{ metadataResults.sources?.join(', ') }})</h3>
        <p v-if="metadataResults.bestMatch.title"><strong>Title:</strong> {{ metadataResults.bestMatch.title }}</p>
        <p v-if="metadataResults.bestMatch.author"><strong>Author:</strong> {{ metadataResults.bestMatch.author }}</p>
        <p v-if="metadataResults.bestMatch.isbn"><strong>ISBN:</strong> {{ metadataResults.bestMatch.isbn }}</p>
        <p v-if="metadataResults.bestMatch.publisher"><strong>Publisher:</strong> {{ metadataResults.bestMatch.publisher }}</p>
        <p v-if="metadataResults.bestMatch.genres?.length"><strong>Genres:</strong> {{ metadataResults.bestMatch.genres.join(', ') }}</p>
        <p v-if="metadataResults.bestMatch.description" class="text-sm text-abs-muted">{{ metadataResults.bestMatch.description?.slice(0, 200) }}...</p>
        <img v-if="metadataResults.bestMatch.cover" :src="metadataResults.bestMatch.cover" class="w-24 rounded" />
        <p class="text-xs text-abs-muted">Confidence: {{ metadataResults.bestMatch._confidence }}% from {{ metadataResults.bestMatch._sources?.join(', ') }}</p>
        <button v-if="!metadataResults.applied" @click="applyMetadata" class="bg-green-700 px-4 py-2 rounded text-sm">✅ Apply to Book</button>
        <p v-else class="text-green-400 text-sm">✅ Applied: {{ metadataResults.applied.fields?.join(', ') }}</p>
      </div>

      <!-- Reviews -->
      <div v-if="reviews" class="space-y-3">
        <p class="text-lg">Average: <span class="text-abs-accent font-bold">{{ reviews.avgRating }}/5</span> ({{ reviews.totalRatings }} ratings)</p>
        <div v-for="s in reviews.sources" :key="s.source" class="bg-abs-card p-3 rounded">
          <div class="flex justify-between"><span class="font-medium">{{ s.source }}</span><span>{{ '★'.repeat(Math.round(s.rating)) }}{{ '☆'.repeat(5 - Math.round(s.rating)) }} ({{ s.ratingCount }})</span></div>
          <p v-for="r in (s.reviews || []).slice(0, 2)" :key="r" class="text-sm text-abs-muted mt-1 italic">"{{ r.slice(0, 200) }}"</p>
        </div>
      </div>
    </div>

    <!-- AI -->
    <div v-if="tab === 'ai'" class="space-y-4">
      <div class="bg-[#2d3436] p-4 rounded">
        <h3 class="font-medium mb-2">📖 What happened so far?</h3>
        <button @click="getRecap" :disabled="recapLoading" class="bg-[#6c5ce7] px-4 py-2 rounded text-sm">{{ recapLoading ? 'Thinking...' : 'Get Recap' }}</button>
        <p v-if="recap" class="mt-3 whitespace-pre-wrap text-sm">{{ recap }}</p>
      </div>
      <div class="bg-[#2d3436] p-4 rounded">
        <h3 class="font-medium mb-2">💬 Ask about this book</h3>
        <div class="flex gap-2"><input v-model="chatQ" placeholder="Why did the character...?" class="flex-1 bg-[#1e272e] px-3 py-2 rounded text-sm" @keyup.enter="askQuestion" /><button @click="askQuestion" :disabled="chatLoading" class="bg-[#6c5ce7] px-4 py-2 rounded text-sm">Ask</button></div>
        <p v-if="chatA" class="mt-3 text-sm whitespace-pre-wrap">{{ chatA }}</p>
      </div>
      <div class="bg-[#2d3436] p-4 rounded">
        <h3 class="font-medium mb-2">👤 Character lookup</h3>
        <div class="flex gap-2"><input v-model="charName" placeholder="Character name..." class="flex-1 bg-[#1e272e] px-3 py-2 rounded text-sm" /><button @click="lookupChar" class="bg-[#6c5ce7] px-4 py-2 rounded text-sm">Lookup</button></div>
        <p v-if="charInfo" class="mt-3 text-sm whitespace-pre-wrap">{{ charInfo }}</p>
      </div>
    </div>

    <!-- Summary -->
    <div v-if="tab === 'summary'" class="space-y-4">
      <div class="flex gap-3 items-center">
        <select v-model="summaryStyle" class="bg-[#2d3436] px-3 py-2 rounded text-sm"><option value="executive">Executive</option><option value="casual">Casual (Blinkist)</option><option value="academic">Academic</option></select>
        <select v-model="summaryLength" class="bg-[#2d3436] px-3 py-2 rounded text-sm"><option value="short">Short (5 min)</option><option value="medium">Medium (10 min)</option><option value="long">Long (15 min)</option></select>
        <button @click="genSummary" :disabled="loading" class="bg-[#6c5ce7] px-4 py-2 rounded text-sm">{{ loading ? 'Generating...' : 'Generate Summary' }}</button>
        <button @click="genAudioSummary" class="bg-[#2d3436] border border-[#6c5ce7] px-4 py-2 rounded text-sm">🔊 Audio Version</button>
      </div>
      <div v-if="summary" class="bg-[#2d3436] p-4 rounded space-y-3">
        <p class="text-lg font-bold">{{ summary.oneLiner }}</p>
        <p class="text-[#6c5ce7] font-medium">💡 {{ summary.keyInsight }}</p>
        <p class="whitespace-pre-wrap text-sm">{{ summary.summary }}</p>
        <div v-if="summary.keyPoints?.length"><h4 class="font-medium mt-2">Key Points:</h4><ul class="list-disc pl-5 text-sm"><li v-for="p in summary.keyPoints" :key="p">{{ p }}</li></ul></div>
        <div v-if="summary.quotes?.length"><h4 class="font-medium mt-2">Notable Quotes:</h4><p v-for="q in summary.quotes" :key="q" class="text-sm italic text-[#636e72]">"{{ q }}"</p></div>
      </div>
      <div v-if="audioSummary" class="bg-[#2d3436] p-3 rounded"><p class="text-sm">🔊 Audio summary saved: {{ audioSummary.audioPath }}</p></div>
    </div>

    <!-- Tags -->
    <div v-if="tab === 'tags'" class="space-y-4">
      <button @click="generateTags" class="bg-[#6c5ce7] px-4 py-2 rounded text-sm">🏷️ Generate Tags</button>
      <div v-if="tagPreview" class="bg-[#2d3436] p-4 rounded space-y-2">
        <div class="flex flex-wrap gap-2"><span v-for="g in tagPreview.genres" :key="g" class="bg-[#6c5ce7]/20 text-[#6c5ce7] px-2 py-1 rounded text-xs">{{ g }}</span></div>
        <p v-if="tagPreview.mood"><strong>Mood:</strong> {{ tagPreview.mood?.join(', ') }}</p>
        <p v-if="tagPreview.themes"><strong>Themes:</strong> {{ tagPreview.themes?.join(', ') }}</p>
        <p v-if="tagPreview.pace"><strong>Pace:</strong> {{ tagPreview.pace }}</p>
        <p v-if="tagPreview.contentWarnings?.length"><strong>⚠️ Content:</strong> {{ tagPreview.contentWarnings.join(', ') }}</p>
        <p v-if="tagPreview.oneLiner" class="italic">"{{ tagPreview.oneLiner }}"</p>
        <p v-if="tagPreview.similar"><strong>Similar:</strong> {{ tagPreview.similar?.join(', ') }}</p>
        <button v-if="!tagApplied" @click="applyTags" class="bg-green-700 px-4 py-2 rounded text-sm mt-2">✅ Apply Tags</button>
        <p v-else class="text-green-400 text-sm">✅ Tags applied!</p>
      </div>
    </div>

    <!-- Modernize -->
    <div v-if="tab === 'modernize'" class="space-y-4">
      <div class="flex gap-3 items-center">
        <select v-model="modernStyle" class="bg-[#2d3436] px-3 py-2 rounded text-sm"><option value="modern literary">Modern Literary</option><option value="casual readable">Casual Readable</option><option value="young adult">Young Adult</option><option value="simplified">Simplified</option></select>
        <button @click="previewModern" :disabled="loading" class="bg-[#6c5ce7] px-4 py-2 rounded text-sm">Preview Chapter 1</button>
        <button @click="fullModern" :disabled="loading" class="bg-[#2d3436] border border-[#6c5ce7] px-4 py-2 rounded text-sm">Modernize Full Book</button>
      </div>
      <div v-if="modernPreview" class="bg-[#2d3436] p-4 rounded">
        <h4 class="font-medium mb-2">Original:</h4>
        <p class="text-sm text-[#636e72] mb-4">{{ modernPreview.original?.slice(0, 500) }}...</p>
        <h4 class="font-medium mb-2">Modernized:</h4>
        <p class="text-sm">{{ modernPreview.modernized?.slice(0, 500) }}...</p>
      </div>
      <div v-if="modernFull" class="bg-[#2d3436] p-3 rounded"><p class="text-sm text-green-400">✅ Modernized version saved ({{ modernFull.chunksProcessed }} chunks)</p></div>
    </div>

    <!-- Convert -->
    <div v-if="tab === 'convert'" class="space-y-4">
      <!-- Ebook format conversion (Calibre) -->
      <div v-if="convStatus?.hasEbook" class="bg-abs-card p-4 rounded">
        <h3 class="font-medium mb-3">📄 Convert Ebook Format</h3>
        <p class="text-sm text-abs-muted mb-3">Convert between ebook formats. Requires Calibre installed on server.</p>
        <div class="flex gap-3 items-center flex-wrap">
          <select v-model="convertFormat" class="bg-abs-bg px-3 py-2 rounded text-sm">
            <option value="epub">EPUB</option><option value="mobi">MOBI (Kindle legacy)</option>
            <option value="azw3">AZW3 (Kindle modern)</option><option value="pdf">PDF</option>
            <option value="txt">Plain Text</option><option value="html">HTML</option>
            <option value="docx">DOCX</option><option value="fb2">FB2</option>
            <option value="rtf">RTF</option><option value="lit">LIT</option>
          </select>
          <button @click="convertEbook" class="bg-abs-accent px-4 py-2 rounded text-sm">Convert</button>
        </div>
        <div v-if="ebookConvertResult" class="mt-3 text-sm text-green-400">✅ Converted to {{ ebookConvertResult.format }}</div>
      </div>

      <!-- Ebook to audiobook (TTS) -->
      <div v-if="convStatus?.canConvert" class="bg-abs-card p-4 rounded">
        <h3 class="font-medium mb-3">📖 → 🎧 Convert to Audiobook (TTS)</h3>
        <p class="text-sm text-abs-muted mb-3">Generate a TTS audiobook. Requires Piper TTS.</p>
        <div class="flex gap-3 items-center">
          <select v-model="ttsLang" class="bg-abs-bg px-3 py-2 rounded text-sm">
            <option value="en">English</option><option value="fr">French</option><option value="de">German</option>
            <option value="es">Spanish</option><option value="it">Italian</option><option value="pt">Portuguese</option>
            <option value="nl">Dutch</option><option value="ru">Russian</option>
          </select>
          <button @click="convertToAudio" :disabled="converting" class="bg-abs-accent px-4 py-2 rounded text-sm">{{ converting ? 'Converting...' : '🎧 Convert' }}</button>
        </div>
        <div v-if="convertResult" class="mt-3 text-sm text-green-400">✅ {{ convertResult.successfulChapters }}/{{ convertResult.totalChapters }} chapters ({{ Math.round(convertResult.totalDuration / 60) }} min)</div>
      </div>

      <!-- OCR -->
      <div v-if="convStatus?.hasEbook" class="bg-abs-card p-4 rounded">
        <h3 class="font-medium mb-3">🔍 OCR (Scanned PDF)</h3>
        <p class="text-sm text-abs-muted mb-3">Make a scanned PDF searchable.</p>
        <div class="flex gap-3 items-center">
          <select v-model="ocrLang" class="bg-abs-bg px-3 py-2 rounded text-sm">
            <option value="eng">English</option><option value="fra">French</option><option value="deu">German</option>
            <option value="spa">Spanish</option><option value="ita">Italian</option><option value="nld">Dutch</option>
          </select>
          <button @click="runOcr" :disabled="ocrRunning" class="bg-abs-accent px-4 py-2 rounded text-sm">{{ ocrRunning ? 'Processing...' : '🔍 Run OCR' }}</button>
        </div>
        <div v-if="ocrResult" class="mt-3 text-sm text-green-400">✅ OCR complete</div>
      </div>

      <div v-if="!convStatus?.hasEbook && !convStatus?.hasAudio" class="bg-abs-card p-3 rounded text-sm text-abs-muted">No files to convert.</div>
      <div v-if="convStatus?.hasAudio && !convStatus?.hasEbook" class="bg-abs-card p-3 rounded text-sm text-abs-muted">This book only has audio files. Upload an ebook to enable conversion.</div>
    </div>

    <!-- Send -->
    <div v-if="tab === 'send'" class="space-y-4">
      <div class="bg-[#2d3436] p-4 rounded">
        <h3 class="font-medium mb-3">📱 Send to Kindle</h3>
        <div class="flex gap-2"><input v-model="kindleEmail" placeholder="you@kindle.com" class="flex-1 bg-[#1e272e] px-3 py-2 rounded text-sm" /><button @click="sendKindle" class="bg-[#6c5ce7] px-4 py-2 rounded text-sm">Send</button></div>
      </div>
      <div class="bg-[#2d3436] p-4 rounded">
        <h3 class="font-medium mb-3">📲 Send to Device</h3>
        <div class="flex gap-2"><input v-model="deviceName" placeholder="Device name" class="flex-1 bg-[#1e272e] px-3 py-2 rounded text-sm" /><button @click="sendDevice" class="bg-[#6c5ce7] px-4 py-2 rounded text-sm">Send</button></div>
      </div>
      <div class="bg-[#2d3436] p-4 rounded">
        <h3 class="font-medium mb-3">🔗 Mobile Links</h3>
        <button @click="loadLinks" class="bg-[#6c5ce7] px-4 py-2 rounded text-sm mb-2">Get Links</button>
        <div v-if="mobileLinks" class="text-sm space-y-1">
          <p v-for="(url, key) in mobileLinks" :key="key"><span class="text-[#636e72]">{{ key }}:</span> <a :href="url" class="text-[#6c5ce7] underline">{{ url }}</a></p>
        </div>
      </div>
    </div>

    <!-- Podcast -->
    <div v-if="tab === 'podcast'" class="space-y-4">
      <div class="bg-[#2d3436] p-4 rounded">
        <h3 class="font-medium mb-3">🎙️ Publish as Podcast (drip feed)</h3>
        <p class="text-sm text-[#636e72] mb-3">Release one chapter per day in any podcast app.</p>
        <div class="flex gap-3 items-center flex-wrap">
          <select v-model="feedSchedule" class="bg-[#1e272e] px-3 py-2 rounded text-sm"><option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option></select>
          <input v-model="feedTime" type="time" class="bg-[#1e272e] px-3 py-2 rounded text-sm" />
          <input v-model="feedStart" type="date" class="bg-[#1e272e] px-3 py-2 rounded text-sm" />
          <button @click="createFeed" class="bg-[#6c5ce7] px-4 py-2 rounded text-sm">Create Feed</button>
        </div>
        <div v-if="feedResult" class="mt-3 bg-[#1e272e] p-3 rounded">
          <p class="text-sm font-medium">Feed URL (copy to podcast app):</p>
          <code class="text-[#6c5ce7] text-sm break-all">{{ feedResult.feedUrl }}</code>
          <p class="text-xs text-[#636e72] mt-1">{{ feedResult.totalEpisodes }} episodes, {{ feedResult.schedule }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
