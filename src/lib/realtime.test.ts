import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/vue-query'

const mocks = vi.hoisted(() => {
  const callbacks: Record<string, (...args: never[]) => unknown> = {}
  const connection = {
    state: 'Connected',
    on: vi.fn((event: string, callback: () => void) => { callbacks[event] = callback }),
    onreconnecting: vi.fn((callback) => { callbacks.reconnecting = callback }),
    onreconnected: vi.fn((callback) => { callbacks.reconnected = callback }),
    onclose: vi.fn((callback) => { callbacks.close = callback }),
    start: vi.fn(),
    invoke: vi.fn(),
    stop: vi.fn(),
  }
  return { callbacks, connection }
})

vi.mock('@microsoft/signalr', () => ({
  HubConnectionState: { Disconnected: 'Disconnected' },
  HubConnectionBuilder: class {
    withUrl() { return this }
    withAutomaticReconnect() { return this }
    build() { return mocks.connection }
  },
}))

import { connectChallengeRealtime } from './realtime'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.connection.start.mockResolvedValue(undefined)
  mocks.connection.invoke.mockResolvedValue(undefined)
  mocks.connection.stop.mockResolvedValue(undefined)
})

describe('challenge real-time connection', () => {
  it('updates connection state and refetches only after rejoining', async () => {
    const queryClient = new QueryClient()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
    const onConnectionChange = vi.fn()
    const dispose = connectChallengeRealtime(
      'challenge-1', queryClient, onConnectionChange,
    )
    await vi.waitFor(() => expect(onConnectionChange).toHaveBeenCalledWith(true))

    mocks.callbacks.reconnecting?.()
    expect(onConnectionChange).toHaveBeenLastCalledWith(false)
    await mocks.callbacks.reconnected?.()
    expect(mocks.connection.invoke).toHaveBeenCalledWith('JoinChallenge', 'challenge-1')
    expect(onConnectionChange).toHaveBeenLastCalledWith(true)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['scores', 'challenge-1'] })
    dispose()
  })

  it('does not rejoin or update state after disposal during startup', async () => {
    let finishStart: (() => void) | undefined
    mocks.connection.start.mockReturnValue(new Promise<void>(resolve => { finishStart = resolve }))
    const onConnectionChange = vi.fn()
    const dispose = connectChallengeRealtime(
      'challenge-1', new QueryClient(), onConnectionChange,
    )
    dispose()
    finishStart?.()
    await vi.waitFor(() => expect(mocks.connection.stop).toHaveBeenCalled())
    await Promise.resolve()
    expect(mocks.connection.invoke).not.toHaveBeenCalled()
    expect(onConnectionChange).not.toHaveBeenCalled()
  })

  it('receives user invitations without joining a challenge group', async () => {
    const queryClient = new QueryClient()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
    const onConnectionChange = vi.fn()
    const dispose = connectChallengeRealtime(null, queryClient, onConnectionChange)
    await vi.waitFor(() => expect(onConnectionChange).toHaveBeenCalledWith(true))

    mocks.callbacks['challenge.invitationReceived']?.()
    expect(mocks.connection.invoke).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['invitations'] }))
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['notifications'] })
    dispose()
  })

  it('refreshes transfer and national team data after challenge changes', async () => {
    const queryClient = new QueryClient()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
    const dispose = connectChallengeRealtime('challenge-1', queryClient, vi.fn())
    await vi.waitFor(() => expect(mocks.connection.invoke).toHaveBeenCalled())

    mocks.callbacks['transfer.updated']?.()
    await vi.waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['transfers', 'challenge-1'] }))
    mocks.callbacks['career.clubChanged']?.()
    await vi.waitFor(() => expect(invalidateQueries).toHaveBeenCalledTimes(30))
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['national-teams', 'challenge-1'] })
    dispose()
  })

  it('coalesces a burst of events and cancels pending refreshes on disposal', async () => {
    const queryClient = new QueryClient()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
    const dispose = connectChallengeRealtime('challenge-1', queryClient, vi.fn())
    await vi.waitFor(() => expect(mocks.connection.invoke).toHaveBeenCalled())

    mocks.callbacks['season.updated']?.()
    mocks.callbacks['score.updated']?.()
    mocks.callbacks['challenge.updated']?.()
    await vi.waitFor(() => expect(invalidateQueries).toHaveBeenCalledTimes(15))
    mocks.callbacks['score.updated']?.()
    dispose()
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(invalidateQueries).toHaveBeenCalledTimes(15)
  })
})
