<script setup>
const { get, patch } = useApi()

// AI Config
const provider = ref('airouter')
const baseUrl = ref('')
const token = ref('')
const model = ref('')
const aiStatus = ref(null)
const aiSaved = ref(false)

const testConnection = async () => { aiStatus.value = await get('/ai/status') }
const saveAiConfig = async () => {
  await patch('/ai/config', { provider: provider.value, baseUrl: baseUrl.value, token: token.value, model: model.value })
  aiSaved.value = true
}

// Status sections
const ocr = ref(null)
const agents = ref(null)
const conversion = ref(null)
const sync = ref(null)

onMounted(async () => {
  ;[ocr.value, agents.value, conversion.value, sync.value] = await Promise.all([
    get('/ocr/status'), get('/agent/agents'), get('/tools/conversion-check'), get('/sync/check')
  ])
})

const providerFields = computed(() => {
  const p = provider.value
  if (p === 'disabled') return []
  if (p === 'ollama') return ['url', 'model']
  if (p === 'openai') return ['token', 'model']
  return ['url', 'token', 'model']
})
</script>

<template>
  <div class="min-h-screen bg-[#1e272e] text-[#dfe6e9] p-6">
    <h1 class="text-2xl font-bold mb-6">Settings</h1>

    <!-- AI Config -->
    <section class="mb-8">
      <h2 class="text-lg font-semibold mb-3">AI / LLM Configuration</h2>
      <div class="bg-[#2d3436] p-4 rounded space-y-3">
        <label class="block space-y-1">
          <span class="text-sm text-[#636e72]">Provider</span>
          <select v-model="provider" class="block w-full bg-[#1e272e] text-[#dfe6e9] px-3 py-2 rounded">
            <option v-for="p in ['airouter','ollama','openai','custom','disabled']" :key="p" :value="p">{{ p }}</option>
          </select>
        </label>
        <label v-if="providerFields.includes('url')" class="block space-y-1">
          <span class="text-sm text-[#636e72]">URL</span>
          <input v-model="baseUrl" class="block w-full bg-[#1e272e] text-[#dfe6e9] px-3 py-2 rounded" />
        </label>
        <label v-if="providerFields.includes('token')" class="block space-y-1">
          <span class="text-sm text-[#636e72]">Token / Key</span>
          <input v-model="token" type="password" class="block w-full bg-[#1e272e] text-[#dfe6e9] px-3 py-2 rounded" />
        </label>
        <label v-if="providerFields.includes('model')" class="block space-y-1">
          <span class="text-sm text-[#636e72]">Model</span>
          <input v-model="model" class="block w-full bg-[#1e272e] text-[#dfe6e9] px-3 py-2 rounded" />
        </label>
        <div class="flex gap-3">
          <button @click="testConnection" class="bg-[#6c5ce7] px-4 py-2 rounded">Test Connection</button>
          <button @click="saveAiConfig" class="bg-[#6c5ce7] px-4 py-2 rounded">Save</button>
        </div>
        <p v-if="aiStatus" class="text-sm" :class="aiStatus.ok ? 'text-green-400' : 'text-red-400'">
          {{ aiStatus.ok ? 'Connected' : aiStatus.error || 'Connection failed' }}
        </p>
        <p v-if="aiSaved" class="text-sm text-green-400">Configuration saved.</p>
      </div>
    </section>

    <!-- OCR -->
    <section class="mb-8">
      <h2 class="text-lg font-semibold mb-3">OCR Status</h2>
      <div v-if="ocr" class="bg-[#2d3436] p-4 rounded space-y-1">
        <p>Available: <span :class="ocr.available ? 'text-green-400' : 'text-red-400'">{{ ocr.available ? 'Yes' : 'No' }}</span></p>
        <p>Engine: <span class="text-[#636e72]">{{ ocr.engine }}</span></p>
        <p>Languages: <span class="text-[#636e72]">{{ ocr.languages?.join(', ') }}</span></p>
      </div>
    </section>

    <!-- Agents -->
    <section class="mb-8">
      <h2 class="text-lg font-semibold mb-3">Agent Status</h2>
      <div v-if="agents" class="space-y-2">
        <div v-for="a in agents" :key="a.id || a.name" class="bg-[#2d3436] p-4 rounded flex justify-between">
          <span>{{ a.name || a.id }}</span>
          <span class="text-[#636e72] text-sm">v{{ a.version }} · {{ a.lastSeen }}</span>
        </div>
        <p v-if="!agents.length" class="text-[#636e72]">No agents connected.</p>
      </div>
    </section>

    <!-- Conversion -->
    <section class="mb-8">
      <h2 class="text-lg font-semibold mb-3">Conversion Tools</h2>
      <div v-if="conversion" class="bg-[#2d3436] p-4 rounded space-y-1">
        <p>Calibre: <span :class="conversion.calibreAvailable ? 'text-green-400' : 'text-red-400'">{{ conversion.calibreAvailable ? 'Available' : 'Not found' }}</span></p>
        <p>Formats: <span class="text-[#636e72]">{{ conversion.supportedFormats?.join(', ') }}</span></p>
      </div>
    </section>

    <!-- Sync -->
    <section class="mb-8">
      <h2 class="text-lg font-semibold mb-3">Sync Status</h2>
      <div v-if="sync" class="bg-[#2d3436] p-4 rounded">
        <p>Whisper: <span :class="sync.whisperAvailable ? 'text-green-400' : 'text-red-400'">{{ sync.whisperAvailable ? 'Available' : 'Not found' }}</span></p>
      </div>
    </section>
  </div>
</template>
