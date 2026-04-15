export const useApi = () => {
  const config = useRuntimeConfig()

  const getToken = () => {
    if (import.meta.client) {
      // ABS stores JWT in localStorage as 'token'
      return localStorage.getItem('token') || ''
    }
    return ''
  }

  const api = async (path: string, options: any = {}) => {
    const token = getToken()
    if (!token) {
      console.warn('[useApi] No token in localStorage. Log in via main ABS UI first.')
      return null
    }
    try {
      return await $fetch(`${config.public.apiBase}${path}`, {
        ...options,
        headers: {
          ...options.headers,
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      })
    } catch (err: any) {
      if (err?.response?.status === 401 || err?.statusCode === 401) {
        return null
      }
      console.warn(`API error ${path}:`, err?.message || err)
      return null
    }
  }

  const get = (path: string) => api(path)
  const post = (path: string, body?: any) => api(path, { method: 'POST', body })
  const patch = (path: string, body?: any) => api(path, { method: 'PATCH', body })

  return { api, get, post, patch }
}
