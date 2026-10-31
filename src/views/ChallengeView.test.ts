import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChallengeView from './ChallengeView.vue'

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  connectRealtime: vi.fn(),
  stopRealtime: vi.fn(),
}))

vi.mock('../lib/api', () => ({ api: mocks.api, ApiError: class extends Error { constructor(message: string, public status: number) { super(message) } }, signIn: vi.fn() }))
vi.mock('../lib/realtime', () => ({ connectChallengeRealtime: mocks.connectRealtime }))
const testRoute = reactive({ params: { id: 'challenge-1' }, path: '/challenges/challenge-1', query: {} as Record<string, string> })
vi.mock('vue-router', () => ({
  useRoute: () => testRoute,
  useRouter: () => ({
    push: vi.fn(async (location) => { if (typeof location !== 'string') testRoute.query = location.query }),
    replace: vi.fn(async (location) => { testRoute.query = location.query }),
  }),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const dashboard = {
  challenge: { id: 'challenge-1', name: 'Test challenge', targetPoints: 500, startSeasonYear: 2026, status: 'Active', isCorrectionMode: false, version: 3 },
  participants: [{ id: 'player-1', userId: 'user-1', displayName: 'Manager', trainerName: 'Manager', score: 0, isCurrentUser: true, role: 'Administrator' }],
}

const score = {
  participants: [], series: [], totals: [], breakdown: [], commonSeasonIndex: null,
  currencyMismatchSeasons: [], victoryPending: true, pendingVictorySeasonIndex: 0,
}

const failures = new Set<string>()
let achievements: object[] = []
let clubs: object[] = []
let catalogClubs: object[] = []
let seasons: object[] = []
let competitions: object[] = []
let rules: object[] = []
let nationalTeams: object[] = []
let nationalMilestoneSeason: number | null = null
let nationalMilestoneValid = false
let careerRequiresStartingStatus = false
let careerStartingStatus: 'Unemployed' | 'Club' | null = null
let wrapper: ReturnType<typeof shallowMount> | undefined
let client: QueryClient | undefined

function mountChallenge() {
  mocks.connectRealtime.mockImplementation(() => mocks.stopRealtime)
  mocks.api.mockImplementation(async (path: string, init?: RequestInit) => {
    const resource = path.split('/').at(-1) ?? ''
    if (failures.has(resource)) throw new Error(`${resource} unavailable`)
    if (resource === 'dashboard') return dashboard
    if (resource === 'scores') return score
    if (resource === 'seasons') return seasons
    if (resource === 'career') return {
      clubs, nationalTeam20MatchSeasonIndex: nationalMilestoneSeason, nationalTeamMilestoneVersion: 0,
      nationalTeamMilestoneValid: nationalMilestoneValid,
      threeContinentsSeasonIndex: null, threeContinentsMilestoneVersion: 3, threeContinentsMilestoneValid: false,
      requiresStartingStatus: careerRequiresStartingStatus, startingStatus: careerStartingStatus, startingStintId: null,
    }
    if (path.endsWith('/career/start') && init?.method === 'PUT') {
      careerStartingStatus = JSON.parse(String(init.body)).status
      return undefined
    }
    if (path.startsWith('/api/clubs?')) return catalogClubs
    if (resource === 'geography') return {
      countries: [{ code: 'PT', name: 'Portugal', continentCode: 'EU' }],
      continents: [{ code: 'EU', name: 'Europe' }],
    }
    if (path.endsWith('/rules/preview')) return { version: 2, effectiveSeasonIndex: 0, impact: [], beforeWinner: null, afterWinner: null }
    if (resource === 'rules') return { version: 1, challengeVersion: 3, rules, versions: [], history: [] }
    if (resource === 'achievements') return achievements
    if (resource === 'competitions') return competitions
    if (resource === 'national-teams') return nationalTeams
    return []
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  wrapper = shallowMount(ChallengeView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
      stubs: {
        Dialog: { props: ['visible'], template: '<div v-if="visible"><slot /></div>' },
        InputText: { props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
        InputNumber: { props: ['modelValue'], emits: ['update:modelValue'], template: '<input type="number" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value === \'\' ? null : Number($event.target.value))" />' },
        SeasonSelect: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: '<select :value="modelValue ?? \'\'" @change="$emit(\'update:modelValue\', $event.target.value === \'\' ? null : Number($event.target.value))"><option value="">Not recorded</option><option v-for="index in 101" :key="index" :value="index - 1">{{ index }}</option></select>',
        },
        Tag: { props: ['value'], template: '<span>{{ value }}</span>' },
      },
    },
  })
  return wrapper
}

async function selectTab(name: string) {
  const tab = wrapper!.findAll('nav button').find(button => button.text().includes(name))
  expect(tab).toBeDefined()
  await tab!.trigger('click')
  await nextTick()
}

afterEach(() => {
  wrapper?.unmount()
  client?.clear()
  failures.clear()
  achievements = []
  clubs = []
  catalogClubs = []
  seasons = []
  competitions = []
  rules = []
  nationalTeams = []
  nationalMilestoneSeason = null
  nationalMilestoneValid = false
  careerRequiresStartingStatus = false
  careerStartingStatus = null
  mocks.api.mockReset()
  mocks.connectRealtime.mockReset()
  mocks.stopRealtime.mockReset()
  testRoute.query = {}
})

describe('challenge loading and errors', () => {
  it('does not subscribe to a challenge during loading or after access fails', async () => {
    const view = mountChallenge()
    expect(mocks.connectRealtime).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(mocks.connectRealtime).toHaveBeenCalledTimes(1))
    failures.add('dashboard')
    await client!.invalidateQueries({ queryKey: ['challenge', 'challenge-1'] })
    await vi.waitFor(() => expect(view.text()).toContain('dashboard unavailable'))
    expect(mocks.stopRealtime).toHaveBeenCalled()
    expect(view.find('.connection-indicator').exists()).toBe(false)
  })
  it.each(['PendingPlayers', 'Active', 'Completed', 'Archived'])('retains a URL-backed Seasons view in %s without exposing ineligible edits', async status => {
    dashboard.challenge.status = status
    careerRequiresStartingStatus = true
    testRoute.query = { section: 'seasons' }
    try {
      const view = mountChallenge()
      await vi.waitFor(() => expect(view.text()).toContain('No seasons recorded yet.'))
      expect(testRoute.query.section).toBe('seasons')
      expect(view.find('button-stub[label="Update season"]').exists()).toBe(false)
    } finally { dashboard.challenge.status = 'Active' }
  })

  it.each(['PendingPlayers', 'Active'])('blocks country evidence in %s before career start without blocking initial club setup', async status => {
    dashboard.challenge.status = status
    careerRequiresStartingStatus = true
    clubs = [{ id: 'club-1', clubName: 'Initial club', countryCode: 'PT', initialDivisionLevel: 2, officialMatches: 0, startSeasonIndex: 0 }]
    try {
      const view = mountChallenge()
      await vi.waitFor(() => expect(view.text()).toContain('Set up your career start'))
      await selectTab('Career')
      expect(view.find('[aria-label="Edit Initial club"]').exists()).toBe(true)
      expect(view.find('[aria-label="Set country milestone for Initial club"]').exists()).toBe(false)
      expect(view.find('.calculated-milestones').exists()).toBe(false)
    } finally { dashboard.challenge.status = 'Active' }
  })

  it('keeps country evidence writable for an active legacy career and closes stale dialogs on archive', async () => {
    clubs = [{ id: 'club-1', clubName: 'Initial club', countryCode: 'PT', initialDivisionLevel: 2, officialMatches: 20, startSeasonIndex: 0 }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Career')
    await view.get('[aria-label="Set country milestone for Initial club"]').trigger('click')
    expect(view.find('form').text()).toContain('Country 20th-match season')
    client!.setQueryData(['challenge', 'challenge-1'], { ...dashboard, challenge: { ...dashboard.challenge, status: 'Archived' } })
    await vi.waitFor(() => expect(view.find('form').exists()).toBe(false))
    expect(testRoute.query.section).toBe('career')
    dashboard.challenge.status = 'Active'
  })

  it('retains read navigation but hides gameplay entry until career start is recorded', async () => {
    careerRequiresStartingStatus = true
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Set up your career start'))
    const navText = view.findAll('nav button').map(button => button.text()).join(' ')
    expect(navText).toContain('Overview')
    expect(navText).toContain('Career')
    expect(navText).toContain('Rules')
    expect(navText).toContain('Seasons')
    expect(navText).toContain('Achievements')
    expect(navText).toContain('Transfers')
    expect(view.find('button-stub[label="Update season"]').exists()).toBe(false)
    expect(view.find('.career-setup-banner button-stub.primary-button').exists()).toBe(true)
  })

  it('unlocks gameplay after saving an unemployed career start', async () => {
    careerRequiresStartingStatus = true
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Set up your career start'))
    await selectTab('Career')
    await view.find('button-stub[label="Set career start"]').trigger('click')
    const form = view.findAll('form').find(item => item.text().includes('Starting situation'))!
    await form.get('select').setValue('Unemployed')
    await form.trigger('submit')
    await vi.waitFor(() => expect(view.findAll('nav button').map(button => button.text()).join(' ')).toContain('Seasons'))
    expect(careerStartingStatus).toBe('Unemployed')
    expect(view.findAll('nav button').map(button => button.text()).join(' ')).toContain('Achievements')
  })

  it('lets a manager add the required starting club before saving career start', async () => {
    careerRequiresStartingStatus = true
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Set up your career start'))
    await selectTab('Career')
    await view.find('button-stub[label="Set career start"]').trigger('click')
    const startForm = view.findAll('form').find(item => item.text().includes('Starting situation'))!
    await startForm.get('select').setValue('Club')
    await startForm.find('button-stub[label="Add starting club"]').trigger('click')
    expect(view.findAll('form')).toHaveLength(1)
    expect(view.find('form').text()).toContain('Search club catalog')
  })

  it('keeps completed legacy careers readable without a required career-start value', async () => {
    dashboard.challenge.status = 'Completed'
    careerRequiresStartingStatus = true
    try {
      const view = mountChallenge()
      await vi.waitFor(() => expect(view.text()).toContain('Challenge complete.'))
      expect(view.findAll('nav button').map(button => button.text()).join(' ')).toContain('Seasons')
      await selectTab('Seasons')
      expect(view.text()).toContain('No seasons recorded yet.')
      expect(view.text()).not.toContain('Record a season')
    } finally {
      dashboard.challenge.status = 'Active'
    }
  })

  it('does not expose administrator lifecycle actions to a participant', async () => {
    dashboard.challenge.status = 'Completed'
    dashboard.participants[0].role = 'Participant'
    try {
      const view = mountChallenge()
      await vi.waitFor(() => expect(view.text()).toContain('Challenge complete.'))
      expect(view.text()).not.toContain('Archive challenge')
      expect(view.text()).not.toContain('Reopen for corrections')
    } finally {
      dashboard.challenge.status = 'Active'
      dashboard.participants[0].role = 'Administrator'
    }
  })

  it('confirms reopening a completed challenge for corrections', async () => {
    dashboard.challenge.status = 'Completed'
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    try {
      const view = mountChallenge()
      await vi.waitFor(() => expect(view.text()).toContain('Challenge complete.'))
      const reopen = view.find('.winner-banner .text-action')
      expect(reopen).toBeDefined()
      await reopen!.trigger('click')
      await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledWith(
        '/api/challenges/challenge-1/reopen',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ confirm: true }) }),
      ))
      expect(confirm).toHaveBeenCalledWith(
        'Reopen this completed challenge for corrections? The winner will be cleared until corrections are finished.',
      )
    } finally {
      confirm.mockRestore()
      dashboard.challenge.status = 'Active'
    }
  })

  it('confirms finishing corrections on an active challenge', async () => {
    dashboard.challenge.status = 'Active'
    dashboard.challenge.isCorrectionMode = true
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    try {
      const view = mountChallenge()
      await vi.waitFor(() => expect(view.text()).toContain('Correction mode.'))
      const finish = view.find('.winner-banner .text-action')
      expect(finish).toBeDefined()
      await finish!.trigger('click')
      await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledWith(
        '/api/challenges/challenge-1/finish-corrections',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ confirm: true }) }),
      ))
      expect(confirm).toHaveBeenCalledWith('Finish corrections and recalculate the final result?')
    } finally {
      confirm.mockRestore()
      dashboard.challenge.isCorrectionMode = false
    }
  })

  it('allows rules configuration and publication but not gameplay in a draft', async () => {
    dashboard.challenge.status = 'Draft'
    try {
      const view = mountChallenge()
      await vi.waitFor(() => expect(view.text()).toContain('Configure the rules, then publish'))
      expect(view.text()).not.toContain('Invite your rival')
      expect(view.text()).not.toContain('Add a club')
      const publish = view.find('button-stub[label="Publish draft"]')
      expect(publish.exists()).toBe(true)
      await publish.trigger('click')
      await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledWith(
        '/api/challenges/challenge-1/publish',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ version: 3 }) }),
      ))
      await selectTab('Rules')
      expect(view.text()).toContain('Custom achievement')
    } finally {
      dashboard.challenge.status = 'Active'
    }
  })

  it('does not present failed season and career queries as empty records and can retry', async () => {
    failures.add('seasons')
    failures.add('career')
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Your season and career could not be loaded'))
    expect(view.text()).not.toContain('No clubs in your timeline')
    expect(view.text()).toContain('Victory is pending from 2026/27')
    await selectTab('Seasons')
    expect(view.text()).toContain('Could not load seasons')
    expect(view.text()).not.toContain('No seasons recorded yet')

    failures.delete('seasons')
    const retry = view.findAll('button').find(button => button.text() === 'Try again')
    await retry!.trigger('click')
    await vi.waitFor(() => expect(view.text()).toContain('No seasons recorded yet'))
  })

  it('uses the stored target in the challenge overview and rules', async () => {
    dashboard.challenge.targetPoints = 250
    try {
      const view = mountChallenge()
      await vi.waitFor(() => expect(view.text()).toContain('Progress to 250'))
      await selectTab('Rules')
      expect(view.text()).toContain('250 confirmed points')
    } finally {
      dashboard.challenge.targetPoints = 500
    }
  })

  it('shows errors rather than empty achievement or activity lists', async () => {
    failures.add('achievements')
    failures.add('activity')
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Achievements')
    await vi.waitFor(() => expect(view.text()).toContain('Could not load achievements'))
    expect(view.text()).not.toContain('GOALS IN THIS RULEBOOK')
    await selectTab('Activity')
    await vi.waitFor(() => expect(view.text()).toContain('Could not load activity'))
    expect(view.text()).not.toContain('The story starts here')
    await flushPromises()
  })

  it('combines achievement filters and clears them', async () => {
    achievements = [
      { code: 'G001', name: 'League champion', description: 'Win a league', category: 'Domestic', frequency: 'Season',
        points: 18, isEnabled: true, isAutomatic: false, claims: [{ id: 'one', seasonIndex: 0 }] },
      { code: 'G042', name: 'Club journey', description: 'Manage three clubs', category: 'Career', frequency: 'Once',
        points: 8, isEnabled: true, isAutomatic: true, automaticSeasonIndex: 1, claims: [] },
      { code: 'G050', name: 'Promotion path', description: 'Advance through divisions', category: 'Career', frequency: 'PerClub',
        points: 12, isEnabled: false, isAutomatic: false, claims: [] },
    ]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Achievements')
    await vi.waitFor(() => expect(view.findAll('.achievement-card')).toHaveLength(3))
    const filters = view.find('.achievement-filters')
    const [frequency, status, points] = filters.findAll('select')
    await status!.setValue('Recorded')
    expect(view.findAll('.achievement-card')).toHaveLength(2)
    await frequency!.setValue('Once')
    expect(view.findAll('.achievement-card')).toHaveLength(1)
    expect(view.find('.achievement-card').text()).toContain('Club journey')
    await points!.setValue('12')
    expect(view.find('[role="status"]').text()).toContain('No achievements match these filters')
    await filters.find('button').trigger('click')
    expect(view.findAll('.achievement-card')).toHaveLength(3)
    await filters.find('input').setValue('G050')
    expect(view.find('.achievement-card').text()).toContain('Promotion path')
    await status!.setValue('Disabled')
    expect(view.findAll('.achievement-card')).toHaveLength(1)
    await filters.find('button').trigger('click')
    const category = view.findAll('.category-filter button').find(button => button.text() === 'Career')!
    await category.trigger('click')
    expect(category.attributes('aria-pressed')).toBe('true')
    expect(view.findAll('.achievement-card')).toHaveLength(2)
  })

  it('asks for league participation when recording a league title', async () => {
    achievements = [{
      code: 'G001', name: 'First Division Champion', description: 'Win the first division',
      category: 'Domestic', frequency: 'Season', points: 18, isEnabled: true, isAutomatic: false, claims: [],
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Achievements')
    await vi.waitFor(() => expect(view.text()).toContain('First Division Champion'))
    await view.find('.achievement-add').trigger('click')
    expect(view.text()).toContain('League matches you managed')
    expect(view.text()).toContain('Total league matches')
    expect(view.text()).toContain('I was in charge at the end of the league competition.')
  })

  it('asks for survival and promotion conditions for a newly promoted club', async () => {
    achievements = [{
      code: 'G011', name: 'First-Division Survival', description: 'Stay in the first division',
      category: 'Domestic', frequency: 'ClubSeason', points: 4, isEnabled: true, isAutomatic: false, claims: [],
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Achievements')
    await vi.waitFor(() => expect(view.text()).toContain('First-Division Survival'))
    await view.find('.achievement-add').trigger('click')
    expect(view.text()).toContain('League matches you managed')
    expect(view.text()).toContain("This was the club's first season after promotion to the first division.")
    expect(view.text()).toContain('The club remained in the first division.')
    expect(view.text()).not.toContain('I was in charge at the end of the league competition.')
  })

  it.each([
    ['G025', "This was the club's first continental main-phase participation."],
    ['G026', 'The club previously reached a continental main phase.'],
    ['G027', "This was the club's first main-phase participation in the top-tier continental competition."],
  ])('asks for main-phase and %s-specific confirmation', async (code, condition) => {
    achievements = [{
      code, name: code, description: 'Continental participation',
      category: 'Continental', frequency: 'PerClub', points: 4, isEnabled: true, isAutomatic: false, claims: [],
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Achievements')
    await vi.waitFor(() => expect(view.find('.achievement-add').exists()).toBe(true))
    await view.find('.achievement-add').trigger('click')
    expect(view.text()).toContain("The club reached the competition's main group or league phase.")
    expect(view.text()).toContain(condition)
    expect(view.findAll('input[type="checkbox"][required]')).toHaveLength(2)
  })

  it.each([
    ['G040', 'This was my first major trophy with this club.', 'The trophy was not a super cup.'],
    ['G048', 'I had won at least ten major trophies by this season.', ''],
    ['G050', 'Season managed in the third division', 'I stayed with the same club from the third division until reaching the first.'],
    ['G051', 'I won the official Football Manager Manager of the Year award.', ''],
  ])('asks for %s achievement evidence', async (code, condition, secondCondition) => {
    achievements = [{
      code, name: code, description: 'Career achievement',
      category: 'Career', frequency: code === 'G051' ? 'Season' : code === 'G048' ? 'Once' : 'PerClub',
      points: 4, isEnabled: true, isAutomatic: false, claims: [],
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Achievements')
    await vi.waitFor(() => expect(view.find('.achievement-add').exists()).toBe(true))
    await view.find('.achievement-add').trigger('click')
    expect(view.text()).toContain(condition)
    if (secondCondition) expect(view.text()).toContain(secondCondition)
    if (code === 'G040' || code === 'G050') expect(view.text()).toContain('Club (required)')
  })

  it('submits the international competition type and result', async () => {
    achievements = [{
      code: 'G034', name: 'World champion', description: 'Win the national team World Cup',
      category: 'International', frequency: 'Season', points: 25, isEnabled: true, isAutomatic: false, claims: [],
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Achievements')
    await vi.waitFor(() => expect(view.find('.achievement-add').exists()).toBe(true))
    await view.find('.achievement-add').trigger('click')
    const form = view.findAll('form').find(item => item.text().includes('Competition type'))!
    const selects = form.findAll('select')
    await selects[1]!.setValue('NationalWorld')
    await selects[2]!.setValue('Winner')
    await form.trigger('submit')
    await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledWith(
      '/api/challenges/challenge-1/achievement-claims',
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('"competitionResultKind":"NationalWorld"') }),
    ))
    const call = mocks.api.mock.calls.find(([path, options]) =>
      path === '/api/challenges/challenge-1/achievement-claims' && options?.method === 'POST')
    expect(JSON.parse(call![1].body).competitionResultStage).toBe('Winner')
  })

  it('asks for both clubs and continental title confirmation for G032', async () => {
    achievements = [{
      code: 'G032', name: 'Continental titles with two clubs', description: 'Win with two clubs',
      category: 'Continental', frequency: 'Once', points: 10, isEnabled: true, isAutomatic: false, claims: [],
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Achievements')
    await vi.waitFor(() => expect(view.find('.achievement-add').exists()).toBe(true))
    await view.find('.achievement-add').trigger('click')
    expect(view.text()).toContain('Second title club (required)')
    expect(view.text()).toContain('First title club country code')
    expect(view.text()).toContain('First title season')
    expect(view.text()).toContain('I won a continental club trophy with each club.')
  })

  it('links the first and second title clubs to their catalog entries', async () => {
    clubs = [{
      id: 'first-stint', clubId: 'first-catalog', clubName: 'First Club', countryName: 'Portugal', countryCode: 'PT',
      startSeasonIndex: 0, endSeasonIndex: 0, initialDivisionLevel: 3, officialMatches: 20, eligibleSeasonIndex: 0, version: 1,
    }, {
      id: 'second-stint', clubId: 'second-catalog', clubName: 'Second Club', countryName: 'Portugal', countryCode: 'PT',
      startSeasonIndex: 1, endSeasonIndex: null, initialDivisionLevel: 2, officialMatches: 20, eligibleSeasonIndex: 1, version: 1,
    }]
    achievements = [{
      code: 'G032', name: 'Continental titles with two clubs', description: 'Win with two clubs',
      category: 'Continental', frequency: 'Once', points: 10, isEnabled: true, isAutomatic: false, claims: [],
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Achievements')
    await vi.waitFor(() => expect(view.find('.achievement-add').exists()).toBe(true))
    await view.find('.achievement-add').trigger('click')
    const form = view.findAll('form').find(item => item.text().includes('Select first title career club'))!
    const selects = form.findAll('select')
    await selects.find(select => select.text().includes('Enter club details manually'))!.setValue('second-stint')
    await selects.find(select => select.text().includes('Enter first title club details manually'))!.setValue('first-stint')
    expect(form.text()).toContain('The first title club is linked to the club catalog.')
    await form.trigger('submit')
    await vi.waitFor(() => {
      const request = mocks.api.mock.calls.find(([path, init]) => path.endsWith('/achievement-claims') && init?.method === 'POST')
      expect(request).toBeDefined()
      expect(JSON.parse(request![1].body)).toMatchObject({
        code: 'G032', clubId: 'second-catalog', firstContinentalTitleClubId: 'first-catalog',
        firstContinentalTitleClub: 'First Club', firstContinentalTitleCountry: 'PT',
      })
    })
  })

  it('explains the career records needed for a club move', async () => {
    achievements = [{
      code: 'G037', name: 'Club move', description: 'Move clubs and manage 20 matches',
      category: 'Career', frequency: 'PerClub', points: 5, isEnabled: true, isAutomatic: false, claims: [],
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Achievements')
    await vi.waitFor(() => expect(view.find('.achievement-add').exists()).toBe(true))
    await view.find('.achievement-add').trigger('click')
    expect(view.text()).toContain('First record both clubs in your career.')
    expect(view.text()).toContain('Starting club country code')
    expect(view.text()).toContain('New club (required)')
  })

  it('explains the career records needed for a country move', async () => {
    achievements = [{
      code: 'G041', name: 'New country', description: 'Manage in a new country',
      category: 'Career', frequency: 'PerCountry', points: 5, isEnabled: true, isAutomatic: false, claims: [],
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Achievements')
    await vi.waitFor(() => expect(view.find('.achievement-add').exists()).toBe(true))
    await view.find('.achievement-add').trigger('click')
    expect(view.text()).toContain('stints in the new country')
    expect(view.text()).toContain('Starting club country code')
    expect(view.text()).toContain('Country code (required)')
  })

  it.each([
    ['G038', 'This was my first experience managing in the first division.'],
    ['G039', 'This was my first move to a club in a division higher than any I had previously managed.'],
  ])('asks for %s career-division evidence', async (code, condition) => {
    achievements = [{
      code, name: code, description: 'Career division',
      category: 'Career', frequency: 'Once', points: 4, isEnabled: true, isAutomatic: false, claims: [],
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Achievements')
    await vi.waitFor(() => expect(view.find('.achievement-add').exists()).toBe(true))
    await view.find('.achievement-add').trigger('click')
    expect(view.text()).toContain(condition)
    if (code === 'G039') {
      expect(view.text()).toContain('Best division previously managed')
      expect(view.text()).toContain('New club division')
    }
  })

  it('opens a club correction and removes it with its version after confirmation', async () => {
    clubs = [{
      id: 'club-1', clubName: 'First Club', countryName: 'Portugal', countryCode: 'PT',
      startSeasonIndex: 0, endSeasonIndex: 1, initialDivisionLevel: 3,
      officialMatches: 20, eligibleSeasonIndex: 0, version: 4,
    }]
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Career')
    await vi.waitFor(() => expect(view.text()).toContain('First Club'))
    await view.find('button[aria-label="Edit First Club"]').trigger('click')
    expect(view.text()).toContain('Ending season (optional)')
    await view.find('button[aria-label="Remove First Club"]').trigger('click')
    await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledWith(
      '/api/challenges/challenge-1/career/stints/club-1?version=4', { method: 'DELETE' },
    ))
    confirm.mockRestore()
  })

  it('selects a catalog club when recording a career stint', async () => {
    catalogClubs = [{ id: 'catalog-1', name: 'Catalog Club', identityLabel: "Women's team", countryCode: 'PT', countryName: 'Portugal' }]
    clubs = [{
      id: 'club-1', clubName: 'Old name', countryName: 'Portugal', countryCode: 'PT',
      startSeasonIndex: 0, endSeasonIndex: null, initialDivisionLevel: 3,
      officialMatches: 0, eligibleSeasonIndex: null, version: 1,
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Career')
    await vi.waitFor(() => expect(view.find('button[aria-label="Edit Old name"]').exists()).toBe(true))
    await view.find('button[aria-label="Edit Old name"]').trigger('click')
    await vi.waitFor(() => expect(view.text()).toContain("Catalog Club · Women's team · Portugal"))
    const catalogSelect = view.findAll('select').find(item => item.text().includes("Catalog Club · Women's team"))!
    await catalogSelect.setValue('catalog-1')
    expect(view.text()).toContain("Catalog club selected: Catalog Club · Women's team")
    const form = view.findAll('form').find(item => item.text().includes('Search club catalog'))!
    await form.trigger('submit')
    await vi.waitFor(() => {
      const request = mocks.api.mock.calls.find(([path, init]) => path.endsWith('/career/stints/club-1') && init?.method === 'PUT')
      expect(request).toBeDefined()
      expect(JSON.parse(request![1].body)).toMatchObject({
        clubId: 'catalog-1', clubName: 'Catalog Club', countryCode: 'PT', countryName: 'Portugal',
      })
    })
  })

  it('distinguishes same-name club identities in the career and achievement selector', async () => {
    clubs = [
      {
        id: 'club-1', clubId: 'catalog-1', clubName: 'Shared Club', identityLabel: '', countryName: 'Portugal', countryCode: 'PT',
        startSeasonIndex: 0, endSeasonIndex: null, initialDivisionLevel: 3, officialMatches: 0, eligibleSeasonIndex: null, version: 1,
      },
      {
        id: 'club-2', clubId: 'catalog-2', clubName: 'Shared Club', identityLabel: 'Women', countryName: 'Portugal', countryCode: 'PT',
        startSeasonIndex: 0, endSeasonIndex: null, initialDivisionLevel: 3, officialMatches: 0, eligibleSeasonIndex: null, version: 1,
      },
    ]
    achievements = [{
      code: 'G040', name: 'First trophy', description: 'First trophy',
      category: 'Career', frequency: 'PerClub', points: 5, isEnabled: true, isAutomatic: false, claims: [],
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Career')
    await vi.waitFor(() => expect(view.find('button[aria-label="Edit Shared Club · Women"]').exists()).toBe(true))
    expect(view.find('button[aria-label="Edit Shared Club"]').exists()).toBe(true)
    await selectTab('Achievements')
    await vi.waitFor(() => expect(view.find('.achievement-add').exists()).toBe(true))
    await view.find('.achievement-add').trigger('click')
    const form = view.findAll('form').find(item => item.text().includes('Career club (optional)'))!
    expect(form.findAll('label').find(label => label.text().includes('Career club (optional)'))!.get('select').text()).toContain('Shared Club · Women · PT')
  })

  it('links an achievement to the selected catalog club in the career', async () => {
    clubs = [{
      id: 'club-1', clubId: 'catalog-1', clubName: 'Catalog Club', countryName: 'Portugal', countryCode: 'PT',
      startSeasonIndex: 0, endSeasonIndex: null, initialDivisionLevel: 3,
      officialMatches: 0, eligibleSeasonIndex: null, version: 1,
    }]
    achievements = [{
      code: 'G040', name: 'First trophy', description: 'First trophy',
      category: 'Career', frequency: 'PerClub', points: 5, isEnabled: true, isAutomatic: false, claims: [],
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Achievements')
    await vi.waitFor(() => expect(view.find('.achievement-add').exists()).toBe(true))
    await view.find('.achievement-add').trigger('click')
    const form = view.findAll('form').find(item => item.text().includes('Career club (optional)'))!
    await form.findAll('label').find(label => label.text().includes('Career club (optional)'))!.get('select').setValue('club-1')
    expect(form.text()).toContain('This achievement is linked to a catalog club.')
    await form.trigger('submit')
    await vi.waitFor(() => {
      const request = mocks.api.mock.calls.find(([path, init]) => path.endsWith('/achievement-claims') && init?.method === 'POST')
      expect(request).toBeDefined()
      expect(JSON.parse(request![1].body)).toMatchObject({
        code: 'G040', clubId: 'catalog-1', clubName: 'Catalog Club', countryCode: 'PT',
      })
    })
  })

  it('links the selected starting career club when recording a club move', async () => {
    clubs = [{
      id: 'start-stint', clubId: 'start-catalog', clubName: 'Starting Club', countryName: 'Portugal', countryCode: 'PT',
      startSeasonIndex: 0, endSeasonIndex: 0, initialDivisionLevel: 3,
      officialMatches: 20, eligibleSeasonIndex: 0, version: 1,
    }, {
      id: 'next-stint', clubId: 'next-catalog', clubName: 'Next Club', countryName: 'Portugal', countryCode: 'PT',
      startSeasonIndex: 1, endSeasonIndex: null, initialDivisionLevel: 2,
      officialMatches: 20, eligibleSeasonIndex: 1, version: 1,
    }]
    achievements = [{
      code: 'G037', name: 'Club move', description: 'Move clubs', category: 'Career',
      frequency: 'PerClub', points: 5, isEnabled: true, isAutomatic: false, claims: [],
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Achievements')
    await vi.waitFor(() => expect(view.find('.achievement-add').exists()).toBe(true))
    await view.find('.achievement-add').trigger('click')
    const form = view.findAll('form').find(item => item.text().includes('Select starting career club'))!
    const selects = form.findAll('select')
    await selects.find(select => select.text().includes('Enter club details manually'))!.setValue('next-stint')
    await selects.find(select => select.text().includes('Enter starting club details manually'))!.setValue('start-stint')
    expect(form.text()).toContain('The starting club is linked to the club catalog.')
    await form.trigger('submit')
    await vi.waitFor(() => {
      const request = mocks.api.mock.calls.find(([path, init]) => path.endsWith('/achievement-claims') && init?.method === 'POST')
      expect(request).toBeDefined()
      expect(JSON.parse(request![1].body)).toMatchObject({
        code: 'G037', startingCareerClub: 'Starting Club', startingCareerCountry: 'PT', startingCareerClubId: 'start-catalog',
        clubId: 'next-catalog',
      })
    })
  })

  it('saves a new season at the supported upper boundary with a zero-based identity', async () => {
    dashboard.challenge.status = 'Active'
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Seasons')
    await vi.waitFor(() => expect(view.text()).toContain('No seasons recorded yet.'))
    await view.get('button-stub.primary-button').trigger('click')
    const label = view.findAll('label').find(item => item.text().startsWith('FM season'))!
    await label.get('select').setValue('100')
    await view.get('form').trigger('submit')
    await vi.waitFor(() => expect(mocks.api.mock.calls.some(([path, init]) => path.endsWith('/seasons/100') && init?.method === 'PUT')).toBe(true))
    const call = mocks.api.mock.calls.find(([path]) => path.endsWith('/seasons/100'))!
    expect(JSON.parse(call[1].body)).toMatchObject({ version: null, usesClubBreakdown: false, currency: 'EUR' })
  })

  it('rejects an existing season selected from new entry rather than overwriting its saved version', async () => {
    dashboard.challenge.status = 'Active'
    seasons = [{ id: 'saved-0', seasonIndex: 0, status: 'Completed', displayName: '2026/27', version: 4, currency: 'EUR' }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Seasons')
    await vi.waitFor(() => expect(view.text()).toContain('2026/27'))
    await view.get('button-stub.primary-button').trigger('click')
    const label = view.findAll('label').find(item => item.text().startsWith('FM season'))!
    await label.get('select').setValue('0')
    await view.get('form').trigger('submit')
    expect(view.text()).toContain('This season already exists. Cancel and edit its saved record from Seasons.')
    expect(mocks.api.mock.calls.some(([path, init]) => path.endsWith('/seasons/0') && init?.method === 'PUT')).toBe(false)
  })

  it('saves a detailed season using a career stint and explicit mode', async () => {
    clubs = [{
      id: 'club-1', clubName: 'First Club', countryName: 'Portugal', countryCode: 'PT',
      startSeasonIndex: 0, endSeasonIndex: null, initialDivisionLevel: 3,
      officialMatches: 0, eligibleSeasonIndex: null, version: 1,
    }]
    seasons = [{
      id: 'season-1', seasonIndex: 0, displayName: '2026/27', status: 'InProgress',
      leagueMatches: 0, leagueWins: 0, leagueDraws: 0, leagueLosses: 0, leaguePoints: 0,
      goalsFor: 0, goalsAgainst: 0, leaguePosition: null, largestOutgoingTransfer: 0,
      currency: 'EUR', notes: '', version: 2, usesClubBreakdown: false, clubSeasons: [],
    }]
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Seasons')
    await vi.waitFor(() => expect(view.find('button[aria-label="Edit 2026/27"]').exists()).toBe(true))
    await view.find('button[aria-label="Edit 2026/27"]').trigger('click')
    const toggle = view.findAll('label').find(label => label.text().includes('Use per-club season statistics'))
    await toggle!.find('input').setValue(true)
    await view.find('button-stub[label="Add club statistics"]').trigger('click')
    expect(view.text()).toContain('First Club · PT')
    const form = view.findAll('form').find(item => item.text().includes('League totals are calculated'))
    await form!.trigger('submit')
    await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledWith(
      '/api/challenges/challenge-1/seasons/0',
      expect.objectContaining({ method: 'PUT', body: expect.stringContaining('"usesClubBreakdown":true') }),
    ))
    const request = mocks.api.mock.calls.find(([path, init]) => path.endsWith('/seasons/0') && init?.method === 'PUT')
    expect(JSON.parse(request![1].body).clubSeasons[0]).toMatchObject({ careerStintId: 'club-1', divisionLevel: 3 })
    confirm.mockRestore()
  })

  it('distinguishes saved inactive club statistics from the scoring summary', async () => {
    clubs = [{
      id: 'club-1', clubName: 'First Club', countryName: 'Portugal', countryCode: 'PT',
      startSeasonIndex: 0, endSeasonIndex: null, initialDivisionLevel: 3,
      officialMatches: 10, eligibleSeasonIndex: null, version: 1,
    }]
    seasons = [{
      id: 'season-1', seasonIndex: 0, displayName: '2026/27', status: 'InProgress',
      leagueMatches: 10, leagueWins: 4, leagueDraws: 3, leagueLosses: 3, leaguePoints: 15,
      goalsFor: 12, goalsAgainst: 10, largestOutgoingTransfer: 0, currency: 'EUR', version: 1,
      usesClubBreakdown: false, clubSeasons: [{
        careerStintId: 'club-1', divisionLevel: 3, officialMatches: 10, leagueMatches: 10,
        leagueWins: 4, leagueDraws: 3, leagueLosses: 3, leaguePoints: 15, goalsFor: 12, goalsAgainst: 10, leaguePosition: 4,
      }],
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Seasons')
    await vi.waitFor(() => expect(view.text()).toContain('Saved club statistics; the quick summary currently determines'))
    expect(view.text()).toContain('First Club (PT)')
  })

  it('fills club country details and derives the continent from the catalog', async () => {
    clubs = [{
      id: 'club-1', clubName: 'First Club', countryName: 'Legacy country', countryCode: 'OLD',
      startSeasonIndex: 0, endSeasonIndex: 1, initialDivisionLevel: 3,
      officialMatches: 0, eligibleSeasonIndex: null, version: 4,
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Career')
    await vi.waitFor(() => expect(view.text()).toContain('First Club'))
    await view.find('button[aria-label="Edit First Club"]').trigger('click')
    await vi.waitFor(() => expect(view.text()).toContain('Choose a country from the catalog'))
    await view.findAll('select').find(select => select.text().includes('Portugal (PT)'))!.setValue('PT')
    expect(view.text()).toContain('Continent: Europe')
    expect(view.findAll('input').map(input => (input.element as HTMLInputElement).value)).toContain('Portugal')
    expect(view.findAll('input').map(input => (input.element as HTMLInputElement).value)).toContain('PT')
  })

  it('records a lower-division starting club and excludes first-division options', async () => {
    clubs = [
      { id: 'lower', clubName: 'Lower club', countryCode: 'PT', countryName: 'Portugal', startSeasonIndex: 0, initialDivisionLevel: 3, officialMatches: 0, clubOfficialMatches: 0, countryOfficialMatches: 0, version: 0 },
      { id: 'top', clubName: 'Top club', countryCode: 'PT', countryName: 'Portugal', startSeasonIndex: 0, initialDivisionLevel: 1, officialMatches: 0, clubOfficialMatches: 0, countryOfficialMatches: 0, version: 0 },
    ]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Career')
    await vi.waitFor(() => expect(view.text()).toContain('Lower club'))
    await view.find('button-stub[label="Set career start"]').trigger('click')
    const form = view.findAll('form').find(item => item.text().includes('Starting situation'))!
    await form.find('select').setValue('Club')
    const clubSelect = form.findAll('select').at(1)!
    expect(clubSelect.text()).toContain('Lower club')
    expect(clubSelect.text()).not.toContain('Top club')
    await clubSelect.setValue('lower')
    await form.trigger('submit')
    await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledWith(
      '/api/challenges/challenge-1/career/start',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ status: 'Club', stintId: 'lower', version: 0 }) }),
    ))
  })

  it('flags a national team milestone that no longer qualifies', async () => {
    nationalMilestoneSeason = 2
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Career')
    await vi.waitFor(() => expect(view.text()).toContain('Milestone needs review: the national team records no longer support it.'))
  })

  it('records the attested three-continent milestone with its version', async () => {
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Career')
    await vi.waitFor(() => expect(view.text()).toContain('Three continents'))
    await view.find('button-stub[label="Set continent milestone"]').trigger('click')
    const form = view.findAll('form').find(item => item.text().includes('Third continent season'))!
    await form.get('select').setValue('2')
    await form.trigger('submit')
    await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledWith(
      '/api/challenges/challenge-1/career/three-continents-milestone',
      { method: 'PUT', body: JSON.stringify({ seasonIndex: 2, version: 3 }) },
    ))
  })

  it('preserves and submits the selected national team country', async () => {
    nationalTeams = [{
      id: 'team-1', teamName: 'Portugal', countryCode: 'PT', startSeasonIndex: 0,
      endSeasonIndex: null, officialMatches: 1, notes: '', version: 2,
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Career')
    await vi.waitFor(() => expect(view.text()).toContain('Portugal'))
    await view.find('button[aria-label="Edit Portugal stint"]').trigger('click')
    const form = view.findAll('form').find(item => item.text().includes('Team country (optional)'))!
    expect((form.find('select').element as HTMLSelectElement).value).toBe('PT')
    await form.trigger('submit')
    await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledWith(
      '/api/challenges/challenge-1/national-teams/team-1',
      expect.objectContaining({ method: 'PUT', body: expect.stringContaining('"countryCode":"PT"') }),
    ))
  })

  it('edits national team season allocations and submits them with the stint', async () => {
    nationalTeams = [{
      id: 'team-1', teamName: 'Portugal', countryCode: 'PT', startSeasonIndex: 0,
      endSeasonIndex: 2, officialMatches: 12, notes: '', version: 2,
      seasonMatches: [{ seasonIndex: 0, officialMatches: 5 }],
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Career')
    await vi.waitFor(() => expect(view.text()).toContain('Portugal'))
    await view.find('button[aria-label="Edit Portugal stint"]').trigger('click')
    const form = view.findAll('form').find(item => item.text().includes('Optional season allocations'))!
    await form.get('button-stub[label="Add season allocation"]').trigger('click')
    const inputs = form.findAll('input[type="number"]')
    await inputs.at(-1)!.setValue('7')
    await form.trigger('submit')
    await vi.waitFor(() => {
      const request = mocks.api.mock.calls.find(([path, init]) => path.endsWith('/national-teams/team-1') && init?.method === 'PUT')
      expect(request).toBeDefined()
      expect(JSON.parse(request![1].body).seasonMatches).toEqual([
        { seasonIndex: 0, officialMatches: 5 }, { seasonIndex: 1, officialMatches: 7 },
      ])
    })
  })

  it('allows 20 matches without an attested milestone while the season is pending', async () => {
    clubs = [{
      id: 'club-1', clubName: 'First Club', countryName: 'Portugal', countryCode: 'PT',
      startSeasonIndex: 0, endSeasonIndex: null, initialDivisionLevel: 3,
      officialMatches: 20, eligibleSeasonIndex: null, clubEligibleSeasonIndex: null, clubOfficialMatches: 20, version: 4,
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Career')
    await vi.waitFor(() => expect(view.text()).toContain('MILESTONE SEASON NEEDED'))
    await view.find('button[aria-label="Update matches for First Club"]').trigger('click')
    const form = view.findAll('form').find(item => item.text().includes('Season the club reached 20 matches'))!
    expect(form.text()).toContain('Without either, the milestone remains pending.')
    await form.trigger('submit')
    await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledWith(
      '/api/challenges/challenge-1/career/stints/club-1/matches',
      { method: 'PATCH', body: JSON.stringify({ officialMatches: 20, eligibleSeasonIndex: null, version: 4 }) },
    ))
  })

  it('saves a milestone for combined club stints without discarding it below 20 matches', async () => {
    clubs = [{
      id: 'return-1', clubName: 'Return Club', countryName: 'Portugal', countryCode: 'PT',
      startSeasonIndex: 2, endSeasonIndex: null, initialDivisionLevel: 3,
      officialMatches: 8, eligibleSeasonIndex: null, clubEligibleSeasonIndex: null, clubOfficialMatches: 20, version: 4,
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Career')
    await vi.waitFor(() => expect(view.text()).toContain('20 across club stints'))
    expect(view.text()).toContain('MILESTONE SEASON NEEDED')
    await view.find('button[aria-label="Update matches for Return Club"]').trigger('click')
    const form = view.findAll('form').find(item => item.text().includes('Season the club reached 20 matches'))!
    await form.get('select').setValue('2')
    await form.trigger('submit')
    await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledWith(
      '/api/challenges/challenge-1/career/stints/return-1/matches',
      { method: 'PATCH', body: JSON.stringify({ officialMatches: 8, eligibleSeasonIndex: 2, version: 4 }) },
    ))
  })

  it('flags a stored club milestone that no longer qualifies', async () => {
    clubs = [{
      id: 'return-1', clubName: 'Return Club', countryName: 'Portugal', countryCode: 'PT',
      startSeasonIndex: 2, endSeasonIndex: null, initialDivisionLevel: 3,
      officialMatches: 8, eligibleSeasonIndex: 2, clubEligibleSeasonIndex: null, clubOfficialMatches: 19, version: 4,
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Career')
    await vi.waitFor(() => expect(view.text()).toContain('MILESTONE NEEDS REVIEW'))
  })

  it('flags invalid stint milestones even when other stints qualify the club and country', async () => {
    clubs = [{
      id: 'return-1', clubName: 'Return Club', countryName: 'Portugal', countryCode: 'PT',
      startSeasonIndex: 2, endSeasonIndex: null, initialDivisionLevel: 3,
      officialMatches: 1, eligibleSeasonIndex: 2, clubMilestoneValid: false,
      clubEligibleSeasonIndex: 3, clubOfficialMatches: 20,
      countryEligibleSeasonIndex: 2, countryMilestoneValid: false,
      countryEligibleSeason: 3, countryOfficialMatches: 20, version: 4,
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Career')
    await vi.waitFor(() => expect(view.text()).toContain("This stint's club milestone needs review"))
    expect(view.text()).toContain("This stint's country milestone needs review")
    expect(view.text()).toContain('Country milestone:')
  })

  it('records a country milestone on the relevant stint with its version', async () => {
    clubs = [{
      id: 'foreign-1', clubName: 'Foreign Club', countryName: 'Spain', countryCode: 'ES',
      startSeasonIndex: 2, endSeasonIndex: null, initialDivisionLevel: 3, officialMatches: 8,
      eligibleSeasonIndex: null, clubEligibleSeasonIndex: null, clubOfficialMatches: 8,
      countryEligibleSeasonIndex: null, countryEligibleSeason: null, countryOfficialMatches: 20, version: 5,
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Career')
    await vi.waitFor(() => expect(view.text()).toContain('20 in Spain'))
    await view.find('button[aria-label="Set country milestone for Foreign Club"]').trigger('click')
    const form = view.findAll('form').find(item => item.text().includes('Country 20th-match season'))!
    await form.get('select').setValue('2')
    await form.trigger('submit')
    await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledWith(
      '/api/challenges/challenge-1/career/stints/foreign-1/country-milestone',
      { method: 'PUT', body: JSON.stringify({ seasonIndex: 2, version: 5 }) },
    ))
  })

  it('previews and applies a supplemental scoring rule', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    rules = [{ achievementCode: 'duel:league-points-per-game', points: 4, isEnabled: true }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Rules')
    await vi.waitFor(() => expect(view.text()).toContain('Season duel · league points per game'))
    const form = view.findAll('form').find(item => item.text().includes('Choose a scoring rule'))!
    await form.get('select').setValue('duel:league-points-per-game')
    await form.get('input[type="number"]').setValue('9')
    await form.trigger('submit')
    await vi.waitFor(() => expect(view.text()).toContain('Preview: version 2'))
    const preview = mocks.api.mock.calls.find(([path]) => path.endsWith('/rules/preview'))
    expect(JSON.parse(preview![1].body)).toMatchObject({
      code: 'duel:league-points-per-game', points: 9, isEnabled: true, expectedVersion: 1, expectedChallengeVersion: 3,
    })
    await form.get('button-stub[label="Apply rule version"]').trigger('click')
    await vi.waitFor(() => expect(mocks.api.mock.calls.some(([path, init]) =>
      path.endsWith('/rules') && init?.method === 'POST' && JSON.parse(init.body).confirm === true)).toBe(true))
    confirm.mockRestore()
  })

  it('previews achievement display changes and requires a fresh preview after editing', async () => {
    achievements = [{ code: 'G008', name: 'Original', description: 'Original description', category: 'Domestic',
      frequency: 'Season', canChangeFrequency: true, canChangeCupMinimum: true, minimumCupMatches: 2,
      points: 10, isEnabled: true, isAutomatic: false, claims: [] }]
    rules = [{ achievementCode: 'G008', points: 10, isEnabled: true }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Rules')
    const form = view.findAll('form').find(item => item.text().includes('Choose a scoring rule'))!
    await form.get('select').setValue('G008')
    expect(form.text()).toContain("does not change the achievement's scoring conditions")
    const name = form.findAll('label').find(item => item.text().includes('Achievement name'))!.get('input')
    await name.setValue('Custom name')
    const frequency = form.findAll('label').find(item => item.text().startsWith('Frequency'))!.get('select')
    await frequency.setValue('PerClub')
    await form.findAll('label').find(item => item.text().includes('Minimum cup matches'))!.get('input').setValue('3')
    await form.trigger('submit')
    await vi.waitFor(() => expect(view.text()).toContain('Preview: version 2'))
    const preview = mocks.api.mock.calls.find(([path]) => path.endsWith('/rules/preview'))
    expect(JSON.parse(preview![1].body)).toMatchObject({
      nameOverride: 'Custom name', descriptionOverride: null, categoryOverride: null, frequencyOverride: 'PerClub', minimumCupMatchesOverride: 3,
    })
    await name.setValue('Revised name')
    await form.get('button-stub[label="Apply rule version"]').trigger('click')
    expect(form.text()).toContain('Preview the current changes before applying them.')
    expect(mocks.api.mock.calls.some(([path, init]) => path.endsWith('/rules') && init?.method === 'POST')).toBe(false)
    await form.findAll('label').find(item => item.text().includes('Apply all displayed details'))!.get('input').setValue(true)
    await form.trigger('submit')
    await vi.waitFor(() => expect(mocks.api.mock.calls.filter(([path]) => path.endsWith('/rules/preview'))).toHaveLength(2))
    const updatedPreview = mocks.api.mock.calls.filter(([path]) => path.endsWith('/rules/preview'))[1]!
    expect(JSON.parse(updatedPreview[1].body)).toMatchObject({
      nameOverride: 'Revised name', descriptionOverride: 'Original description', categoryOverride: 'Domestic', frequencyOverride: 'PerClub',
      minimumCupMatchesOverride: 3,
    })
  })

  it('uses the frequency applicable to the claim season for required fields', async () => {
    achievements = [{ code: 'G008', name: 'Cup', description: 'Win a cup', category: 'Domestic', frequency: 'PerClub',
      frequencyVersions: [
        { versionNumber: 1, effectiveSeasonIndex: 0, frequency: 'Season' },
        { versionNumber: 2, effectiveSeasonIndex: 2, frequency: 'PerClub' },
      ], cupMinimumVersions: [
        { versionNumber: 1, effectiveSeasonIndex: 0, minimum: 2 },
        { versionNumber: 2, effectiveSeasonIndex: 2, minimum: 4 },
      ], points: 10, isEnabled: true, isAutomatic: false, claims: [] }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Achievements')
    await view.find('button-stub.achievement-add').trigger('click')
    const form = view.findAll('form').find(item => item.text().includes('FM season'))!
    expect(form.text()).toContain('Club, if applicable')
    await form.get('select').setValue('2')
    expect(form.text()).toContain('Club (required)')
    expect(form.findAll('label').find(item => item.text().includes('Cup matches you managed'))!.get('input').attributes('min')).toBe('4')
  })

  it('shows catalog errors and retries without presenting an empty catalog', async () => {
    failures.add('competitions')
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Rules')
    await vi.waitFor(() => expect(view.text()).toContain('Could not load competitions'))
    expect(view.text()).not.toContain('No competitions configured.')
    failures.delete('competitions')
    const error = view.findAll('[role="alert"]').find(item => item.text().includes('Could not load competitions'))!
    await error.find('button').trigger('click')
    await vi.waitFor(() => expect(view.text()).toContain('No competitions configured.'))
  })

  it('creates, edits and removes catalog entries with their versions', async () => {
    competitions = [{ id: 'top-1', name: 'Top Cup', tier: 'Top', version: 3 }]
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Rules')
    await vi.waitFor(() => expect(view.text()).toContain('Top Cup'))
    const form = view.findAll('form').find(item => item.text().includes('Add a competition'))!
    await form.find('input').setValue('New Cup')
    await form.find('select').setValue('Second')
    await form.trigger('submit')
    await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledWith(
      '/api/challenges/challenge-1/competitions',
      { method: 'POST', body: JSON.stringify({ name: 'New Cup', tier: 'Second', version: null }) },
    ))
    await vi.waitFor(() => expect(view.find('button[aria-label="Edit Top Cup"]').attributes('disabled')).toBeUndefined())
    await view.find('button[aria-label="Edit Top Cup"]').trigger('click')
    const edit = view.findAll('form').find(item => item.text().includes('Edit competition'))!
    await edit.find('input').setValue('Renamed Cup')
    await edit.trigger('submit')
    await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledWith(
      '/api/challenges/challenge-1/competitions/top-1',
      { method: 'PUT', body: JSON.stringify({ name: 'Renamed Cup', tier: 'Top', version: 3 }) },
    ))
    await vi.waitFor(() => expect(view.find('button[aria-label="Remove Top Cup"]').attributes('disabled')).toBeUndefined())
    await view.find('button[aria-label="Remove Top Cup"]').trigger('click')
    await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledWith(
      '/api/challenges/challenge-1/competitions/top-1?version=3', { method: 'DELETE' },
    ))
    confirm.mockRestore()
  })

  it('filters claim competitions by tier and preserves the existing link when correcting', async () => {
    competitions = [
      { id: 'top-1', name: 'Top Cup', tier: 'Top', version: 0 },
      { id: 'second-1', name: 'Second Cup', tier: 'Second', version: 0 },
    ]
    achievements = [{
      code: 'G020', name: 'Continental winner', description: 'Win the top cup',
      category: 'Continental', frequency: 'Season', points: 30, isEnabled: true, isAutomatic: false,
      claims: [{ id: 'claim-1', seasonIndex: 0, clubName: 'Club', countryCode: 'PT', notes: '', version: 2, competitionId: 'top-1' }],
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Achievements')
    await vi.waitFor(() => expect(view.find('button[aria-label^="Edit Continental winner"]').exists()).toBe(true))
    await view.find('button[aria-label^="Edit Continental winner"]').trigger('click')
    const select = view.findAll('select').find(item => item.element.value === 'top-1')!
    expect(select.text()).toContain('Top Cup')
    expect(select.text()).not.toContain('Second Cup')
    await select.element.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => {
      const call = mocks.api.mock.calls.find(([path]) => path.endsWith('/achievement-claims/claim-1'))
      expect(call).toBeDefined()
      expect(JSON.parse(call![1].body)).toMatchObject({ competitionId: 'top-1', version: 2 })
    })
  })

  it('does not save a linked claim while the competition catalog failed to load', async () => {
    failures.add('competitions')
    achievements = [{
      code: 'G020', name: 'Continental winner', description: 'Win the top cup',
      category: 'Continental', frequency: 'Season', points: 30, isEnabled: true, isAutomatic: false,
      claims: [{ id: 'claim-1', seasonIndex: 0, clubName: 'Club', countryCode: 'PT', notes: '', version: 2, competitionId: 'top-1' }],
    }]
    const view = mountChallenge()
    await vi.waitFor(() => expect(view.text()).toContain('Test challenge'))
    await selectTab('Achievements')
    await vi.waitFor(() => expect(view.find('button[aria-label^="Edit Continental winner"]').exists()).toBe(true))
    await view.find('button[aria-label^="Edit Continental winner"]').trigger('click')
    await vi.waitFor(() => expect(view.text()).toContain('Could not load competitions'))
    const dialog = view.findAll('form').find(item => item.text().includes('Could not load competitions'))!
    await dialog.trigger('submit')
    expect(view.text()).toContain('Load the competition catalog before saving this achievement.')
    expect(mocks.api.mock.calls.some(([path]) => path.endsWith('/achievement-claims/claim-1'))).toBe(false)
  })
})
