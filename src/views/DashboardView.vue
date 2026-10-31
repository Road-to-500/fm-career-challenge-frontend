<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  CircleHelp,
  Clipboard,
  Flag,
  Plus,
  Radio,
  Shield,
  Sparkles,
  Trophy,
  Users,
} from '@lucide/vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError, signIn, signOut } from '../lib/api'
import { takeInvitation } from '../lib/invitationIntent'
import { connectChallengeRealtime } from '../lib/realtime'
import { useSessionStore, type SessionProfile } from '../stores/session'
import ThemeToggle from '../components/ThemeToggle.vue'
import FieldHelp from '../components/FieldHelp.vue'

type UserProfile = SessionProfile

type CatalogAchievement = { code: string; name: string; category: string; defaultPoints: number }

type ChallengeCard = {
  id: string
  name: string
  status: string
  statusBeforeArchive: string | null
  role: 'Administrator' | 'Participant'
  targetPoints: number
  myScore: number
  opponentScore: number
  myTrainerName?: string
  opponentName?: string
  currentSeason?: string
  lastActivityAt?: string
  winningParticipantId?: string
}

type Invitation = {
  id: string
  challengeName: string
  inviterName: string
  expiresAt: string
}

type Notification = {
  id: string
  title: string
  message: string
  createdAt: string
  readAt: string | null
}

const queryClient = useQueryClient()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { t } = useI18n()
type WorkspaceView = 'overview' | 'challenges' | 'invitations' | 'help'
const workspaceView = computed<WorkspaceView>(() => {
  const requested = route.query.view
  if (requested === 'challenges' || requested === 'invitations' || requested === 'help') return requested
  if (route.hash === '#active-challenges') return 'challenges'
  if (route.hash === '#invitations') return 'invitations'
  if (route.hash === '#about') return 'help'
  return 'overview'
})
const workspaceTitle = computed(() => ({
  overview: 'Overview',
  challenges: 'My challenges',
  invitations: 'Invitations',
  help: 'How it works',
}[workspaceView.value]))
const createDialogVisible = ref(false)
const notificationsVisible = ref(false)
const notificationError = ref('')
const createName = ref('')
const createDescription = ref('')
const createTrainerName = ref('')
const createAsDraft = ref(false)
const createSeasonYear = ref('2026')
const createError = ref('')
const createPending = ref(false)
const createAchievementCodes = ref<string[]>([])
const catalogSelectionInitialized = ref(false)
const inviteToken = ref('')
const inviteError = ref('')
const copiedChallengeId = ref<string>()
const generatedInvite = ref<{ challengeId: string; url: string }>()
const generatedInviteError = ref('')
const connectionStatus = ref<'connected' | 'disconnected'>('disconnected')
const profileDialogVisible = ref(false)
const profileName = ref('')
const profileAvatar = ref('')
const profileError = ref('')
const profileSaving = ref(false)
const sessionError = ref('')
const signingOut = ref(false)
const pendingInvitations = ref(new Set<string>())
const pendingNotifications = ref(new Set<string>())
const joining = ref(false)
const joinedChallenge = ref<{ id: string; name: string }>()
const pendingInviteLinks = ref(new Set<string>())
let stopRealtime: (() => void) | undefined

const profileQuery = useQuery({
  queryKey: ['me'],
  queryFn: () => api<UserProfile>('/api/me'),
  retry: false,
})
const catalogQuery = useQuery({
  queryKey: ['achievement-catalog'],
  queryFn: () => api<CatalogAchievement[]>('/api/achievement-catalog'),
  enabled: computed(() => profileQuery.isSuccess.value && createDialogVisible.value),
})
watch(
  [createDialogVisible, () => catalogQuery.data.value],
  ([visible, catalog]) => {
    if (!visible) catalogSelectionInitialized.value = false
    else if (catalog && !catalogSelectionInitialized.value) {
      createAchievementCodes.value = catalog.map(item => item.code)
      catalogSelectionInitialized.value = true
    }
  },
)
const challengesQuery = useQuery({
  queryKey: ['my-challenges'],
  queryFn: () => api<ChallengeCard[]>('/api/me/challenges'),
  enabled: computed(() => profileQuery.isSuccess.value),
  refetchInterval: 60_000,
})
const invitationsQuery = useQuery({
  queryKey: ['invitations'],
  queryFn: () => api<Invitation[]>('/api/me/invitations'),
  enabled: computed(() => profileQuery.isSuccess.value),
  refetchInterval: 60_000,
})
const notificationsQuery = useQuery({
  queryKey: ['notifications'],
  queryFn: () => api<Notification[]>('/api/me/notifications'),
  enabled: computed(() => profileQuery.isSuccess.value),
  refetchInterval: 60_000,
})

watch(
  () => profileQuery.data.value,
  (profile) => {
    if (profile) {
      session.setProfile(profile)
      if (!profile.hasCompletedOnboarding && !profileDialogVisible.value) openProfile()
    }
  },
  { immediate: true },
)

