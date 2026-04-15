export const useApi = () => {
  const config = useRuntimeConfig()

  const api = async (path: string, options: any = {}) => {
    try {
      return await $fetch(`${config.public.apiBase}${path}`, {
        ...options,
        credentials: 'include', // send session cookies (connect.sid)
        headers: { ...options.headers }
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
