export const useApi = () => {
  const config = useRuntimeConfig()
  const token = useCookie('token')

  const api = async (path: string, options: any = {}) => {
    return $fetch(`${config.public.apiBase}${path}`, {
      ...options,
      headers: { ...options.headers, ...(token.value ? { Authorization: `Bearer ${token.value}` } : {}) }
    })
  }

  const get = (path: string) => api(path)
  const post = (path: string, body?: any) => api(path, { method: 'POST', body })
  const patch = (path: string, body?: any) => api(path, { method: 'PATCH', body })

  return { api, get, post, patch }
}
