<template>
  <div class="flex h-screen bg-abs-bg text-abs-text">
    <nav class="w-56 bg-abs-card flex flex-col p-4 space-y-1">
      <h1 class="text-lg font-bold text-abs-accent mb-6">Audiobookshelf</h1>
      <NuxtLink v-for="link in links" :key="link.to" :to="link.to"
        class="px-3 py-2 rounded hover:bg-abs-accent/20 text-sm"
        active-class="bg-abs-accent/30 text-white">
        {{ link.label }}
      </NuxtLink>
    </nav>
    <main class="flex-1 overflow-auto p-6">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/incoming', label: 'Incoming' },
  { to: '/discover', label: 'Discover' },
  { to: '/intelligence', label: 'Intelligence' },
  { to: '/language', label: 'Language' },
  { to: '/settings', label: 'Settings' },
]
</script>
