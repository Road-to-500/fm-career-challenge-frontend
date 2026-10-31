import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { shallowMount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api'
import DashboardView from './DashboardView.vue'

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  signOut: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  route: { query: {} as Record<string, string>, hash: '' },
}))
vi.mock('../lib/api', () => ({
  api: mocks.api,
  ApiError: class extends Error {
    constructor(message: string, public status = 500) { super(message) }
  },
  signIn: vi.fn(),
  signOut: mocks.signOut,
}))
vi.mock('../lib/realtime', () => ({ connectChallengeRealtime: () => () => {} }))
vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    resolve: ({ path, query }: { path: string; query: Record<string, string | undefined> }) => {
      const parameters = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined))
      return { href: parameters.size ? `${path}?${parameters}` : path }
    },
  }),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

let wrapper: ReturnType<typeof shallowMount> | undefined
let client: QueryClient | undefined
let profileFailure: Error | undefined

function mountDashboard(challenges: object[] | Error, notifications: Record<string, unknown>[] = [], invitations: object[] = []) {
  mocks.api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/api/me') {
      if (profileFailure) throw profileFailure
      return { id: 'user-1', displayName: 'Manager', avatarUrl: null, hasCompletedOnboarding: true }
    }
    if (path === '/api/me/challenges') {
      if (challenges instanceof Error) throw challenges
      return challenges
    }
    if (path === '/api/me/invitations') return invitations
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
  mocks.signOut.mockReset()
  mocks.push.mockReset()
  mocks.replace.mockReset()
  mocks.route.query = {}
  mocks.route.hash = ''
  profileFailure = undefined
  vi.unstubAllGlobals()
})

