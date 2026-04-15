<script setup>
const { get, post } = useApi()

const aiStatus = ref(null)
const agents = ref([])
const activity = ref([])
const loading = ref(true)
const authError = ref(false)

onMounted(async () => {
  try {
    const [ai, ag, act] = await Promise.all([
      get('/ai/status').catch(() => null),
      get('/agent/agents').catch(() => null),
      get('/intelligence/activity').catch(() => null)
    ])
    if (!ai && !ag && !act) {
      authError.value = true
      return
    }
    aiStatus.value = ai
    agents.value = ag?.agents || []
    activity.value = Array.isArray(act) ? act.slice(0, 10) : []
  } finally {
    loading.value = false
  }
})

async function scanIncoming() { await post('/incoming/scan') }
async function rebuildProfile() { await post('/recommendations/profile/rebuild') }
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-6">Dashboard</h1>

    <div v-if="loading" class="text-[#636e72]">Loading…</div>

    <div v-else-if="authError" class="bg-[#2d3436] p-6 rounded-lg text-center">
      <p class="text-xl mb-3">🔐 Authentication Required</p>
      <p class="text-[#636e72] mb-4">Log in to the main ABS interface first, then come back here.</p>
      <a href="/login" class="bg-[#6c5ce7] px-6 py-2 rounded text-white inline-block">Go to Login</a>
    </div>

    <div v-else class="grid gap-6 md:grid-cols-2">
      <div class="rounded-lg bg-[#2d3436] p-4">
        <h2 class="text-lg font-semibold mb-2">AI Status</h2>
        <div v-if="aiStatus">
          <p>Provider: <span class="font-medium text-[#6c5ce7]">{{ aiStatus.provider || 'disabled' }}</span></p>
          <p>Available: <span :class="aiStatus.available ? 'text-green-400' : 'text-red-400'">{{ aiStatus.available ? 'Yes' : 'No' }}</span></p>
        </div>
        <p v-else class="text-[#636e72]">Not configured</p>
      </div>

      <div class="rounded-lg bg-[#2d3436] p-4">
        <h2 class="text-lg font-semibold mb-2">Agent Status</h2>
        <div v-if="agents.length">
          <div v-for="a in agents" :key="a.agentId" class="py-1 flex justify-between">
            <span>{{ a.hostname || a.agentId }}</span>
            <span :class="a.online ? 'text-green-400' : 'text-[#636e72]'" class="text-sm">{{ a.online ? '● online' : '○ offline' }}</span>
          </div>
        </div>
        <p v-else class="text-[#636e72]">No agents connected</p>
      </div>

      <div class="rounded-lg bg-[#2d3436] p-4 md:col-span-2">
        <h2 class="text-lg font-semibold mb-2">Recent Activity</h2>
        <div v-if="activity.length">
          <div v-for="item in activity" :key="item.id" class="py-1 border-b border-[#636e72]/20 last:border-0">
            {{ item.bookTitle || item.title || 'Unknown' }}
            <span class="text-[#636e72] text-sm">— {{ item.bookAuthor || item.author || '' }}</span>
          </div>
        </div>
        <p v-else class="text-[#636e72]">No recent activity</p>
      </div>

      <div class="rounded-lg bg-[#2d3436] p-4 md:col-span-2">
        <h2 class="text-lg font-semibold mb-3">Quick Actions</h2>
        <div class="flex flex-wrap gap-3">
          <button class="rounded px-4 py-2 bg-[#6c5ce7] text-sm" @click="scanIncoming">📥 Scan Incoming</button>
          <button class="rounded px-4 py-2 bg-[#6c5ce7] text-sm" @click="rebuildProfile">🔄 Rebuild Profile</button>
          <NuxtLink to="/library" class="rounded px-4 py-2 bg-[#6c5ce7] text-sm">📚 Browse Library</NuxtLink>
          <NuxtLink to="/discover" class="rounded px-4 py-2 bg-[#6c5ce7] text-sm">🔍 Discover</NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
