import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('API client', () => {
  it('sends cookies with reads without requesting a CSRF token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ value: 42 }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await import('./api')

    await expect(api('/api/example')).resolves.toEqual({ value: 42 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' })
  })

  it('obtains and includes a CSRF token for writes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ requestToken: 'test-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await import('./api')

    await api('/api/example', { method: 'POST', body: JSON.stringify({ value: 42 }) })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit
    const headers = request.headers as Headers
    expect(headers.get('X-CSRF-TOKEN')).toBe('test-token')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(request.credentials).toBe('include')
  })

  it('exposes an API error with the server message and status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ title: 'Forbidden' }), { status: 403 }),
    ))
    const { api } = await import('./api')

    await expect(api('/api/example')).rejects.toMatchObject({
      message: 'Forbidden',
      status: 403,
    })

  })

  it('surfaces individual validation messages returned by the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        title: 'One or more validation errors occurred.',
        errors: { managedCompetitionMatches: ['Manage at least two matches.'], managedDecidingMatch: ['Manage the final.'] },
      }), { status: 400 }),
    ))
    const { api } = await import('./api')

    await expect(api('/api/example')).rejects.toMatchObject({
      message: 'Manage at least two matches. Manage the final.',
      status: 400,
    })
  })
})
