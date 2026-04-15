<script setup>
const { get } = useApi()

const libraryId = ref('')
const quality = ref(null)
const seriesGaps = ref(null)
const narrators = ref(null)
const duplicates = ref(null)
const stats = ref(null)

const loadQuality = async () => { quality.value = await get(`/intelligence/library/${libraryId.value}/quality`) }
const loadGaps = async () => { seriesGaps.value = await get(`/intelligence/library/${libraryId.value}/series-gaps`) }
const loadNarrators = async () => { narrators.value = await get(`/intelligence/library/${libraryId.value}/narrator-consistency`) }
const loadDuplicates = async () => { duplicates.value = await get(`/tools/duplicates?libraryId=${libraryId.value}`) }
const loadStats = async () => { stats.value = await get('/intelligence/stats') }
</script>

<template>
  <div class="min-h-screen bg-[#1e272e] text-[#dfe6e9] p-6">
    <h1 class="text-2xl font-bold mb-4">Library Intelligence</h1>

    <div class="mb-6">
      <input v-model="libraryId" placeholder="Library ID..." class="bg-[#2d3436] text-[#dfe6e9] px-3 py-2 rounded w-64" />
    </div>

    <!-- Quality -->
    <section class="mb-6">
      <div class="flex items-center gap-3 mb-2">
        <h2 class="text-lg font-semibold">Quality Analysis</h2>
        <button @click="loadQuality" class="bg-[#6c5ce7] px-3 py-1 rounded text-sm">Load</button>
      </div>
      <div v-if="quality" class="bg-[#2d3436] p-4 rounded">
        <p>Avg Score: <span class="font-bold">{{ quality.avgScore }}</span></p>
        <ul class="mt-2 space-y-1">
          <li v-for="issue in quality.issues" :key="issue" class="text-sm text-[#636e72]">• {{ issue }}</li>
        </ul>
      </div>
    </section>

    <!-- Series Gaps -->
    <section class="mb-6">
      <div class="flex items-center gap-3 mb-2">
        <h2 class="text-lg font-semibold">Series Gaps</h2>
        <button @click="loadGaps" class="bg-[#6c5ce7] px-3 py-1 rounded text-sm">Load</button>
      </div>
      <table v-if="seriesGaps" class="w-full bg-[#2d3436] rounded overflow-hidden">
        <thead>
          <tr class="text-[#636e72] text-sm">
            <th class="text-left p-3">Series</th>
            <th class="text-left p-3">Missing</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in seriesGaps" :key="s.series" class="border-t border-[#1e272e]">
            <td class="p-3">{{ s.series }}</td>
            <td class="p-3 text-[#636e72]">{{ s.missingSequences?.join(', ') }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Narrator Consistency -->
    <section class="mb-6">
      <div class="flex items-center gap-3 mb-2">
        <h2 class="text-lg font-semibold">Narrator Consistency</h2>
        <button @click="loadNarrators" class="bg-[#6c5ce7] px-3 py-1 rounded text-sm">Load</button>
      </div>
      <div v-if="narrators" class="space-y-2">
        <div v-for="n in narrators" :key="n.series" class="bg-[#2d3436] p-4 rounded">
          <p class="font-semibold">{{ n.series }}</p>
          <p class="text-sm text-[#636e72]">Narrators: {{ n.narrators?.join(', ') }}</p>
        </div>
      </div>
    </section>

    <!-- Duplicates -->
    <section class="mb-6">
      <div class="flex items-center gap-3 mb-2">
        <h2 class="text-lg font-semibold">Duplicates</h2>
        <button @click="loadDuplicates" class="bg-[#6c5ce7] px-3 py-1 rounded text-sm">Load</button>
      </div>
      <div v-if="duplicates" class="space-y-2">
        <div v-for="(group, i) in duplicates" :key="i" class="bg-[#2d3436] p-4 rounded">
          <p v-for="book in group" :key="book.id" class="text-sm">{{ book.title }} <span class="text-[#636e72]">— {{ book.author }}</span></p>
        </div>
      </div>
    </section>

    <!-- Stats -->
    <section class="mb-6">
      <div class="flex items-center gap-3 mb-2">
        <h2 class="text-lg font-semibold">Stats</h2>
        <button @click="loadStats" class="bg-[#6c5ce7] px-3 py-1 rounded text-sm">Load</button>
      </div>
      <div v-if="stats" class="bg-[#2d3436] p-4 rounded space-y-1">
        <p>Total Listening Time: <span class="font-bold">{{ stats.totalListeningTime }}</span></p>
        <p>Avg Book Length: <span class="font-bold">{{ stats.avgBookLength }}</span></p>
        <p>Format Breakdown:</p>
        <ul class="ml-4">
          <li v-for="(count, fmt) in stats.formatBreakdown" :key="fmt" class="text-sm text-[#636e72]">{{ fmt }}: {{ count }}</li>
        </ul>
      </div>
    </section>
  </div>
</template>
