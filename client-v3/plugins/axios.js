export default defineNuxtPlugin((nuxtApp) => {
  const store = nuxtApp.$pinia ? useNuxtApp().$pinia : null

  const requestInterceptors = []
  const errorInterceptors = []

  const axiosCompat = {
    onRequest(fn) { requestInterceptors.push(fn) },
    onError(fn) { errorInterceptors.push(fn) },

    async _request(url, opts = {}) {
      // Build config object for interceptors
      const config = { url, headers: { common: {}, ...(opts.headers || {}) }, ...opts }
      for (const fn of requestInterceptors) {
        await fn(config)
      }

      // Merge common headers into top-level headers
      const headers = { ...config.headers.common }
      for (const [k, v] of Object.entries(config.headers)) {
        if (k !== 'common') headers[k] = v
      }

      try {
        return await $fetch(config.url, {
          method: config.method || 'GET',
          headers,
          body: config.body,
          params: config.params,
          responseType: config.responseType
        })
      } catch (error) {
        // Normalize error shape for interceptors
        const normalized = {
          config,
          response: error.response ? { status: error.response.status, data: error.response._data } : null
        }
        for (const fn of errorInterceptors) {
          try { await fn(normalized) } catch (_) { /* interceptor may rethrow */ }
        }
        throw error
      }
    },

    $get(url, opts) { return this._request(url, { method: 'GET', ...opts }) },
    $post(url, body, opts) { return this._request(url, { method: 'POST', body, ...opts }) },
    $patch(url, body, opts) { return this._request(url, { method: 'PATCH', body, ...opts }) },
    $delete(url, opts) { return this._request(url, { method: 'DELETE', ...opts }) },
    $put(url, body, opts) { return this._request(url, { method: 'PUT', body, ...opts }) }
  }

  nuxtApp.vueApp.config.globalProperties.$axios = axiosCompat
  nuxtApp.provide('axios', axiosCompat)

  // Run the original axios plugin setup (onRequest / onError registration)
  setupInterceptors(axiosCompat, nuxtApp)
})

function setupInterceptors($axios, nuxtApp) {
  let isRefreshing = false
  let failedQueue = []

  const processQueue = (error, token = null) => {
    failedQueue.forEach(({ resolve, reject }) => {
      if (error) reject(error)
      else resolve(token)
    })
    failedQueue = []
  }

  $axios.onRequest((config) => {
    if (!config.url) {
      console.error('Request invalid config', config)
      return
    }
    if (config.url.startsWith('http:') || config.url.startsWith('https:')) return

    const store = nuxtApp.vueApp.config.globalProperties.$store
    const bearerToken = store?.getters['user/getToken']
    if (bearerToken) {
      config.headers.common['Authorization'] = `Bearer ${bearerToken}`
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('Making request to ' + config.url)
    }
  })

  $axios.onError(async (error) => {
    const originalRequest = error.config
    const code = parseInt(error.response && error.response.status)
    const message = error.response ? error.response.data || 'Unknown Error' : 'Unknown Error'
    console.error('Request error', code, message)

    const store = nuxtApp.vueApp.config.globalProperties.$store
    const router = useRouter()

    if (code === 401 && !originalRequest._retry) {
      if (originalRequest.url === '/auth/refresh' || originalRequest.url === '/login') {
        store.commit('user/setUser', null)
        store.commit('user/setAccessToken', null)
        router.push('/login')
        return Promise.reject(error)
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers = originalRequest.headers || {}
          originalRequest.headers['Authorization'] = `Bearer ${token}`
          return $axios._request(originalRequest.url, originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const newAccessToken = await store.dispatch('user/refreshToken')
        if (!newAccessToken) {
          console.error('No new access token received')
          return Promise.reject(error)
        }
        originalRequest.headers = originalRequest.headers || {}
        originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`
        processQueue(null, newAccessToken)
        return $axios._request(originalRequest.url, originalRequest)
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError)
        processQueue(refreshError, null)
        router.push('/login')
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  })
}