describe('dashboard data and invitations', () => {
  it('shows neutral initial session loading without personal chrome or create actions', async () => {
    const view = mountDashboard([])
    expect(view.find('.sidebar').exists()).toBe(false)
    expect(view.find('.stats-grid').exists()).toBe(false)
    expect(view.text()).not.toContain('New challenge')
    expect(view.find('.loading-state').exists()).toBe(true)
    await vi.waitFor(() => expect(view.find('.sidebar').exists()).toBe(true))
  })

  it('does not classify forbidden as anonymous', async () => {
    profileFailure = new ApiError('Forbidden', 403)
    const view = mountDashboard([])
    await vi.waitFor(() => expect(view.text()).toContain('Access to your workspace was denied.'))
    expect(view.find('.landing-page').exists()).toBe(false)
    expect(view.find('.stats-grid').exists()).toBe(false)
    expect(view.find('.sidebar').exists()).toBe(false)
  })

  it('removes cached workspace chrome and dialogs after a forbidden profile refetch', async () => {
    const view = mountDashboard([])
    await vi.waitFor(() => expect(view.find('.sidebar').exists()).toBe(true))
    await view.findAll('button').find(button => button.text() === 'Edit profile')!.trigger('click')
    expect(view.find('#profile-name').exists()).toBe(true)
    profileFailure = new ApiError('Forbidden', 403)
    await client!.invalidateQueries({ queryKey: ['me'] })
    await vi.waitFor(() => expect(view.text()).toContain('Access to your workspace was denied.'))
    expect(view.find('.sidebar').exists()).toBe(false)
    expect(view.find('#profile-name').exists()).toBe(false)
    expect(view.find('.landing-page').exists()).toBe(false)
  })

  it('locks explicit sign-out and retains the workspace with an honest error when it fails', async () => {
    const view = mountDashboard([])
    await vi.waitFor(() => expect(view.find('.sidebar').exists()).toBe(true))
    let reject!: (error: Error) => void
    mocks.signOut.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail }))
    const button = view.findAll('button').find(button => button.text() === 'Sign out')!
    await button.trigger('click')
    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
    reject(new Error('Logout unavailable'))
    await vi.waitFor(() => expect(view.text()).toContain('Logout unavailable'))
    expect(view.find('.sidebar').exists()).toBe(true)
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it.each(['accept', 'decline'])('locks both invitation actions during %s and never invents success on failure', async operation => {
    const view = mountDashboard([], [], [{ id: 'invite-1', challengeName: 'A race', inviterName: 'Rival' }])
    await vi.waitFor(() => expect(view.find('.accept-button').exists()).toBe(true))
    const original = mocks.api.getMockImplementation()!
    let reject!: (error: Error) => void
    mocks.api.mockImplementation((path, init) => path === `/api/me/invitations/invite-1/${operation}`
      ? new Promise((_resolve, fail) => { reject = fail }) : original(path, init))
    const buttons = view.findAll('.invitation-row button')
    await buttons[operation === 'accept' ? 0 : 1]!.trigger('click')
    expect(buttons.every(button => button.attributes('disabled') !== undefined)).toBe(true)
    await buttons[0]!.trigger('click')
    await buttons[1]!.trigger('click')
    expect(mocks.api.mock.calls.filter(([path]) => path.includes('/invite-1/'))).toHaveLength(1)
    reject(new Error('Invitation unavailable'))
    await vi.waitFor(() => expect(view.text()).toContain('Invitation unavailable'))
    expect(view.text()).not.toContain('Invitation accepted.')
    expect(buttons.every(button => button.attributes('disabled') === undefined)).toBe(true)
  })

  it('locks a pending join and offers the confirmed destination only after success', async () => {
    mocks.route.query = { view: 'invitations', invite: 'join-token' }
    const view = mountDashboard([])
    await vi.waitFor(() => expect(view.find('.join-form').exists()).toBe(true))
    const original = mocks.api.getMockImplementation()!
    let resolve!: (value: { challengeId: string }) => void
    mocks.api.mockImplementation((path, init) => path === '/api/challenges/join'
      ? new Promise(done => { resolve = done }) : original(path, init))
    await view.get('.join-form').trigger('submit')
    await view.get('.join-form').trigger('submit')
    expect(mocks.api.mock.calls.filter(([path]) => path === '/api/challenges/join')).toHaveLength(1)
    expect(view.text()).not.toContain('Invitation accepted.')
    resolve({ challengeId: 'joined-1' })
    await vi.waitFor(() => expect(view.text()).toContain('Invitation accepted.'))
    await view.findAll('button').find(button => button.text().includes('Open joined challenge'))!.trigger('click')
    expect(mocks.push).toHaveBeenCalledWith('/challenges/joined-1')
  })

  it('does not present unavailable challenge statistics as zero', async () => {
    const view = mountDashboard(new Error('Network failed'))
    await vi.waitFor(() => expect(view.text()).toContain('Your challenges could not be loaded'))
    expect(view.findAll('.stat-value').map(item => item.text())).toEqual(['—', '—', '—', '—'])
  })

  it('shows a dedicated signed-out landing page without personal workspace actions or counters', async () => {
    profileFailure = new ApiError('Not signed in', 401)
    const view = mountDashboard([])
    await vi.waitFor(() => expect(view.text()).toContain('Your Football Manager story.'))
    expect(view.find('.landing-page .provider-button').exists()).toBe(true)
    expect(view.find('.landing-progress').exists()).toBe(false)
    expect(view.text()).toContain('500 confirmed points')
    expect(view.find('.sidebar').exists()).toBe(false)
    expect(view.find('.stats-grid').exists()).toBe(false)
    expect(view.text()).not.toContain('New challenge')
    expect(view.text()).not.toContain('TOTAL CHALLENGES')
    expect(view.text()).not.toContain('CAREER POINTS')
  })

  it('keeps invitations visible in the sign-in landing message', async () => {
    profileFailure = new ApiError('Not signed in', 401)
    mocks.route.query = { invite: 'invite-token' }
    const view = mountDashboard([])
    await vi.waitFor(() => expect(view.text()).toContain('You have an invitation waiting.'))
    expect(view.text()).not.toContain('New challenge')
    expect(view.get('.landing-brand').attributes('href')).toBe('/dashboard?invite=invite-token')
    await view.get('.landing-brand').trigger('click')
    expect(mocks.push).toHaveBeenCalledWith({ path: '/dashboard', query: { invite: 'invite-token' }, hash: '' })
  })

  it('maps legacy dashboard fragments to explicit workspace routes', async () => {
    mocks.route.hash = '#active-challenges'
    mountDashboard([])
    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith({
      path: '/dashboard', query: { view: 'challenges' }, hash: '',
    }))
  })

  it('preserves invitation tokens when navigating to a dashboard view', async () => {
    mocks.route.query = { invite: 'invite-token' }
    const view = mountDashboard([])
    await vi.waitFor(() => expect(view.find('.main-nav').exists()).toBe(true))
    await view.findAll('.main-nav button')[1].trigger('click')
    expect(mocks.push).toHaveBeenCalledWith({
      path: '/dashboard', query: { invite: 'invite-token', view: 'challenges' }, hash: '',
    })
  })

  it('does not render a signed-out landing page for an API failure', async () => {
    profileFailure = new ApiError('Service unavailable', 503)
    const view = mountDashboard([])
    await vi.waitFor(() => expect(view.text()).toContain('We could not load your workspace.'))
    expect(view.find('.landing-page').exists()).toBe(false)
    expect(view.find('.sidebar').exists()).toBe(false)
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
