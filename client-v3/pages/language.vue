<script setup>
const { post } = useApi()

const bookIdA = ref('')
const bookIdB = ref('')
const pattern = ref('ab')
const mode = ref('sentence')

const alignment = ref(null)
const textResult = ref(null)
const audioResult = ref(null)

const previewAlign = async () => {
  alignment.value = await post('/language/align', { bookIdA: bookIdA.value, bookIdB: bookIdB.value })
}
const interleaveText = async () => {
  textResult.value = await post('/language/interleave-text', {
    bookIdA: bookIdA.value, bookIdB: bookIdB.value, mode: mode.value, pattern: pattern.value
  })
}
const interleaveAudio = async () => {
  audioResult.value = await post('/language/interleave-audio', {
    audioBookId: bookIdA.value, translationBookId: bookIdB.value
  })
}
</script>

<template>
  <div class="min-h-screen bg-[#1e272e] text-[#dfe6e9] p-6">
    <h1 class="text-2xl font-bold mb-4">Language Learning</h1>

    <div class="flex gap-4 mb-6">
      <input v-model="bookIdA" placeholder="Book A (source language)..." class="flex-1 bg-[#2d3436] text-[#dfe6e9] px-3 py-2 rounded" />
      <input v-model="bookIdB" placeholder="Book B (target language)..." class="flex-1 bg-[#2d3436] text-[#dfe6e9] px-3 py-2 rounded" />
    </div>

    <!-- Alignment Preview -->
    <section class="mb-6">
      <button @click="previewAlign" class="bg-[#6c5ce7] px-4 py-2 rounded">Preview Alignment</button>
      <div v-if="alignment" class="mt-3 space-y-2">
        <div v-for="(pair, i) in alignment.pairs || alignment" :key="i" class="bg-[#2d3436] p-3 rounded grid grid-cols-2 gap-4">
          <p>{{ pair.a }}</p>
          <p class="text-[#636e72]">{{ pair.b }}</p>
        </div>
      </div>
    </section>

    <!-- Options -->
    <div class="flex gap-4 mb-6">
      <label class="space-y-1">
        <span class="text-sm text-[#636e72]">Pattern</span>
        <select v-model="pattern" class="block bg-[#2d3436] text-[#dfe6e9] px-3 py-2 rounded">
          <option>ab</option><option>aab</option><option>aba</option>
        </select>
      </label>
      <label class="space-y-1">
        <span class="text-sm text-[#636e72]">Mode</span>
        <select v-model="mode" class="block bg-[#2d3436] text-[#dfe6e9] px-3 py-2 rounded">
          <option>sentence</option><option>paragraph</option>
        </select>
      </label>
    </div>

    <!-- Generate -->
    <div class="flex gap-3 mb-6">
      <button @click="interleaveText" class="bg-[#6c5ce7] px-4 py-2 rounded">Generate Interleaved Text</button>
      <button @click="interleaveAudio" class="bg-[#6c5ce7] px-4 py-2 rounded">Generate Interleaved Audio</button>
    </div>

    <!-- Results -->
    <div v-if="textResult" class="bg-[#2d3436] p-4 rounded mb-4">
      <h3 class="font-semibold mb-2">Text Result</h3>
      <p v-if="textResult.downloadUrl">
        <a :href="textResult.downloadUrl" class="text-[#6c5ce7] underline">Download</a>
      </p>
      <pre v-else class="text-sm whitespace-pre-wrap">{{ textResult }}</pre>
    </div>

    <div v-if="audioResult" class="bg-[#2d3436] p-4 rounded">
      <h3 class="font-semibold mb-2">Audio Result</h3>
      <p v-if="audioResult.downloadUrl">
        <a :href="audioResult.downloadUrl" class="text-[#6c5ce7] underline">Download</a>
      </p>
      <p v-else class="text-sm text-[#636e72]">{{ audioResult.status || audioResult }}</p>
    </div>
  </div>
</template>
