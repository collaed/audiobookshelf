<script setup>
const api = useApi()

const tab = ref('foryou')
const recommendations = ref({})
const searchQuery = ref('')
const librivoxResults = ref([])
const reviewBookId = ref('')
const reviews = ref(null)
const loading = ref(false)

const sections = [
  { key: 'dnaMatch', label: 'DNA Match' },
  { key: 'authorsYouLove', label: 'Authors You Love' },
  { key: 'narratorsYouLove', label: 'Narrators You Love' },
  { key: 'completeSeries', label: 'Complete Series' },
  { key: 'hiddenGems', label: 'Hidden Gems' }
]

onMounted(async () => {
  loading.value = true
  try {
    recommendations.value = await api.get('/recommendations/all') || {}
  } finally {
    loading.value = false
  }
})

async function searchLibrivox() {
  if (!searchQuery.value.trim()) return
  loading.value = true
  try {
    librivoxResults.value = await api.get(`/librivox/search?q=${encodeURIComponent(searchQuery.value)}`) || []
  } finally {
    loading.value = false
  }
}

async function downloadLibrivox(id) {
  await api.post(`/librivox/${id}/download`)
}

async function fetchReviews() {
  if (!reviewBookId.value.trim()) return
  loading.value = true
  try {
    reviews.value = await api.get(`/items/${reviewBookId.value}/reviews`)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#1e272e] p-6 text-[#dfe6e9]">
    <h1 class="text-2xl font-bold mb-4">Discover</h1>

    <!-- Tabs -->
    <div class="flex gap-1 mb-6 border-b border-[#636e72]/30">
      <button v-for="t in [{ id: 'foryou', label: 'For You' }, { id: 'librivox', label: 'LibriVox' }, { id: 'reviews', label: 'Reviews' }]"
        :key="t.id" class="px-4 py-2 -mb-px text-sm font-medium border-b-2 transition-colors"
        :class="tab === t.id ? 'border-[#6c5ce7] text-white' : 'border-transparent text-[#636e72] hover:text-[#dfe6e9]'"
        @click="tab = t.id">{{ t.label }}</button>
    </div>

    <!-- For You -->
    <div v-if="tab === 'foryou'">
      <div v-if="loading" class="text-[#636e72]">Loading…</div>
      <div v-else v-for="s in sections" :key="s.key" class="mb-6">
        <h2 class="text-lg font-semibold mb-2">{{ s.label }}</h2>
        <div class="flex gap-3 overflow-x-auto pb-2">
          <div v-for="book in (recommendations[s.key] || [])" :key="book.id"
            class="flex-shrink-0 w-44 rounded-lg bg-[#2d3436] p-3">
            <p class="font-medium text-sm truncate">{{ book.title }}</p>
            <p class="text-xs text-[#636e72] truncate">{{ book.author }}</p>
            <p v-if="book.score != null" class="text-xs text-[#6c5ce7] mt-1">{{ Math.round(book.score * 100) }}%</p>
          </div>
          <p v-if="!(recommendations[s.key] || []).length" class="text-[#636e72] text-sm">No recommendations yet</p>
        </div>
      </div>
    </div>

    <!-- LibriVox -->
    <div v-if="tab === 'librivox'">
      <div class="flex gap-2 mb-4">
        <input v-model="searchQuery" placeholder="Search LibriVox…" @keyup.enter="searchLibrivox"
          class="flex-1 rounded bg-[#2d3436] px-3 py-2 text-[#dfe6e9] placeholder-[#636e72] outline-none focus:ring-1 focus:ring-[#6c5ce7]" />
        <button class="rounded px-4 py-2 bg-[#6c5ce7] text-white hover:opacity-90" @click="searchLibrivox">Search</button>
      </div>
      <div v-if="loading" class="text-[#636e72]">Searching…</div>
      <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div v-for="r in librivoxResults" :key="r.id" class="rounded-lg bg-[#2d3436] p-4">
          <p class="font-semibold truncate">{{ r.title }}</p>
          <p class="text-sm text-[#636e72]">{{ r.author }}</p>
          <p class="text-xs text-[#636e72] mt-1">{{ r.duration }} · {{ r.language }}</p>
          <button class="mt-2 rounded px-3 py-1.5 bg-[#6c5ce7] text-white text-sm hover:opacity-90" @click="downloadLibrivox(r.id)">Download</button>
        </div>
      </div>
      <p v-if="!loading && !librivoxResults.length" class="text-[#636e72]">Search for free audiobooks on LibriVox</p>
    </div>

    <!-- Reviews -->
    <div v-if="tab === 'reviews'">
      <div class="flex gap-2 mb-4">
        <input v-model="reviewBookId" placeholder="Enter book ID…" @keyup.enter="fetchReviews"
          class="flex-1 rounded bg-[#2d3436] px-3 py-2 text-[#dfe6e9] placeholder-[#636e72] outline-none focus:ring-1 focus:ring-[#6c5ce7]" />
        <button class="rounded px-4 py-2 bg-[#6c5ce7] text-white hover:opacity-90" @click="fetchReviews">Lookup</button>
      </div>
      <div v-if="loading" class="text-[#636e72]">Loading…</div>
      <div v-else-if="reviews" class="space-y-4">
        <div v-for="(src, key) in reviews.sources" :key="key" class="rounded-lg bg-[#2d3436] p-4">
          <h3 class="font-semibold capitalize">{{ key }}</h3>
          <p class="text-sm">{{ '★'.repeat(Math.round(src.rating || 0)) }}{{ '☆'.repeat(5 - Math.round(src.rating || 0)) }} <span class="text-[#636e72]">({{ src.count }} ratings)</span></p>
          <p v-if="src.excerpt" class="text-sm text-[#636e72] mt-1 italic">"{{ src.excerpt }}"</p>
        </div>
      </div>
    </div>
  </div>
</template>
