export const useApi = () => {
  const config = useRuntimeConfig()

  const getToken = (): string => {
    if (!import.meta.client) return ''
    return localStorage.getItem('token') || localStorage.getItem('abs_token') || ''
  }

  const isLoggedIn = (): boolean => !!getToken()

  /**
   * Try to get an ABS token using the X-Auth-User from Caddy forward auth.
   * If the user is authenticated via Caddy but doesn't have an ABS token,
   * we can auto-login by calling a proxy-auth endpoint.
   */
  const tryProxyAuth = async (): Promise<boolean> => {
    if (getToken()) return true
    try {
      // The /v3/ path is behind Caddy auth — if we got here, we're authenticated.
      // Try to get user info from ABS using the forwarded auth header.
      const resp = await $fetch('/api/me', { credentials: 'include' })
      if (resp && (resp as any).id) {
        // We're authenticated via session/proxy — store the user's token
        const token = (resp as any).token
        if (token) {
          localStorage.setItem('token', token)
          return true
        }
      }
    } catch {}
    return false
  }

  const api = async <T = any>(path: string, options: any = {}): Promise<T | null> => {
    const token = getToken()
    try {
      return await $fetch<T>(`${config.public.apiBase}${path}`, {
        ...options,
        credentials: 'include', // send cookies (session from Caddy auth)
        headers: {
          ...options.headers,
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      })
    } catch (err: any) {
      const status = err?.response?.status || err?.statusCode
      if (status === 401) {
        // Try proxy auth once
        const ok = await tryProxyAuth()
        if (ok) {
          // Retry with new token
          const newToken = getToken()
          try {
            return await $fetch<T>(`${config.public.apiBase}${path}`, {
              ...options,
              headers: { ...options.headers, Authorization: `Bearer ${newToken}` }
            })
          } catch { return null }
        }
        return null
      }
      if (import.meta.client) {
        console.warn(`[API ${status || 'ERR'}] ${path}:`, err?.data?.error || err?.message || '')
      }
      return null
    }
  }

  const get = <T = any>(path: string) => api<T>(path)
  const post = <T = any>(path: string, body?: any) => api<T>(path, { method: 'POST', body })
  const patch = <T = any>(path: string, body?: any) => api<T>(path, { method: 'PATCH', body })

  return { api, get, post, patch, isLoggedIn, getToken, tryProxyAuth }
}
