<script setup>
const { get, isLoggedIn } = useApi()

const libraryId = ref('')
const libraries = ref([])
const items = ref([])
const filter = ref('all')
const loading = ref(true)
const search = ref('')

onMounted(async () => {
  if (!isLoggedIn()) { loading.value = false; return }
  try {
    const resp = await get('/libraries')
    libraries.value = resp?.libraries || (Array.isArray(resp) ? resp : [])
    if (libraries.value.length) {
      libraryId.value = libraries.value[0].id
      await loadItems()
    }
  } finally { loading.value = false }
})

async function loadItems() {
  if (!libraryId.value) return
  loading.value = true
  try {
    const resp = await get(`/libraries/${libraryId.value}/items?limit=100&minified=1`)
    items.value = resp?.results || (Array.isArray(resp) ? resp : [])
  } finally { loading.value = false }
}

const filtered = computed(() => {
  let list = items.value
  if (filter.value === 'audiobook') list = list.filter(i => i.media?.numAudioFiles > 0)
  else if (filter.value === 'ebook') list = list.filter(i => i.media?.ebookFormat || i.media?.ebookFile)
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(i => {
      const t = (i.media?.metadata?.title || '').toLowerCase()
      const a = (i.media?.metadata?.authorName || '').toLowerCase()
      return t.includes(q) || a.includes(q)
    })
  }
  return list
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
      <h1 class="text-2xl font-bold">Library</h1>
      <div class="flex items-center gap-3 flex-wrap">
        <select v-if="libraries.length" v-model="libraryId" @change="loadItems"
          class="bg-abs-card text-abs-text px-3 py-2 rounded text-sm border border-abs-muted">
          <option v-for="lib in libraries" :key="lib.id" :value="lib.id">{{ lib.name }}</option>
        </select>
        <div class="flex bg-abs-card rounded overflow-hidden text-sm">
          <button v-for="f in [{v:'all',l:'All'},{v:'audiobook',l:'🎧 Audio'},{v:'ebook',l:'📖 Ebook'}]" :key="f.v"
            @click="filter = f.v"
            :class="filter === f.v ? 'bg-abs-accent text-white' : 'text-abs-muted hover:text-white'"
            class="px-3 py-2 transition">{{ f.l }}</button>
        </div>
        <input v-model="search" placeholder="Search..." class="bg-abs-card text-abs-text px-3 py-2 rounded text-sm border border-abs-muted w-48" />
      </div>
    </div>

    <p class="text-sm text-abs-muted mb-4">{{ filtered.length }} items{{ filter !== 'all' ? ` of ${items.length} total` : '' }}</p>

    <div v-if="loading" class="text-center py-12 text-abs-muted">Loading...</div>
    <div v-else-if="!isLoggedIn()" class="text-center py-12">
      <p class="text-abs-muted mb-2">Log in first</p>
      <a href="/login" class="bg-abs-accent px-4 py-2 rounded text-sm">Go to Login</a>
    </div>
    <div v-else-if="!filtered.length" class="text-center py-12 text-abs-muted">No {{ filter === 'all' ? 'items' : filter + 's' }} found</div>

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      <NuxtLink v-for="item in filtered" :key="item.id" :to="`/book/${item.id}`"
        class="bg-abs-card rounded-lg overflow-hidden hover:ring-2 hover:ring-abs-accent transition group">
        <div class="aspect-[2/3] bg-abs-bg flex items-center justify-center overflow-hidden">
          <img v-if="item.media?.coverPath" :src="`/api/items/${item.id}/cover?width=200`"
            class="w-full h-full object-cover group-hover:scale-105 transition" />
          <span v-else class="text-3xl">📚</span>
        </div>
        <div class="p-2">
          <p class="text-sm font-medium truncate">{{ item.media?.metadata?.title || 'Untitled' }}</p>
          <p class="text-xs text-abs-muted truncate">{{ item.media?.metadata?.authorName || '' }}</p>
          <div class="flex gap-1 mt-1">
            <span v-if="item.media?.numAudioFiles > 0" class="text-xs bg-abs-accent/20 text-abs-accent px-1.5 py-0.5 rounded">🎧</span>
            <span v-if="item.media?.ebookFormat" class="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">📖</span>
          </div>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
