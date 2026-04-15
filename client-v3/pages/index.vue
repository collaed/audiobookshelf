<script setup>
const { get, post, isAuthenticated } = useApi()

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
    }
    aiStatus.value = ai
    agents.value = ag?.agents || ag || []
    activity.value = Array.isArray(act) ? act.slice(0, 10) : []
  } finally {
    loading.value = false
  }
})

async function scanIncoming() {
  await post('/incoming/scan')
}
async function rebuildProfile() {
  await post('/recommendations/profile/rebuild')
}
</script>

<template>
  <div class="min-h-screen bg-[#1e272e] p-6 text-[#dfe6e9]">
    <h1 class="text-2xl font-bold mb-6">Dashboard</h1>

    <div v-if="loading" class="text-[#636e72]">Loading…</div>
    <div v-else-if="authError" class="bg-[#2d3436] p-6 rounded-lg text-center">
      <p class="text-xl mb-3">🔐 Authentication Required</p>
      <p class="text-[#636e72] mb-4">Log in to the main ABS interface first, then come back here.</p>
      <a href="/" class="bg-[#6c5ce7] px-6 py-2 rounded text-white inline-block">Go to Login</a>
    </div>

    <div v-else class="grid gap-6 md:grid-cols-2">
      <!-- AI Status -->
      <div class="rounded-lg bg-[#2d3436] p-4">
        <h2 class="text-lg font-semibold mb-2">AI Status</h2>
        <template v-if="aiStatus">
          <p>Provider: <span class="font-medium">{{ aiStatus.provider }}</span></p>
          <p>Available: <span class="font-medium">{{ aiStatus.available }}</span></p>
        </template>
        <p v-else class="text-[#636e72]">Unavailable</p>
      </div>

      <!-- Agent Status -->
      <div class="rounded-lg bg-[#2d3436] p-4">
        <h2 class="text-lg font-semibold mb-2">Agent Status</h2>
        <ul v-if="agents.length">
          <li v-for="a in agents" :key="a.id" class="py-1">{{ a.name || a.id }} — <span class="text-[#636e72]">{{ a.status }}</span></li>
        </ul>
        <p v-else class="text-[#636e72]">No connected agents</p>
      </div>

      <!-- Recent Activity -->
      <div class="rounded-lg bg-[#2d3436] p-4 md:col-span-2">
        <h2 class="text-lg font-semibold mb-2">Recent Activity</h2>
        <ul v-if="activity.length">
          <li v-for="item in activity" :key="item.id" class="py-1 border-b border-[#636e72]/20 last:border-0">
            {{ item.title }} <span class="text-[#636e72] text-sm">— {{ item.author }}</span>
          </li>
        </ul>
        <p v-else class="text-[#636e72]">No recent activity</p>
      </div>

      <!-- Quick Actions -->
      <div class="rounded-lg bg-[#2d3436] p-4 md:col-span-2">
        <h2 class="text-lg font-semibold mb-3">Quick Actions</h2>
        <div class="flex flex-wrap gap-3">
          <button class="rounded px-4 py-2 bg-[#6c5ce7] text-white hover:opacity-90" @click="scanIncoming">Scan Incoming</button>
          <button class="rounded px-4 py-2 bg-[#6c5ce7] text-white hover:opacity-90" @click="rebuildProfile">Rebuild Profile</button>
          <button class="rounded px-4 py-2 bg-[#6c5ce7] text-white hover:opacity-90">Check Quality</button>
        </div>
      </div>
    </div>
  </div>
</template>
