<script setup>
const id = useRoute().params.id
const { get, post } = useApi()

const tab = ref('Reviews')
const tabs = ['Reviews', 'AI', 'Tags', 'Send', 'Podcast']

// Reviews
const reviews = ref(null)
const loadReviews = async () => { reviews.value = await get(`/items/${id}/reviews`) }

// AI
const recap = ref(null)
const chatQ = ref('')
const chatA = ref(null)
const charName = ref('')
const charInfo = ref(null)
const getRecap = async () => { recap.value = await get(`/ai/recap/${id}`) }
const askQuestion = async () => { chatA.value = await post(`/ai/ask/${id}`, { question: chatQ.value }) }
const lookupChar = async () => { charInfo.value = await post(`/ai/character/${id}`, { name: charName.value }) }

// Tags
const tagPreview = ref(null)
const tagApplied = ref(false)
const generateTags = async () => { tagPreview.value = await post(`/items/${id}/auto-tag`) }
const applyTags = async () => { await post(`/items/${id}/auto-tag/apply`); tagApplied.value = true }

// Send
const kindleEmail = ref('')
const deviceName = ref('')
const mobileLinks = ref(null)
const sendKindle = async () => { await post(`/items/${id}/send-to-kindle`, { email: kindleEmail.value }) }
const sendDevice = async () => { await post(`/items/${id}/send-to-device`, { deviceName: deviceName.value }) }
const loadLinks = async () => { mobileLinks.value = await get(`/items/${id}/mobile-links`) }

// Podcast
const schedule = ref('daily')
const releaseTime = ref('08:00')
const startDate = ref('')
const feedResult = ref(null)
const createFeed = async () => {
  feedResult.value = await post(`/items/${id}/podcast-feed`, {
    schedule: schedule.value, releaseTime: releaseTime.value, startDate: startDate.value
  })
}
const copyUrl = () => { navigator.clipboard.writeText(feedResult.value?.url) }

onMounted(loadReviews)
</script>

