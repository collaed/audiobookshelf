<script setup>
const { get, post, isLoggedIn } = useApi()

const loggedIn = ref(false)
const aiStatus = ref(null)
const agents = ref([])
const activity = ref([])
const loading = ref(true)

onMounted(async () => {
  loggedIn.value = isLoggedIn()
  if (!loggedIn.value) { loading.value = false; return }
  try {
    const [ai, ag, act] = await Promise.all([
      get('/ai/status'), get('/agent/agents'), get('/intelligence/activity')
    ])
    if (ai) aiStatus.value = ai
    if (ag) agents.value = ag.agents || []
    if (act) activity.value = Array.isArray(act) ? act.slice(0, 10) : []
    // If all null, token might be expired
    if (!ai && !ag && !act) loggedIn.value = false
  } finally { loading.value = false }
})

const scanIncoming = async () => { await post('/incoming/scan') }
const rebuildProfile = async () => { await post('/recommendations/profile/rebuild') }
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-6">Dashboard</h1>

    <div v-if="loading" class="text-abs-muted">Loading…</div>

    <div v-else-if="!loggedIn" class="bg-abs-card p-6 rounded-lg text-center max-w-md mx-auto mt-12">
      <p class="text-xl mb-3">🔐 Authentication Required</p>
      <p class="text-abs-muted mb-4">Log in to the main ABS interface first, then come back here.</p>
      <a href="/login" class="bg-abs-accent px-6 py-2 rounded text-white inline-block hover:opacity-90">Go to Login</a>
      <p class="text-xs text-abs-muted mt-4">After logging in, return to <code>/v3/</code></p>
    </div>

    <div v-else class="grid gap-6 md:grid-cols-2">
      <div class="rounded-lg bg-abs-card p-4">
        <h2 class="text-lg font-semibold mb-2">AI Status</h2>
        <div v-if="aiStatus">
          <p>Provider: <span class="font-medium text-abs-accent">{{ aiStatus.provider || 'disabled' }}</span></p>
          <p>Available: <span :class="aiStatus.available ? 'text-green-400' : 'text-red-400'">{{ aiStatus.available ? 'Yes' : 'No' }}</span></p>
        </div>
        <p v-else class="text-abs-muted">Not configured</p>
      </div>

      <div class="rounded-lg bg-abs-card p-4">
        <h2 class="text-lg font-semibold mb-2">Agent Status</h2>
        <div v-if="agents.length">
          <div v-for="a in agents" :key="a.agentId" class="py-1 flex justify-between">
            <span>{{ a.hostname || a.agentId }}</span>
            <span :class="a.online ? 'text-green-400' : 'text-abs-muted'" class="text-sm">{{ a.online ? '● online' : '○ offline' }}</span>
          </div>
        </div>
        <p v-else class="text-abs-muted">No agents connected</p>
      </div>

      <div class="rounded-lg bg-abs-card p-4 md:col-span-2">
        <h2 class="text-lg font-semibold mb-2">Recent Activity</h2>
        <div v-if="activity.length">
          <div v-for="item in activity" :key="item.id" class="py-1 border-b border-abs-muted/20 last:border-0">
            {{ item.bookTitle || item.title || 'Unknown' }}
            <span class="text-abs-muted text-sm">— {{ item.bookAuthor || item.author || '' }}</span>
          </div>
        </div>
        <p v-else class="text-abs-muted">No recent activity</p>
      </div>

      <div class="rounded-lg bg-abs-card p-4 md:col-span-2">
        <h2 class="text-lg font-semibold mb-3">Quick Actions</h2>
        <div class="flex flex-wrap gap-3">
          <button class="rounded px-4 py-2 bg-abs-accent text-sm hover:opacity-90" @click="scanIncoming">📥 Scan Incoming</button>
          <button class="rounded px-4 py-2 bg-abs-accent text-sm hover:opacity-90" @click="rebuildProfile">🔄 Rebuild Profile</button>
          <NuxtLink to="/library" class="rounded px-4 py-2 bg-abs-accent text-sm hover:opacity-90">📚 Library</NuxtLink>
          <NuxtLink to="/discover" class="rounded px-4 py-2 bg-abs-accent text-sm hover:opacity-90">🔍 Discover</NuxtLink>
          <NuxtLink to="/settings" class="rounded px-4 py-2 bg-abs-accent text-sm hover:opacity-90">⚙️ Settings</NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
