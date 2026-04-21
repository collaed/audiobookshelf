export const useApi = () => {
  const config = useRuntimeConfig()

  const getToken = (): string => {
    if (!import.meta.client) return ''
    // ABS stores JWT as 'token' in localStorage
    // Try multiple possible keys (some ABS versions use different keys)
    return localStorage.getItem('token')
      || localStorage.getItem('abs_token')
      || ''
  }

  const isLoggedIn = (): boolean => !!getToken()

  const api = async <T = any>(path: string, options: any = {}): Promise<T | null> => {
    const token = getToken()
    try {
      return await $fetch<T>(`${config.public.apiBase}${path}`, {
        ...options,
        headers: {
          ...options.headers,
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      })
    } catch (err: any) {
      const status = err?.response?.status || err?.statusCode
      if (status === 401) return null
      // Log non-auth errors for debugging
      if (import.meta.client) {
        console.warn(`[API ${status || 'ERR'}] ${path}:`, err?.data?.error || err?.message || '')
      }
      return null
    }
  }

  const get = <T = any>(path: string) => api<T>(path)
  const post = <T = any>(path: string, body?: any) => api<T>(path, { method: 'POST', body })
  const patch = <T = any>(path: string, body?: any) => api<T>(path, { method: 'PATCH', body })

  return { api, get, post, patch, isLoggedIn, getToken }
}