const unreadNotifications = computed(
  () => notificationsQuery.data.value?.filter(item => !item.readAt).length ?? 0,
)
const activeChallenges = computed(
  () => challengesQuery.data.value?.filter((item) => ['Draft', 'Active', 'PendingPlayers'].includes(item.status)) ?? [],
)
const inProgressCount = computed(() => activeChallenges.value.filter(item => item.status !== 'Draft').length)
const historyChallenges = computed(
  () =>
    challengesQuery.data.value?.filter((item) =>
      ['Completed', 'Archived'].includes(item.status),
    ) ?? [],
)
const completedCount = computed(() => (challengesQuery.data.value ?? []).filter(item =>
  item.status === 'Completed' || (item.status === 'Archived' && item.statusBeforeArchive === 'Completed'),
).length)
const totalPoints = computed(() =>
  (challengesQuery.data.value ?? []).reduce((sum, item) => sum + item.myScore, 0),
)

watch(
  () => profileQuery.isSuccess.value,
  (authenticated) => {
    stopRealtime?.()
    stopRealtime = undefined
    connectionStatus.value = 'disconnected'
    if (!authenticated) return
    stopRealtime = connectChallengeRealtime(null, queryClient, (connected) => {
      connectionStatus.value = connected ? 'connected' : 'disconnected'
    })
  },
  { immediate: true },
)

onMounted(() => {
  const pendingInvite = takeInvitation()
  if (pendingInvite && typeof route.query.invite !== 'string') {
    void router.replace({ path: '/dashboard', query: { ...route.query, invite: pendingInvite, view: 'invitations' }, hash: '' })
  }
  window.addEventListener('focus', refreshOnFocus)
})

onUnmounted(() => {
  stopRealtime?.()
  window.removeEventListener('focus', refreshOnFocus)
})

function refreshOnFocus() {
  void queryClient.invalidateQueries({ queryKey: ['my-challenges'] })
  void queryClient.invalidateQueries({ queryKey: ['invitations'] })
  void queryClient.invalidateQueries({ queryKey: ['notifications'] })
}

function openProfile() {
  const profile = profileQuery.data.value
  if (!profile) return
  profileName.value = profile.displayName
  profileAvatar.value = profile.avatarUrl ?? ''
  profileError.value = ''
  profileDialogVisible.value = true
}

async function saveProfile() {
  if (profileSaving.value) return
  profileSaving.value = true
  profileError.value = ''
  try {
    const updated = await api<UserProfile>('/api/me', {
      method: 'PUT',
      body: JSON.stringify({ displayName: profileName.value.trim(), avatarUrl: profileAvatar.value.trim() || null }),
    })
    queryClient.setQueryData(['me'], updated)
    session.setProfile(updated)
    profileDialogVisible.value = false
  } catch (error) {
    profileError.value = error instanceof Error ? error.message : 'Profile could not be saved.'
  } finally {
    profileSaving.value = false
  }
}

async function markNotificationRead(notification: Notification) {
  if (notification.readAt || pendingNotifications.value.has(notification.id)) return
  pendingNotifications.value.add(notification.id)
  notificationError.value = ''
  try {
    await api(`/api/me/notifications/${notification.id}/read`, { method: 'PATCH' })
    await queryClient.invalidateQueries({ queryKey: ['notifications'] })
  } catch (error) {
    notificationError.value = error instanceof Error ? error.message : 'Notification could not be updated.'
  } finally {
    pendingNotifications.value.delete(notification.id)
  }
}

async function createChallenge() {
  if (createPending.value) return
  createError.value = ''
  createPending.value = true
  try {
    const created = await api<{ id: string }>('/api/challenges', {
      method: 'POST',
      body: JSON.stringify({
        name: createName.value.trim(),
        description: createDescription.value.trim() || null,
        trainerName: createTrainerName.value.trim() || null,
        startSeasonYear: Number(createSeasonYear.value),
        achievementCodes: createAchievementCodes.value,
        saveAsDraft: createAsDraft.value,
      }),
    })
    await queryClient.invalidateQueries({ queryKey: ['my-challenges'] })
    createDialogVisible.value = false
    createName.value = ''
    createDescription.value = ''
    createTrainerName.value = ''
    createAsDraft.value = false
    await router.push(`/challenges/${created.id}`)
  } catch (error) {
    createError.value = error instanceof Error ? error.message : 'Challenge could not be created.'
  } finally {
    createPending.value = false
  }
}

async function acceptInvitation(invitationId: string) {
  if (pendingInvitations.value.has(invitationId)) return
  pendingInvitations.value.add(invitationId)
  joinedChallenge.value = undefined
  inviteError.value = ''
  try {
    const invitation = invitationsQuery.data.value?.find(item => item.id === invitationId)
    const joined = await api<{ challengeId: string }>(`/api/me/invitations/${invitationId}/accept`, { method: 'POST' })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['invitations'] }),
      queryClient.invalidateQueries({ queryKey: ['my-challenges'] }),
    ])
    joinedChallenge.value = { id: joined.challengeId, name: invitation?.challengeName ?? 'Your joined challenge' }
  } catch (error) {
    inviteError.value = error instanceof Error ? error.message : 'Invitation could not be accepted.'
  } finally {
    pendingInvitations.value.delete(invitationId)
  }
}

