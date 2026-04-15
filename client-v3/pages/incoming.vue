<script setup>
const { get, post } = useApi()

const items = ref([])
const loading = ref(true)

onMounted(() => fetchPending())

async function fetchPending() {
  loading.value = true
  try {
    const resp = await get('/incoming/pending')
    items.value = resp?.items || (Array.isArray(resp) ? resp : [])
  } finally {
    loading.value = false
  }
}

async function scanNow() {
  await post('/incoming/scan')
  await fetchPending()
}

async function confirm(item) {
  await post(`/incoming/${item.id}/confirm`, { libraryId: 'main' })
  items.value = items.value.filter(i => i.id !== item.id)
}

async function reject(item) {
  await post(`/incoming/${item.id}/reject`)
  items.value = items.value.filter(i => i.id !== item.id)
}
</script>

<template>
  <div class="min-h-screen bg-[#1e272e] p-6 text-[#dfe6e9]">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Incoming</h1>
      <button class="rounded px-4 py-2 bg-[#6c5ce7] text-white hover:opacity-90" @click="scanNow">Scan Now</button>
    </div>

    <div v-if="loading" class="text-[#636e72]">Loading…</div>

    <div v-else-if="!items.length" class="text-center py-16">
      <p class="text-[#636e72] mb-4">No pending items</p>
      <button class="rounded px-4 py-2 bg-[#6c5ce7] text-white hover:opacity-90" @click="scanNow">Scan Now</button>
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div v-for="item in items" :key="item.id" class="rounded-lg bg-[#2d3436] p-4">
        <p class="font-semibold truncate">{{ item.parsedTitle || item.fileName }}</p>
        <p class="text-sm text-[#636e72]">{{ item.parsedAuthor }}</p>
        <div v-if="item.matchedTitle" class="mt-2 text-sm">
          <p>Match: <span class="font-medium">{{ item.matchedTitle }}</span> by {{ item.matchedAuthor }}</p>
          <p class="text-[#636e72]">Confidence: {{ Math.round((item.matchConfidence || 0) * 100) }}%</p>
        </div>
        <p class="text-xs text-[#636e72] mt-2">{{ item.fileName }} · {{ item.fileSize }}</p>
        <div class="flex gap-2 mt-3">
          <button class="flex-1 rounded px-3 py-1.5 bg-green-700 text-white text-sm hover:opacity-90" @click="confirm(item)">Confirm</button>
          <button class="flex-1 rounded px-3 py-1.5 bg-red-700 text-white text-sm hover:opacity-90" @click="reject(item)">Reject</button>
        </div>
      </div>
    </div>
  </div>
</template>
