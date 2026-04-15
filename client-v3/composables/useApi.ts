export const useApi = () => {
  const config = useRuntimeConfig()
  const token = useCookie('token')
  // Also try the ABS connect token from the main app
  const connectToken = useCookie('connect.sid')

  const headers = () => {
    const h: Record<string, string> = {}
    if (token.value) h['Authorization'] = `Bearer ${token.value}`
    return h
  }

  const api = async (path: string, options: any = {}) => {
    try {
      return await $fetch(`${config.public.apiBase}${path}`, {
        ...options,
        headers: { ...headers(), ...options.headers }
      })
    } catch (err: any) {
      // If 401, don't crash — return null so pages can handle it
      if (err?.response?.status === 401 || err?.statusCode === 401) {
        return null
      }
      throw err
    }
  }

  const get = (path: string) => api(path)
  const post = (path: string, body?: any) => api(path, { method: 'POST', body })
  const patch = (path: string, body?: any) => api(path, { method: 'PATCH', body })

  return { api, get, post, patch, isAuthenticated: computed(() => !!token.value) }
}
