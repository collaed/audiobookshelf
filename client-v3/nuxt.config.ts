export default defineNuxtConfig({
  modules: ['@nuxtjs/tailwindcss'],
  ssr: false,
  devtools: { enabled: false },
  runtimeConfig: {
    public: {
      apiBase: process.env.ABS_API_URL || '/api'
    }
  },
  routeRules: {
    '/api/**': { proxy: process.env.ABS_SERVER_URL || 'http://localhost:13378/api/**' }
  }
})
