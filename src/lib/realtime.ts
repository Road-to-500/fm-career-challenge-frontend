import {
  HubConnectionBuilder,
  HubConnectionState,
  type HubConnection,
} from '@microsoft/signalr'
import type { QueryClient } from '@tanstack/vue-query'

const apiBase = import.meta.env.VITE_API_BASE_URL ?? ''

export function connectChallengeRealtime(
  challengeId: string,
  queryClient: QueryClient,
  onConnectionChange: (connected: boolean) => void,
): () => void {
  const connection: HubConnection = new HubConnectionBuilder()
    .withUrl(`${apiBase}/hubs/challenges`, { withCredentials: true })
    .withAutomaticReconnect()
    .build()

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] })
    void queryClient.invalidateQueries({ queryKey: ['my-challenges'] })
    void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    void queryClient.invalidateQueries({ queryKey: ['seasons', challengeId] })
    void queryClient.invalidateQueries({ queryKey: ['career', challengeId] })
    void queryClient.invalidateQueries({ queryKey: ['achievements', challengeId] })
    void queryClient.invalidateQueries({ queryKey: ['activity', challengeId] })
    void queryClient.invalidateQueries({ queryKey: ['scores', challengeId] })
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
    'score.updated',
    'checkpoint.updated',
    'bonus.updated',
    'challenge.rulesUpdated',
    'challenge.completed',
    'challenge.updated',
  ]) {
    connection.on(event, refresh)
  }
  connection.onreconnected(async () => {
    onConnectionChange(true)
    await connection.invoke('JoinChallenge', challengeId)
    refresh()
  })
  connection.onclose(() => onConnectionChange(false))

  void connection
    .start()
    .then(() => connection.invoke('JoinChallenge', challengeId))
    .then(() => onConnectionChange(true))
    .catch(() => onConnectionChange(false))

  return () => {
    if (connection.state !== HubConnectionState.Disconnected) void connection.stop()
  }
}
