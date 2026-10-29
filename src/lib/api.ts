export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const apiBase = import.meta.env.VITE_API_BASE_URL ?? ''
let csrfToken: string | undefined

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken
  const response = await fetch(`${apiBase}/api/auth/csrf`, {
    credentials: 'include',
  })
  if (!response.ok) throw new ApiError('Could not establish a secure session.', response.status)
  const body = (await response.json()) as { requestToken: string }
  csrfToken = body.requestToken
  return csrfToken
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('X-CSRF-TOKEN', await getCsrfToken())
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | { title?: string; detail?: string }
      | undefined
    throw new ApiError(
      body?.detail ?? body?.title ?? `Request failed (${response.status}).`,
      response.status,
    )
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function signIn(provider: 'google' | 'microsoft'): void {
  window.location.assign(`${apiBase}/api/auth/${provider}`)
}

export function signOut(): Promise<void> {
  return api<void>('/api/auth/logout', { method: 'POST' })
}
