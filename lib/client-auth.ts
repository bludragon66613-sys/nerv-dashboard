// Client-side auth helper — manages JWT token in sessionStorage
// Usage: import { apiFetch } from '@/lib/client-auth'
// Then replace: fetch('/api/foo', opts)
//   with:       apiFetch('/api/foo', opts)

async function getToken(): Promise<string> {
  const stored = sessionStorage.getItem('nerv_token')
  if (stored) return stored
  const res = await fetch('/api/auth/token', { method: 'POST' })
  const { token } = await res.json()
  sessionStorage.setItem('nerv_token', token)
  return token
}

export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(url, { ...init, headers })

  // On 401: clear stale token and retry once with a fresh one
  if (res.status === 401) {
    sessionStorage.removeItem('nerv_token')
    const freshToken = await getToken()
    const retryHeaders = new Headers(init.headers)
    retryHeaders.set('Authorization', `Bearer ${freshToken}`)
    return fetch(url, { ...init, headers: retryHeaders })
  }

  return res
}
