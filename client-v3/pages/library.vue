<script setup>
const { get } = useApi()
const route = useRoute()

const libraryId = ref(route.query.library || '')
const libraries = ref([])
const items = ref([])
const filter = ref('all') // all | audiobook | ebook
const loading = ref(true)
const search = ref('')

onMounted(async () => {
  try {
    const resp = await get('/libraries')
    libraries.value = resp.libraries || resp || []
    if (libraries.value.length && !libraryId.value) {
      libraryId.value = libraries.value[0].id
    }
    if (libraryId.value) await loadItems()
  } finally {
    loading.value = false
  }
})

async function loadItems() {
  loading.value = true
  try {
    const resp = await get(`/libraries/${libraryId.value}/items?limit=100&minified=1`)
    items.value = resp.results || resp || []
  } finally {
    loading.value = false
  }
}

const filtered = computed(() => {
  let list = items.value
  if (filter.value === 'audiobook') {
    list = list.filter(i => i.media?.numAudioFiles > 0 || i.media?.audioFiles?.length > 0)
  } else if (filter.value === 'ebook') {
    list = list.filter(i => i.media?.ebookFormat || i.media?.ebookFile)
  }
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(i => {
      const title = (i.media?.metadata?.title || '').toLowerCase()
      const author = (i.media?.metadata?.authorName || '').toLowerCase()
      return title.includes(q) || author.includes(q)
    })
  }
  return list
})

function watchLibrary() {
  loadItems()
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Library</h1>
      <div class="flex items-center gap-3">
        <!-- Library selector -->
        <select v-model="libraryId" @change="watchLibrary"
          class="bg-[#2d3436] text-[#dfe6e9] px-3 py-2 rounded text-sm border border-[#636e72]">
          <option v-for="lib in libraries" :key="lib.id" :value="lib.id">{{ lib.name }}</option>
        </select>

        <!-- Format filter -->
        <div class="flex bg-[#2d3436] rounded overflow-hidden text-sm">
          <button @click="filter = 'all'"
            :class="filter === 'all' ? 'bg-[#6c5ce7] text-white' : 'text-[#636e72] hover:text-white'"
            class="px-3 py-2 transition">All</button>
          <button @click="filter = 'audiobook'"
            :class="filter === 'audiobook' ? 'bg-[#6c5ce7] text-white' : 'text-[#636e72] hover:text-white'"
            class="px-3 py-2 transition">🎧 Audio</button>
          <button @click="filter = 'ebook'"
            :class="filter === 'ebook' ? 'bg-[#6c5ce7] text-white' : 'text-[#636e72] hover:text-white'"
            class="px-3 py-2 transition">📖 Ebook</button>
        </div>

        <!-- Search -->
        <input v-model="search" placeholder="Search..."
          class="bg-[#2d3436] text-[#dfe6e9] px-3 py-2 rounded text-sm border border-[#636e72] w-48" />
      </div>
    </div>

    <!-- Stats bar -->
    <div class="flex gap-4 mb-4 text-sm text-[#636e72]">
      <span>{{ filtered.length }} items</span>
      <span v-if="filter !== 'all'">of {{ items.length }} total</span>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12 text-[#636e72]">Loading...</div>

    <!-- Empty -->
    <div v-else-if="!filtered.length" class="text-center py-12 text-[#636e72]">
      <p class="text-lg">No {{ filter === 'all' ? 'items' : filter + 's' }} found</p>
    </div>

    <!-- Grid -->
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      <NuxtLink v-for="item in filtered" :key="item.id" :to="`/book/${item.id}`"
        class="bg-[#2d3436] rounded-lg overflow-hidden hover:ring-2 hover:ring-[#6c5ce7] transition group">
        <!-- Cover -->
        <div class="aspect-[2/3] bg-[#1e272e] flex items-center justify-center overflow-hidden">
          <img v-if="item.media?.coverPath"
            :src="`/api/items/${item.id}/cover?width=200`"
            :alt="item.media?.metadata?.title"
            class="w-full h-full object-cover group-hover:scale-105 transition" />
          <span v-else class="text-3xl">📚</span>
        </div>
        <!-- Info -->
        <div class="p-2">
          <p class="text-sm font-medium truncate">{{ item.media?.metadata?.title || 'Untitled' }}</p>
          <p class="text-xs text-[#636e72] truncate">{{ item.media?.metadata?.authorName || '' }}</p>
          <div class="flex gap-1 mt-1">
            <span v-if="item.media?.numAudioFiles > 0" class="text-xs bg-[#6c5ce7]/20 text-[#6c5ce7] px-1.5 py-0.5 rounded">🎧</span>
            <span v-if="item.media?.ebookFormat" class="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">📖</span>
          </div>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