async function declineInvitation(invitationId: string) {
  if (pendingInvitations.value.has(invitationId)) return
  pendingInvitations.value.add(invitationId)
  inviteError.value = ''
  try {
    await api(`/api/me/invitations/${invitationId}/decline`, { method: 'POST' })
    await queryClient.invalidateQueries({ queryKey: ['invitations'] })
  } catch (error) {
    inviteError.value = error instanceof Error ? error.message : 'Invitation could not be declined.'
  } finally {
    pendingInvitations.value.delete(invitationId)
  }
}

async function joinWithCode() {
  if (joining.value || !inviteToken.value.trim()) return
  joining.value = true
  joinedChallenge.value = undefined
  inviteError.value = ''
  try {
    const joined = await api<{ challengeId: string }>('/api/challenges/join', {
      method: 'POST',
      body: JSON.stringify({ token: inviteToken.value.trim() }),
    })
    inviteToken.value = ''
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['invitations'] }),
      queryClient.invalidateQueries({ queryKey: ['my-challenges'] }),
    ])
    const challenge = challengesQuery.data.value?.find(item => item.id === joined.challengeId)
    joinedChallenge.value = { id: joined.challengeId, name: challenge?.name ?? 'Your joined challenge' }
  } catch (error) {
    inviteError.value = error instanceof Error ? error.message : 'Invitation could not be accepted.'
  } finally {
    joining.value = false
  }
}

async function copyInvite(id: string) {
  if (pendingInviteLinks.value.has(id)) return
  pendingInviteLinks.value.add(id)
  generatedInviteError.value = ''
  try {
    const response = await api<{ url: string }>(`/api/challenges/${id}/invites`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    generatedInvite.value = { challengeId: id, url: response.url }
    try {
      await navigator.clipboard.writeText(response.url)
      copiedChallengeId.value = id
      window.setTimeout(() => (copiedChallengeId.value = undefined), 1800)
    } catch {
      generatedInviteError.value = 'The link was created but could not be copied. Copy it manually below.'
    }
    await queryClient.invalidateQueries({ queryKey: ['my-challenges'] })
  } catch (error) {
    generatedInviteError.value = error instanceof Error ? error.message : 'The invitation could not be created.'
  } finally {
    pendingInviteLinks.value.delete(id)
  }
}

async function handleSignOut() {
  if (signingOut.value) return
  signingOut.value = true
  sessionError.value = ''
  try {
    await signOut()
    session.clearProfile()
    await queryClient.clear()
    window.location.assign('/dashboard')
  } catch (error) {
    sessionError.value = error instanceof Error ? error.message : 'Sign out failed.'
  } finally {
    signingOut.value = false
  }
}

function formatActivity(value?: string) {
  if (!value) return 'No activity yet'
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value))
}

const requestFailed = computed(
  () =>
    profileQuery.isError.value
      && !(profileQuery.error.value instanceof ApiError
        && profileQuery.error.value.status === 401),
)
const isSignedOut = computed(() => profileQuery.isError.value && !requestFailed.value)
const hasWorkspace = computed(() => profileQuery.isSuccess.value)
watch(hasWorkspace, available => {
  if (available) return
  createDialogVisible.value = false
  profileDialogVisible.value = false
  notificationsVisible.value = false
})

function navigateWorkspace(view: WorkspaceView) {
  const query = { ...route.query }
  if (view === 'overview') delete query.view
  else query.view = view
  void router.push({ path: '/dashboard', query, hash: '' })
}

const workspaceHomeUrl = computed(() => router.resolve({
  path: '/dashboard',
  query: { ...route.query, view: undefined },
}).href)

watch(
  () => route.hash,
  (hash) => {
    const legacyView = hash === '#active-challenges' ? 'challenges'
      : hash === '#invitations' ? 'invitations'
        : hash === '#about' ? 'help' : null
    if (legacyView) {
      const query = { ...route.query, view: legacyView }
      void router.replace({ path: '/dashboard', query, hash: '' })
    }
  },
  { immediate: true },
)

watch(
  () => route.query.invite,
  (token) => {
    if (typeof token === 'string') inviteToken.value = token
  },
  { immediate: true },
)
</script>