<template>
  <div class="min-h-screen bg-[#1e272e] text-[#dfe6e9] p-6">
    <h1 class="text-2xl font-bold mb-4">Book {{ id }}</h1>

    <div class="flex gap-2 mb-6">
      <button v-for="t in tabs" :key="t" @click="tab = t; t === 'Reviews' && loadReviews()"
        :class="['px-4 py-2 rounded', tab === t ? 'bg-[#6c5ce7] text-white' : 'bg-[#2d3436] text-[#636e72]']">
        {{ t }}
      </button>
    </div>

    <!-- Reviews -->
    <div v-if="tab === 'Reviews'">
      <div v-if="reviews" class="space-y-3">
        <div v-for="r in reviews" :key="r.source" class="bg-[#2d3436] p-4 rounded">
          <div class="flex items-center gap-2">
            <span class="font-semibold">{{ r.source }}</span>
            <span class="text-yellow-400">{{ '★'.repeat(Math.round(r.rating)) }}{{ '☆'.repeat(5 - Math.round(r.rating)) }}</span>
            <span class="text-[#636e72]">{{ r.rating }}/5</span>
          </div>
          <p class="text-sm text-[#636e72] mt-1">{{ r.excerpt }}</p>
        </div>
      </div>
      <p v-else class="text-[#636e72]">Loading reviews...</p>
    </div>

    <!-- AI -->
    <div v-if="tab === 'AI'" class="space-y-4">
      <div>
        <button @click="getRecap" class="bg-[#6c5ce7] px-4 py-2 rounded">What happened so far?</button>
        <p v-if="recap" class="bg-[#2d3436] p-4 rounded mt-2">{{ recap.recap || recap }}</p>
      </div>
      <div class="flex gap-2">
        <input v-model="chatQ" placeholder="Ask a question..." class="flex-1 bg-[#2d3436] text-[#dfe6e9] px-3 py-2 rounded" />
        <button @click="askQuestion" class="bg-[#6c5ce7] px-4 py-2 rounded">Ask</button>
      </div>
      <p v-if="chatA" class="bg-[#2d3436] p-4 rounded">{{ chatA.answer || chatA }}</p>
      <div class="flex gap-2">
        <input v-model="charName" placeholder="Character name..." class="flex-1 bg-[#2d3436] text-[#dfe6e9] px-3 py-2 rounded" />
        <button @click="lookupChar" class="bg-[#6c5ce7] px-4 py-2 rounded">Lookup</button>
      </div>
      <p v-if="charInfo" class="bg-[#2d3436] p-4 rounded">{{ charInfo.info || charInfo }}</p>
    </div>

    <!-- Tags -->
    <div v-if="tab === 'Tags'" class="space-y-4">
      <button @click="generateTags" class="bg-[#6c5ce7] px-4 py-2 rounded">Generate Tags</button>
      <div v-if="tagPreview" class="bg-[#2d3436] p-4 rounded space-y-2">
        <div v-for="key in ['genres','mood','themes','pace','contentWarnings','similar','oneLiner']" :key="key">
          <span class="text-[#636e72] text-sm">{{ key }}:</span>
          <span class="ml-2">{{ Array.isArray(tagPreview[key]) ? tagPreview[key].join(', ') : tagPreview[key] }}</span>
        </div>
        <button @click="applyTags" class="bg-[#6c5ce7] px-4 py-2 rounded mt-2">Apply Tags</button>
        <p v-if="tagApplied" class="text-green-400 text-sm">Tags applied!</p>
      </div>
    </div>

    <!-- Send -->
    <div v-if="tab === 'Send'" class="space-y-4">
      <div class="flex gap-2">
        <input v-model="kindleEmail" placeholder="Kindle email..." class="flex-1 bg-[#2d3436] text-[#dfe6e9] px-3 py-2 rounded" />
        <button @click="sendKindle" class="bg-[#6c5ce7] px-4 py-2 rounded">Send to Kindle</button>
      </div>
      <div class="flex gap-2">
        <input v-model="deviceName" placeholder="Device name..." class="flex-1 bg-[#2d3436] text-[#dfe6e9] px-3 py-2 rounded" />
        <button @click="sendDevice" class="bg-[#6c5ce7] px-4 py-2 rounded">Send to Device</button>
      </div>
      <button @click="loadLinks" class="bg-[#6c5ce7] px-4 py-2 rounded">Mobile Links</button>
      <div v-if="mobileLinks" class="bg-[#2d3436] p-4 rounded">
        <a v-for="l in mobileLinks" :key="l.url" :href="l.url" class="block text-[#6c5ce7] underline">{{ l.label || l.url }}</a>
      </div>
    </div>

    <!-- Podcast -->
    <div v-if="tab === 'Podcast'" class="space-y-4">
      <div class="flex gap-4 items-end">
        <label class="space-y-1">
          <span class="text-sm text-[#636e72]">Schedule</span>
          <select v-model="schedule" class="block bg-[#2d3436] text-[#dfe6e9] px-3 py-2 rounded">
            <option>daily</option><option>weekdays</option><option>weekly</option>
          </select>
        </label>
        <label class="space-y-1">
          <span class="text-sm text-[#636e72]">Time</span>
          <input v-model="releaseTime" type="time" class="block bg-[#2d3436] text-[#dfe6e9] px-3 py-2 rounded" />
        </label>
        <label class="space-y-1">
          <span class="text-sm text-[#636e72]">Start Date</span>
          <input v-model="startDate" type="date" class="block bg-[#2d3436] text-[#dfe6e9] px-3 py-2 rounded" />
        </label>
      </div>
      <button @click="createFeed" class="bg-[#6c5ce7] px-4 py-2 rounded">Create Feed</button>
      <div v-if="feedResult" class="bg-[#2d3436] p-4 rounded flex items-center gap-2">
        <code class="flex-1 text-sm break-all">{{ feedResult.url }}</code>
        <button @click="copyUrl" class="bg-[#6c5ce7] px-3 py-1 rounded text-sm">Copy</button>
      </div>
    </div>
  </div>
</template>
