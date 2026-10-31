import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { shallowMount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DashboardView from './DashboardView.vue'

const mocks = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('../lib/api', () => ({
  api: mocks.api,
  ApiError: class extends Error { status = 500 },
  signIn: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('../lib/realtime', () => ({ connectChallengeRealtime: () => () => {} }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

let wrapper: ReturnType<typeof shallowMount> | undefined
let client: QueryClient | undefined

function mountDashboard(challenges: object[] | Error, notifications: Record<string, unknown>[] = []) {
  mocks.api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/api/me') return { id: 'user-1', displayName: 'Manager', avatarUrl: null, hasCompletedOnboarding: true }
    if (path === '/api/me/challenges') {
      if (challenges instanceof Error) throw challenges
      return challenges
    }
    if (path === '/api/me/invitations') return []
    if (path === '/api/me/notifications') return notifications.map(item => ({ ...item }))
    if (path.startsWith('/api/me/notifications/') && init?.method === 'PATCH') {
      const id = path.split('/').at(-2)
      const index = notifications.findIndex(item => item.id === id)
      if (index < 0) throw new Error(`Unknown notification: ${id}`)
      notifications[index] = { ...notifications[index], readAt: new Date().toISOString() }
      return undefined
    }
    if (path === '/api/challenges/pending/invites' && init?.method === 'POST')
      return { url: 'https://example.test/dashboard?invite=secret' }
    throw new Error(`Unexpected request: ${path}`)
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  wrapper = shallowMount(DashboardView, {
    global: {
      plugins: [createPinia(), [VueQueryPlugin, { queryClient: client }]],
      stubs: { Dialog: { props: ['visible'], template: '<div v-if="visible"><slot /></div>' } },
    },
  })
  return wrapper
}

afterEach(() => {
  wrapper?.unmount()
  client?.clear()
  mocks.api.mockReset()
  vi.unstubAllGlobals()
})

describe('dashboard data and invitations', () => {
  it('does not present unavailable challenge statistics as zero', async () => {
    const view = mountDashboard(new Error('Network failed'))
    await vi.waitFor(() => expect(view.text()).toContain('Your challenges could not be loaded'))
    expect(view.findAll('.stat-value').map(item => item.text())).toEqual(['—', '—', '—', '—'])
  })

  it('counts completed challenges separately from archived unfinished ones', async () => {
    const base = { targetPoints: 500, myScore: 0, opponentScore: 0, myTrainerName: 'Manager', opponentName: null, role: 'Administrator' }
    const view = mountDashboard([
      { ...base, id: 'pending', name: 'Pending', status: 'PendingPlayers', statusBeforeArchive: null, currentSeason: '2028/29' },
      { ...base, id: 'archived', name: 'Archived unfinished', status: 'Archived', statusBeforeArchive: 'Active', currentSeason: null },
      { ...base, id: 'complete', name: 'Archived completed', status: 'Archived', statusBeforeArchive: 'Completed', currentSeason: null },
    ])
    await vi.waitFor(() => expect(view.text()).toContain('Archived completed'))
    expect(view.findAll('.stat-value').map(item => item.text())).toEqual(['3', '0', '1', '1'])
    expect(view.text()).toContain('Latest: 2028/29')
    expect(view.text()).toContain('No season recorded')
    expect(view.findAll('[aria-label^="Create invite"]').length).toBe(1)
  })

  it('keeps the generated invitation visible when clipboard access fails', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Permission denied')) } })
    const view = mountDashboard([{
      id: 'pending', name: 'Pending', status: 'PendingPlayers', statusBeforeArchive: null, role: 'Administrator',
      targetPoints: 500, myScore: 0, opponentScore: 0, myTrainerName: 'Manager', opponentName: null, currentSeason: null,
    }])
    await vi.waitFor(() => expect(view.find('[aria-label="Create invite for Pending"]').exists()).toBe(true))
    await view.find('[aria-label="Create invite for Pending"]').trigger('click')
    await vi.waitFor(() => expect(view.text()).toContain('Copy it manually below'))
    expect(view.html()).toContain('https://example.test/dashboard?invite=secret')
  })

  it('uses the challenge target for its progress label', async () => {
    const view = mountDashboard([{
      id: 'target', name: 'Target test', status: 'Active', statusBeforeArchive: null, role: 'Administrator',
      targetPoints: 250, myScore: 100, opponentScore: 0, myTrainerName: 'Manager', opponentName: null, currentSeason: null,
    }])
    await vi.waitFor(() => expect(view.text()).toContain('Journey to 250'))
    expect(view.text()).toContain('40%')
  })

  it('shows drafts in the dashboard without an invitation action', async () => {
    const view = mountDashboard([{
      id: 'draft', name: 'Draft challenge', status: 'Draft', statusBeforeArchive: null, role: 'Administrator',
      targetPoints: 500, myScore: 0, opponentScore: 0, myTrainerName: 'Manager', opponentName: null, currentSeason: null,
    }])
    await vi.waitFor(() => expect(view.text()).toContain('Draft challenge'))
    expect(view.find('[aria-label="Create invite for Draft challenge"]').exists()).toBe(false)
    expect(view.findAll('.stat-value').map(item => item.text())).toEqual(['1', '0', '0', '0'])
  })

  it('marks a persisted notification as read and keeps it read after reloading the dashboard', async () => {
    const notifications = [{
      id: 'notification-1',
      title: 'Your invitation was accepted',
      message: 'A rival joined your challenge.',
      createdAt: '2026-10-30T09:00:00Z',
      readAt: null,
    }]
    const view = mountDashboard([], notifications)
    await vi.waitFor(() => expect(view.find('[aria-label="Notifications, 1 unread"]').exists()).toBe(true))
    await view.find('[aria-label="Notifications, 1 unread"]').trigger('click')
    await vi.waitFor(() => expect(view.text()).toContain('Your invitation was accepted'))
    await view.find('.notification-item .link-button').trigger('click')
    await vi.waitFor(() => expect(view.find('.notification-item .link-button').exists()).toBe(false))
    expect(mocks.api).toHaveBeenCalledWith('/api/me/notifications/notification-1/read', { method: 'PATCH' })

    view.unmount()
    client?.clear()
    const reloaded = mountDashboard([], notifications)
    await vi.waitFor(() => expect(reloaded.find('[aria-label="Notifications, 0 unread"]').exists()).toBe(true))
    await reloaded.find('[aria-label="Notifications, 0 unread"]').trigger('click')
    await vi.waitFor(() => expect(reloaded.text()).toContain('Your invitation was accepted'))
    expect(reloaded.find('.notification-item .link-button').exists()).toBe(false)
  })
})
