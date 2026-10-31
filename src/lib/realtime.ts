import {
  HubConnectionBuilder,
  HubConnectionState,
  type HubConnection,
} from '@microsoft/signalr'
import type { QueryClient } from '@tanstack/vue-query'

const apiBase = import.meta.env.VITE_API_BASE_URL ?? ''

export function connectChallengeRealtime(
  challengeId: string | null,
  queryClient: QueryClient,
  onConnectionChange: (connected: boolean) => void,
): () => void {
  let disposed = false
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  const connection: HubConnection = new HubConnectionBuilder()
    .withUrl(`${apiBase}/hubs/challenges`, { withCredentials: true })
    .withAutomaticReconnect()
    .build()

  const refresh = () => {
    if (disposed) return
    void queryClient.invalidateQueries({ queryKey: ['me'] })
    void queryClient.invalidateQueries({ queryKey: ['my-challenges'] })
    void queryClient.invalidateQueries({ queryKey: ['invitations'] })
    void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    if (challengeId) {
      for (const key of ['challenge', 'seasons', 'career', 'national-teams', 'transfers', 'rules', 'competitions', 'challenge-invites', 'achievements', 'activity', 'scores']) {
        void queryClient.invalidateQueries({ queryKey: [key, challengeId] })
      }
    }
  }

  const scheduleRefresh = () => {
    if (disposed || refreshTimer !== undefined) return
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined
      refresh()
    }, 100)
  }

  for (const event of [
    'achievement.created',
    'achievement.updated',
    'achievement.deleted',
    'season.updated',
    'season.completed',
    'season.reopened',
    'career.clubChanged',
    'transfer.created',
    'transfer.updated',
    'transfer.deleted',
    'score.updated',
    'checkpoint.updated',
    'bonus.updated',
    'challenge.rulesUpdated',
    'challenge.completed',
    'challenge.updated',
    'challenge.invitationReceived',
    'notification.created',
  ]) {
    connection.on(event, scheduleRefresh)
  }
  connection.onreconnecting(() => {
    if (!disposed) onConnectionChange(false)
  })
  connection.onreconnected(async () => {
    try {
      if (challengeId) await connection.invoke('JoinChallenge', challengeId)
      if (!disposed) {
        onConnectionChange(true)
        refresh()
      }
    } catch (error) {
      if (!disposed) {
        console.error('Could not rejoin the challenge after reconnecting.', error)
        onConnectionChange(false)
      }
    }
  })
  connection.onclose(() => {
    if (!disposed) onConnectionChange(false)
  })

  void connection
    .start()
    .then(() => disposed || !challengeId ? undefined : connection.invoke('JoinChallenge', challengeId))
    .then(() => {
      if (!disposed) onConnectionChange(true)
    })
    .catch(error => {
      if (!disposed) {
        console.error('Could not connect to challenge updates.', error)
        onConnectionChange(false)
      }
    })

  return () => {
    disposed = true
    clearTimeout(refreshTimer)
    if (connection.state !== HubConnectionState.Disconnected) void connection.stop()
  }
}
