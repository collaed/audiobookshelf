export default defineNuxtConfig({
  modules: ['@nuxtjs/tailwindcss'],
  ssr: false,
  devtools: { enabled: false },
  app: {
    baseURL: '/v3/',
    head: { title: 'Audiobookshelf' }
  },
  runtimeConfig: {
    public: {
      apiBase: '/api'
    }
  },
  routeRules: {
    '/api/**': { proxy: process.env.ABS_SERVER_URL || 'http://localhost:13378/api/**' }
  }
})