<template>
  <main class="app-shell" :class="{ 'signed-out-shell': !hasWorkspace }">
    <a class="skip-link" href="#dashboard-content">Skip to main content</a>
    <aside v-if="hasWorkspace" class="sidebar">
      <a class="brand" :href="workspaceHomeUrl" aria-label="FM Career Challenge home" @click.prevent="navigateWorkspace('overview')">
        <span class="brand-mark"><Trophy :size="19" :stroke-width="2.4" /></span>
        <span class="brand-copy">FM CAREER <span>CHALLENGE</span></span>
      </a>

      <div class="workspace-label">WORKSPACE</div>
      <nav class="main-nav" aria-label="Main navigation">
        <button type="button" class="nav-link" :class="{ active: workspaceView === 'overview' }" :aria-current="workspaceView === 'overview' ? 'page' : undefined" @click="navigateWorkspace('overview')"><Radio :size="17" /> Overview</button>
        <button type="button" class="nav-link" :class="{ active: workspaceView === 'challenges' }" :aria-current="workspaceView === 'challenges' ? 'page' : undefined" @click="navigateWorkspace('challenges')"><Flag :size="17" /> My challenges</button>
        <button type="button" class="nav-link" :class="{ active: workspaceView === 'invitations' }" :aria-current="workspaceView === 'invitations' ? 'page' : undefined" @click="navigateWorkspace('invitations')"><Users :size="17" /> Invitations</button>
        <button type="button" class="nav-link" :class="{ active: workspaceView === 'help' }" :aria-current="workspaceView === 'help' ? 'page' : undefined" @click="navigateWorkspace('help')"><CircleHelp :size="17" /> How it works</button>
      </nav>

      <div class="sidebar-bottom">
        <div class="season-card">
          <div class="season-eyebrow"><Sparkles :size="13" /> THE LONG GAME</div>
          <p>Every season tells a story. Make yours count.</p>
        </div>
        <div class="sidebar-footer">
          <span class="online-dot"></span>
          <span>Race to 500</span>
          <span class="version-label">V1.0</span>
        </div>
      </div>
    </aside>

    <section class="main-panel">
      <header class="topbar">
        <a v-if="!hasWorkspace" class="landing-brand" :href="workspaceHomeUrl" aria-label="FM Career Challenge home" @click.prevent="navigateWorkspace('overview')"><span class="brand-mark"><Trophy :size="18" /></span><span>FM CAREER <strong>CHALLENGE</strong></span></a>
        <div v-else class="breadcrumb"><span>Workspace</span><ChevronRight :size="14" /><strong>{{ workspaceTitle }}</strong></div>
        <div class="topbar-actions">
          <ThemeToggle />
          <button v-if="isSignedOut" type="button" class="text-button public-help-link" @click="navigateWorkspace('help')">How it works</button>
          <span v-if="hasWorkspace" class="connection-indicator" :class="connectionStatus" :title="connectionStatus">
            <span class="online-dot"></span> {{ connectionStatus === 'connected' ? 'Live' : 'Offline' }}
          </span>
          <button v-if="profileQuery.isSuccess.value" class="icon-button" :aria-label="notificationsQuery.isSuccess.value ? `Notifications, ${unreadNotifications} unread` : 'Notifications, count unavailable'" @click="notificationsVisible = true"><Bell :size="18" /><span v-if="notificationsQuery.isSuccess.value && unreadNotifications" class="notification-dot"></span></button>
          <div v-if="hasWorkspace && profileQuery.data.value" class="user-menu">
            <img
              v-if="profileQuery.data.value.avatarUrl"
              :src="profileQuery.data.value.avatarUrl"
              :alt="`${profileQuery.data.value.displayName}'s avatar`"
              class="avatar"
            />
            <span v-else class="avatar avatar-initials">{{ profileQuery.data.value.displayName.slice(0, 1).toUpperCase() }}</span>
            <span class="user-name">{{ profileQuery.data.value.displayName }}</span>
            <button class="text-button" @click="openProfile">Edit profile</button>
            <button class="text-button" :disabled="signingOut" @click="handleSignOut">{{ signingOut ? 'Signing out…' : 'Sign out' }}</button>
          </div>
          <div v-else-if="isSignedOut" class="provider-actions">
            <button class="text-button" @click="signIn()">Sign in</button>
          </div>
        </div>
      </header>

      <section v-if="isSignedOut && workspaceView === 'overview'" id="dashboard-content" class="landing-page" aria-labelledby="landing-title" tabindex="-1">
        <div class="landing-hero">
          <div class="landing-hero-copy">
            <div class="eyebrow"><span class="eyebrow-line"></span> A CAREER WORTH REMEMBERING</div>
            <h1 id="landing-title">Your Football Manager story.<br /><em>Season by season.</em></h1>
            <p>Track the clubs you lead, record the milestones you earn, and compare your journey with a rival on the road to 500 points.</p>
            <p v-if="typeof route.query.invite === 'string'" class="landing-invite-note">You have an invitation waiting. Sign in to join the challenge.</p>
            <div class="landing-actions">
              <Button class="provider-button google-button" @click="signIn()"><span class="provider-g">G</span> Continue with Google</Button>
              <button type="button" class="landing-secondary" @click="navigateWorkspace('help')">See how it works <ChevronRight :size="15" /></button>
            </div>
            <div class="landing-trust"><Shield :size="14" /> One secure sign-in. Your own save. No public game data required.</div>
          </div>
          <div class="landing-score-card" aria-label="Challenge example">
            <div class="landing-score-kicker"><Trophy :size="15" /> YOUR NEXT CHAPTER</div>
            <strong>Race to 500</strong>
            <p>Build your career through trophies, promotions, seasons and shared milestones.</p>
            <div class="landing-score-row"><span>The challenge target</span><span>500 confirmed points</span></div>
            <small>A friendly challenge between two managers</small>
          </div>
        </div>
        <div class="landing-steps">
          <article><span>01</span><strong>Start your challenge</strong><p>Set up a career and choose the scoring rules for your race.</p></article>
          <article><span>02</span><strong>Invite a rival</strong><p>Each manager records their own Football Manager save.</p></article>
          <article><span>03</span><strong>Make each season count</strong><p>Record results and see how your journeys compare.</p></article>
        </div>
        <p class="landing-disclaimer">Results and milestone details are self-reported. The app applies challenge rules to your records; it does not independently verify your game.</p>
      </section>

      <div v-else id="dashboard-content" class="page-content" tabindex="-1">
        <p v-if="sessionError" class="form-error" role="alert">{{ sessionError }}</p>
        <section v-if="hasWorkspace && joinedChallenge" class="notice" role="status">
          <strong>Invitation accepted. You joined {{ joinedChallenge.name }}.</strong>
          <button type="button" class="link-button" @click="router.push(`/challenges/${joinedChallenge.id}`)">Open joined challenge <ChevronRight :size="15" /></button>
        </section>
        <section v-if="workspaceView === 'overview' && hasWorkspace" class="welcome-row">
          <div>
            <div class="eyebrow"><span class="eyebrow-line"></span> YOUR MANAGER JOURNEY</div>
            <h1>Build a career<br /><em>worth remembering.</em></h1>
            <p class="intro-copy">
              One save at a time. Track your milestones, outsmart the timeline, and be the first to 500.
            </p>
          </div>
          <div class="welcome-actions">
            <Button class="primary-button" @click="createDialogVisible = true">
              <Plus :size="17" /> New challenge
            </Button>
          </div>
        </section>

        <section v-if="workspaceView === 'overview' && hasWorkspace" class="stats-grid" aria-label="Career statistics">
          <article class="stat-card">
            <div class="stat-icon olive"><Flag :size="18" /></div>
            <div class="stat-value">{{ challengesQuery.isSuccess.value ? challengesQuery.data.value?.length : '—' }}</div>
            <div class="stat-label">TOTAL CHALLENGES</div>
            <div class="stat-foot"><span>Across your career</span></div>
          </article>
          <article class="stat-card">
            <div class="stat-icon gold"><Trophy :size="18" /></div>
            <div class="stat-value">{{ challengesQuery.isSuccess.value ? totalPoints.toLocaleString('en') : '—' }}</div>
            <div class="stat-label">CAREER POINTS</div>
            <div class="stat-foot"><span>Across all challenges</span></div>
          </article>
          <article class="stat-card">
            <div class="stat-icon green"><ArrowUpRight :size="18" /></div>
            <div class="stat-value">{{ challengesQuery.isSuccess.value ? inProgressCount : '—' }}</div>
            <div class="stat-label">IN PROGRESS</div>
            <div class="stat-foot"><span>Ready for the next season</span></div>
          </article>
          <article class="stat-card">
            <div class="stat-icon blue"><Shield :size="18" /></div>
            <div class="stat-value">{{ challengesQuery.isSuccess.value ? completedCount : '—' }}</div>
            <div class="stat-label">COMPLETED</div>
            <div class="stat-foot"><span>Your history, preserved</span></div>
          </article>
        </section>

        <section v-if="profileQuery.isPending.value" class="loading-state" aria-live="polite">
          <div class="loading-spinner"></div>
          <p>{{ t('dashboard.loading') }}</p>
        </section>
        <section v-else-if="requestFailed" class="notice notice-error" role="alert">
          <strong>{{ profileQuery.error.value instanceof ApiError && profileQuery.error.value.status === 403 ? 'Access to your workspace was denied.' : 'We could not load your workspace.' }}</strong>
          <p>{{ profileQuery.error.value?.message }} Check your connection and try again.</p>
          <Button class="secondary-button" @click="() => profileQuery.refetch()">Try again</Button>
        </section>

        <section v-else-if="workspaceView === 'help'" class="help-page">
          <div class="eyebrow"><span class="eyebrow-line"></span> A QUICK GUIDE</div>
          <h1>How FM Career Challenge works</h1>
          <p class="help-lead">Track your Football Manager save season by season and compare progress with one rival. Your records are self-reported; the app calculates points from the details you enter but cannot independently verify your game.</p>
          <div class="help-grid">
            <article><span>01</span><h2>Career and challenge</h2><p>Your career is the clubs, seasons and milestones in your save. A challenge is the comparison with a rival: each manager records their own save and the app applies the challenge's scoring rules.</p></article>
            <article><span>02</span><h2>Set up your save</h2><p>Start a challenge, publish it and invite a rival. Record your career start as unemployed or at a club below the first division. Add the starting club first if needed; then record clubs and seasons as your save progresses.</p></article>
            <article><span>03</span><h2>Comparable seasons</h2><p>Season indices follow your challenge start year. Duels compare the same in-game season, and both managers must complete a season before its results are confirmed.</p></article>
            <article><span>04</span><h2>Points and evidence</h2><p>Points can come from achievements, first bonuses, season duels and fixed checkpoints. Some milestones are calculated from your records; others ask you to attest details. The app does not independently verify game results.</p></article>
          </div>
          <div class="help-next">
            <div><h2>Your next step</h2><p>Create or join a challenge, invite a rival, then record your career start and first season.</p></div>
            <Button v-if="profileQuery.isError.value" class="provider-button google-button" @click="signIn()"><span class="provider-g">G</span> Continue with Google</Button>
            <Button v-else-if="profileQuery.data.value" class="primary-button" @click="navigateWorkspace('challenges')">View my challenges <ChevronRight :size="15" /></Button>
          </div>
        </section>

        <section v-else-if="profileQuery.isError.value" class="onboarding-card">
          <div class="onboarding-art"><Trophy :size="43" :stroke-width="1.25" /></div>
          <div class="onboarding-content">
            <div class="eyebrow"><span class="eyebrow-line"></span> START YOUR STORY</div>
            <h2>{{ workspaceView === 'invitations' ? 'Sign in to manage invitations.' : 'Every great career starts somewhere.' }}</h2>
            <p>{{ workspaceView === 'invitations' ? 'Accept a rival’s invitation or join with a challenge code after signing in.' : 'Sign in to create your first Race to 500 challenge, invite a rival, and start building your manager legacy.' }}</p>
            <div class="login-actions">
              <Button class="provider-button google-button" @click="signIn()">
                <span class="provider-g">G</span> Continue with Google
              </Button>
            </div>
            <div class="login-foot"><Shield :size="13" /> Secure sign-in. No password to remember.</div>
          </div>
        </section>

        <section v-else class="content-grid" :class="{ 'single-column': workspaceView !== 'overview' }">
          <div class="primary-column">
            <section v-if="workspaceView === 'overview' || workspaceView === 'challenges'" id="active-challenges" class="section-block">
              <div class="section-heading">
                <div>
                  <div class="eyebrow"><span class="eyebrow-line"></span> ON THE TOUCHLINE</div>
                  <h2>Challenges and drafts <span class="count-pill">{{ activeChallenges.length }}</span></h2>
                </div>
                <button class="link-button" @click="createDialogVisible = true">Create challenge <ChevronRight :size="15" /></button>
              </div>

              <div v-if="challengesQuery.isPending.value" class="challenge-placeholder">Loading your challenges…</div>
              <div v-else-if="challengesQuery.isError.value" class="notice notice-error" role="alert">Your challenges could not be loaded. <button class="link-button" @click="() => challengesQuery.refetch()">Try again</button></div>
              <div v-else-if="activeChallenges.length === 0" class="empty-card">
                <div class="empty-icon"><Flag :size="20" /></div>
                <div>
                  <strong>No active challenges yet</strong>
                  <p>Your next chapter starts with a challenge. Create one or join a friend.</p>
                </div>
                <Button class="outline-button" @click="createDialogVisible = true"><Plus :size="16" /> Create</Button>
              </div>
              <div v-else class="challenge-list">
                <article v-for="challenge in activeChallenges" :key="challenge.id" class="challenge-card">
                  <div class="challenge-card-top">
                    <div class="challenge-type"><span class="live-pulse"></span> RACE TO 500</div>
                    <Tag :value="challenge.status" severity="success" />
                  </div>
                  <h3>{{ challenge.name }}</h3>
                  <div class="duel-row">
                    <div class="duel-player">
                      <span class="club-crest yours">{{ challenge.myTrainerName?.slice(0, 1) ?? 'Y' }}</span>
                      <div><small>YOU</small><strong>{{ challenge.myTrainerName ?? profileQuery.data.value?.displayName }}</strong></div>
                    </div>
                    <div class="score-versus">
                      <strong>{{ challenge.myScore }}</strong><span>—</span><strong>{{ challenge.opponentScore }}</strong>
                    </div>
                    <div class="duel-player opponent">
                      <span class="club-crest rival">{{ challenge.opponentName?.slice(0, 1) ?? '?' }}</span>
                      <div><small>RIVAL</small><strong>{{ challenge.opponentName ?? 'Awaiting rival' }}</strong></div>
                    </div>
                  </div>
                  <div class="progress-label"><span>Journey to {{ challenge.targetPoints }}</span><span>{{ Math.min(100, Math.round((challenge.myScore / challenge.targetPoints) * 100)) }}%</span></div>
                  <ProgressBar :value="Math.min(100, Math.round((challenge.myScore / challenge.targetPoints) * 100))" :aria-label="`Your progress in ${challenge.name}`" :show-value="false" />
                  <div class="challenge-footer">
                    <span><span class="season-dot"></span> {{ challenge.currentSeason ? `Latest: ${challenge.currentSeason}` : 'No season recorded' }}</span>
                    <span>Updated {{ formatActivity(challenge.lastActivityAt) }}</span>
                    <div class="card-actions">
                      <button v-if="challenge.status === 'PendingPlayers' && challenge.role === 'Administrator'" class="subtle-action" :disabled="pendingInviteLinks.has(challenge.id)" :aria-label="`Create invite for ${challenge.name}`" @click="copyInvite(challenge.id)">
                        <Check v-if="copiedChallengeId === challenge.id" :size="14" />
                        <Clipboard v-else :size="14" />
                      </button>
                      <button class="card-open" aria-label="Open challenge" @click="router.push(`/challenges/${challenge.id}`)"><ChevronRight :size="17" /></button>
                    </div>
                  </div>
                  <label v-if="generatedInvite?.challengeId === challenge.id">Invitation link (copy it now)<InputText :model-value="generatedInvite.url" readonly /><FieldHelp>Copy and share this private link with your rival before leaving this page.</FieldHelp></label>
                </article>
              </div>
              <p v-if="generatedInviteError" class="form-error" role="alert">{{ generatedInviteError }}</p>
            </section>

            <section v-if="(workspaceView === 'overview' || workspaceView === 'challenges') && challengesQuery.isSuccess.value && historyChallenges.length" class="section-block history-section">
              <div class="section-heading">
                <div>
                  <div class="eyebrow"><span class="eyebrow-line"></span> THE RECORD BOOK</div>
                  <h2>Past challenges <span class="count-pill">{{ historyChallenges.length }}</span></h2>
                </div>
              </div>
              <div class="history-list">
                <article v-for="challenge in historyChallenges" :key="challenge.id" class="history-card">
                  <span class="history-icon"><Trophy :size="17" /></span>
                  <div class="history-main"><strong>{{ challenge.name }}</strong><span>{{ challenge.opponentName ?? 'Rival' }} · {{ challenge.currentSeason ?? 'No season recorded' }}</span></div>
                  <div class="history-score">{{ challenge.myScore }} <span>—</span> {{ challenge.opponentScore }}</div>
                  <span class="history-status">{{ challenge.status }}</span>
                  <button class="card-open" :aria-label="`Open ${challenge.name}`" @click="router.push(`/challenges/${challenge.id}`)"><ArrowDownLeft class="history-arrow" :size="16" /></button>
                </article>
              </div>
            </section>
          </div>

          <aside v-if="workspaceView === 'overview' || workspaceView === 'invitations'" class="secondary-column" :class="{ 'invitation-page': workspaceView === 'invitations' }">
            <section id="invitations" v-if="workspaceView === 'overview' || workspaceView === 'invitations'" class="side-card invite-card">
              <div class="side-card-heading">
                <div class="side-icon"><Users :size="17" /></div>
                <div><span class="eyebrow">YOUR NEXT RIVAL</span><h3>Invitations <span v-if="invitationsQuery.isSuccess.value" class="count-pill">{{ invitationsQuery.data.value?.length }}</span></h3></div>
              </div>
              <p class="side-copy">Join a friend's challenge or invite them into yours.</p>
              <form class="join-form" @submit.prevent="joinWithCode">
                <InputText id="invitation-code" v-model="inviteToken" placeholder="Paste an invite code" aria-label="Invitation code" />
                <Button type="submit" class="join-button" :disabled="joining || !inviteToken.trim()" :loading="joining" aria-label="Join challenge"><ChevronRight :size="17" /></Button>
              </form>
              <FieldHelp for="invitation-code">Use the private link or code shared by the challenge administrator.</FieldHelp>
              <p v-if="inviteError" class="form-error" role="alert">{{ inviteError }}</p>
              <div v-if="invitationsQuery.isPending.value" class="invitation-empty">Loading invitations...</div>
              <div v-else-if="invitationsQuery.isError.value" class="form-error" role="alert">Invitations could not be loaded. <button class="link-button" @click="() => invitationsQuery.refetch()">Try again</button></div>
              <div v-else-if="invitationsQuery.data.value?.length" class="invitation-list">
                <article v-for="invitation in invitationsQuery.data.value" :key="invitation.id" class="invitation-row">
                  <span class="inviter-avatar">{{ invitation.inviterName.slice(0, 1).toUpperCase() }}</span>
                  <div><strong>{{ invitation.challengeName }}</strong><small>From {{ invitation.inviterName }}</small></div>
                  <button class="accept-button" :disabled="pendingInvitations.has(invitation.id)" aria-label="Accept invitation" @click="acceptInvitation(invitation.id)"><Check :size="15" /></button>
                  <button class="link-button" :disabled="pendingInvitations.has(invitation.id)" :aria-label="`Decline invitation to ${invitation.challengeName}`" @click="declineInvitation(invitation.id)">Decline</button>
                </article>
              </div>
              <div v-else class="invitation-empty">No invitations waiting for you.</div>
            </section>

            <section v-if="workspaceView === 'overview'" class="side-card rules-card">
              <div class="side-card-heading">
                <div class="side-icon gold"><Sparkles :size="17" /></div>
                <div><span class="eyebrow">THE RULES</span><h3>Race to 500</h3></div>
              </div>
              <div class="rule-item"><span class="rule-number">01</span><span>Earn points for trophies, promotions, and career milestones.</span></div>
              <div class="rule-item"><span class="rule-number">02</span><span>Play at your own pace. Seasons—not speed—decide the race.</span></div>
              <div class="rule-item"><span class="rule-number">03</span><span>Reach 500 points and manage at least three clubs to win.</span></div>
              <div class="target-progress"><div class="target-orbit"><Trophy :size="15" /></div><div><strong>500</strong><small>POINTS TO GLORY</small></div></div>
            </section>

          </aside>
        </section>
      </div>
    </section>
  </main>

  <Dialog v-model:visible="notificationsVisible" modal header="Notifications" :style="{ width: 'min(94vw, 520px)' }">
    <div v-if="notificationsQuery.isPending.value" class="challenge-placeholder">Loading notifications...</div>
    <div v-else-if="notificationsQuery.isError.value" class="form-error" role="alert">Notifications could not be loaded. <button class="link-button" @click="() => notificationsQuery.refetch()">Try again</button></div>
    <div v-else-if="!notificationsQuery.data.value?.length" class="invitation-empty">No notifications yet.</div>
    <div v-else class="notification-list">
      <article v-for="notification in notificationsQuery.data.value" :key="notification.id" class="notification-item">
        <div><strong>{{ notification.title }}</strong><p>{{ notification.message }}</p><small>{{ formatActivity(notification.createdAt) }}</small></div>
        <button v-if="!notification.readAt" class="link-button" :disabled="pendingNotifications.has(notification.id)" @click="markNotificationRead(notification)">Mark as read</button>
      </article>
    </div>
    <p v-if="notificationError" class="form-error" role="alert">{{ notificationError }}</p>
  </Dialog>

  <Dialog v-model:visible="profileDialogVisible" modal :closable="profileQuery.data.value?.hasCompletedOnboarding ?? false" :close-on-escape="profileQuery.data.value?.hasCompletedOnboarding ?? false" :header="profileQuery.data.value?.hasCompletedOnboarding ? 'Edit profile' : 'Set up your profile'" :style="{ width: 'min(94vw, 460px)' }">
    <form class="dialog-form" @submit.prevent="saveProfile">
      <p class="dialog-intro">Choose the public name shown to other managers. Leave the avatar URL blank to use your initial.</p>
      <label for="profile-name">Public name</label>
      <InputText id="profile-name" v-model="profileName" required maxlength="80" />
      <FieldHelp for="profile-name">Choose the name your rival will see.</FieldHelp>
      <label for="profile-avatar">Avatar URL (optional, HTTPS)</label>
      <InputText id="profile-avatar" v-model="profileAvatar" type="url" maxlength="2048" />
      <FieldHelp for="profile-avatar" example="https://example.com/avatar.png">Use a public HTTPS image URL, or leave this blank to show your initial.</FieldHelp>
      <p v-if="profileError" class="form-error" role="alert">{{ profileError }}</p>
      <div class="dialog-actions">
        <Button v-if="profileQuery.data.value?.hasCompletedOnboarding" type="button" class="cancel-button" label="Cancel" @click="profileDialogVisible = false" />
        <Button type="submit" class="primary-button" :loading="profileSaving" label="Save profile" />
      </div>
    </form>
  </Dialog>

  <Dialog v-model:visible="createDialogVisible" modal header="Start a new challenge" :style="{ width: 'min(94vw, 460px)' }">
    <form class="dialog-form" @submit.prevent="createChallenge">
      <p class="dialog-intro">Set up your Race to 500. Save a draft to configure its rules before publishing and inviting your rival.</p>
      <label for="challenge-name">Challenge name</label>
      <InputText id="challenge-name" v-model="createName" required maxlength="80" placeholder="e.g. The North Star Derby" />
      <FieldHelp for="challenge-name" example="A shared name such as The North Star Derby">Choose a name both managers will recognize.</FieldHelp>
      <label for="challenge-description">Description (optional)</label>
      <InputText id="challenge-description" v-model="createDescription" maxlength="500" />
      <FieldHelp for="challenge-description">Add context for your rival; the limit is 500 characters.</FieldHelp>
      <label for="trainer-name">Trainer name (optional)</label>
      <InputText id="trainer-name" v-model="createTrainerName" maxlength="80" :placeholder="profileQuery.data.value?.displayName" />
      <FieldHelp for="trainer-name">This is the manager name displayed in the challenge. You can use your profile name.</FieldHelp>
      <label for="start-season">Starting season</label>
      <InputText id="start-season" v-model="createSeasonYear" required inputmode="numeric" pattern="[0-9]{4}" />
      <FieldHelp for="start-season" example="Enter 2026 for the 2026/27 season.">Enter the four-digit start year of the first FM season.</FieldHelp>
      <label><input id="save-as-draft" v-model="createAsDraft" type="checkbox" /> Save as draft</label>
      <FieldHelp for="save-as-draft">Configure rules before publication; gameplay and invitations begin after publishing.</FieldHelp>
      <fieldset>
        <legend>Official achievements</legend>
        <p id="official-achievement-help" class="dialog-intro">Choose the achievements active at the start. You can enable others and add custom achievements later in Rules.</p>
        <p v-if="catalogQuery.isPending.value">Loading the official catalog...</p>
        <p v-else-if="catalogQuery.isError.value" class="form-error" role="alert">The catalog could not be loaded. <button type="button" class="link-button" @click="() => catalogQuery.refetch()">Try again</button></p>
        <template v-else>
          <div class="dialog-actions"><button type="button" class="link-button" @click="createAchievementCodes = (catalogQuery.data.value ?? []).map(item => item.code)">Select all</button><button type="button" class="link-button" @click="createAchievementCodes = []">Clear selection</button></div>
          <div style="max-height: 220px; overflow-y: auto">
            <label v-for="item in catalogQuery.data.value" :key="item.code" style="display: block">
              <input v-model="createAchievementCodes" type="checkbox" :value="item.code" aria-describedby="official-achievement-help" /> {{ item.code }} · {{ item.name }} (+{{ item.defaultPoints }})
            </label>
          </div>
        </template>
      </fieldset>
      <p v-if="createError" class="form-error" role="alert">{{ createError }}</p>
      <div class="dialog-actions">
        <Button type="button" class="cancel-button" label="Cancel" @click="createDialogVisible = false" />
        <Button type="submit" class="primary-button" :loading="createPending" :disabled="!catalogSelectionInitialized" label="Create challenge" />
      </div>
    </form>
  </Dialog>
</template>
