<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
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
import { connectChallengeRealtime } from '../lib/realtime'
import { useSessionStore, type SessionProfile } from '../stores/session'
import ThemeToggle from '../components/ThemeToggle.vue'

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
  if (notification.readAt) return
  notificationError.value = ''
  try {
    await api(`/api/me/notifications/${notification.id}/read`, { method: 'PATCH' })
    await queryClient.invalidateQueries({ queryKey: ['notifications'] })
  } catch (error) {
    notificationError.value = error instanceof Error ? error.message : 'Notification could not be updated.'
  }
}

async function createChallenge() {
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
  inviteError.value = ''
  try {
    await api(`/api/me/invitations/${invitationId}/accept`, { method: 'POST' })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['invitations'] }),
      queryClient.invalidateQueries({ queryKey: ['my-challenges'] }),
    ])
  } catch (error) {
    inviteError.value = error instanceof Error ? error.message : 'Invitation could not be accepted.'
  }
}

async function declineInvitation(invitationId: string) {
  inviteError.value = ''
  try {
    await api(`/api/me/invitations/${invitationId}/decline`, { method: 'POST' })
    await queryClient.invalidateQueries({ queryKey: ['invitations'] })
  } catch (error) {
    inviteError.value = error instanceof Error ? error.message : 'Invitation could not be declined.'
  }
}

async function joinWithCode() {
  inviteError.value = ''
  try {
    await api('/api/challenges/join', {
      method: 'POST',
      body: JSON.stringify({ token: inviteToken.value.trim() }),
    })
    inviteToken.value = ''
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['invitations'] }),
      queryClient.invalidateQueries({ queryKey: ['my-challenges'] }),
    ])
  } catch (error) {
    inviteError.value = error instanceof Error ? error.message : 'Invitation could not be accepted.'
  }
}

async function copyInvite(id: string) {
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
  }
}

async function handleSignOut() {
  sessionError.value = ''
  try {
    await signOut()
    session.clearProfile()
    await queryClient.clear()
    window.location.assign('/dashboard')
  } catch (error) {
    sessionError.value = error instanceof Error ? error.message : 'Sign out failed.'
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
        && [401, 403].includes(profileQuery.error.value.status)),
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
  <main class="app-shell">
    <a class="skip-link" href="#dashboard-content">Skip to main content</a>
    <aside class="sidebar">
      <a class="brand" href="/dashboard" aria-label="FM Career Challenge home">
        <span class="brand-mark"><Trophy :size="19" :stroke-width="2.4" /></span>
        <span class="brand-copy">FM CAREER <span>CHALLENGE</span></span>
      </a>

      <div class="workspace-label">WORKSPACE</div>
      <nav class="main-nav" aria-label="Main navigation">
        <a class="nav-link active" href="/dashboard"><Radio :size="17" /> Overview</a>
        <a class="nav-link" href="#active-challenges"><Flag :size="17" /> My challenges</a>
        <a class="nav-link" href="#invitations"><Users :size="17" /> Invitations</a>
      </nav>

      <div class="sidebar-bottom">
        <div class="season-card">
          <div class="season-eyebrow"><Sparkles :size="13" /> THE LONG GAME</div>
          <p>Every season tells a story. Make yours count.</p>
        </div>
        <a class="nav-link muted" href="#about"><CircleHelp :size="17" /> How it works</a>
        <div class="sidebar-footer">
          <span class="online-dot"></span>
          <span>Race to 500</span>
          <span class="version-label">V1.0</span>
        </div>
      </div>
    </aside>

    <section class="main-panel">
      <header class="topbar">
        <div class="breadcrumb"><span>Workspace</span><ChevronRight :size="14" /><strong>Overview</strong></div>
        <div class="topbar-actions">
          <ThemeToggle />
          <span class="connection-indicator" :class="connectionStatus" :title="connectionStatus">
            <span class="online-dot"></span> {{ connectionStatus === 'connected' ? 'Live' : 'Offline' }}
          </span>
          <button v-if="profileQuery.isSuccess.value" class="icon-button" :aria-label="notificationsQuery.isSuccess.value ? `Notifications, ${unreadNotifications} unread` : 'Notifications, count unavailable'" @click="notificationsVisible = true"><Bell :size="18" /><span v-if="notificationsQuery.isSuccess.value && unreadNotifications" class="notification-dot"></span></button>
          <div v-if="profileQuery.data.value" class="user-menu">
            <img
              v-if="profileQuery.data.value.avatarUrl"
              :src="profileQuery.data.value.avatarUrl"
              :alt="`${profileQuery.data.value.displayName}'s avatar`"
              class="avatar"
            />
            <span v-else class="avatar avatar-initials">{{ profileQuery.data.value.displayName.slice(0, 1).toUpperCase() }}</span>
            <span class="user-name">{{ profileQuery.data.value.displayName }}</span>
            <button class="text-button" @click="openProfile">Edit profile</button>
            <button class="icon-button small" aria-label="Sign out" @click="handleSignOut"><ChevronDown :size="16" /></button>
          </div>
          <div v-else class="provider-actions">
            <button class="text-button" @click="signIn()">Sign in</button>
          </div>
        </div>
      </header>

      <div id="dashboard-content" class="page-content" tabindex="-1">
        <p v-if="sessionError" class="form-error" role="alert">{{ sessionError }}</p>
        <section class="welcome-row">
          <div>
            <div class="eyebrow"><span class="eyebrow-line"></span> YOUR MANAGER JOURNEY</div>
            <h1>Build a career<br /><em>worth remembering.</em></h1>
            <p class="intro-copy">
              One save at a time. Track your milestones, outsmart the timeline, and be the first to 500.
            </p>
          </div>
          <div class="welcome-actions">
            <Button class="primary-button" :disabled="!profileQuery.isSuccess.value" @click="createDialogVisible = true">
              <Plus :size="17" /> New challenge
            </Button>
          </div>
        </section>

        <section class="stats-grid" aria-label="Career statistics">
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
          <strong>We could not load your workspace.</strong>
          <p>{{ profileQuery.error.value?.message }} Check your connection and try again.</p>
          <Button class="secondary-button" @click="() => profileQuery.refetch()">Try again</Button>
        </section>

        <section v-else-if="profileQuery.isError.value" class="onboarding-card" id="about">
          <div class="onboarding-art"><Trophy :size="43" :stroke-width="1.25" /></div>
          <div class="onboarding-content">
            <div class="eyebrow"><span class="eyebrow-line"></span> START YOUR STORY</div>
            <h2>Every great career starts somewhere.</h2>
            <p>Sign in to create your first Race to 500 challenge, invite a rival, and start building your manager legacy.</p>
            <div class="login-actions">
              <Button class="provider-button google-button" @click="signIn()">
                <span class="provider-g">G</span> Continue with Google
              </Button>
            </div>
            <div class="login-foot"><Shield :size="13" /> Secure sign-in. No password to remember.</div>
          </div>
        </section>

        <section v-else class="content-grid">
          <div class="primary-column">
            <section id="active-challenges" class="section-block">
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
                      <button v-if="challenge.status === 'PendingPlayers' && challenge.role === 'Administrator'" class="subtle-action" :aria-label="`Create invite for ${challenge.name}`" @click="copyInvite(challenge.id)">
                        <Check v-if="copiedChallengeId === challenge.id" :size="14" />
                        <Clipboard v-else :size="14" />
                      </button>
                      <button class="card-open" aria-label="Open challenge" @click="router.push(`/challenges/${challenge.id}`)"><ChevronRight :size="17" /></button>
                    </div>
                  </div>
                  <label v-if="generatedInvite?.challengeId === challenge.id">Invitation link (copy it now)<InputText :model-value="generatedInvite.url" readonly /></label>
                </article>
              </div>
              <p v-if="generatedInviteError" class="form-error" role="alert">{{ generatedInviteError }}</p>
            </section>

            <section v-if="challengesQuery.isSuccess.value && historyChallenges.length" class="section-block history-section">
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

          <aside class="secondary-column">
            <section id="invitations" class="side-card invite-card">
              <div class="side-card-heading">
                <div class="side-icon"><Users :size="17" /></div>
                <div><span class="eyebrow">YOUR NEXT RIVAL</span><h3>Invitations <span v-if="invitationsQuery.isSuccess.value" class="count-pill">{{ invitationsQuery.data.value?.length }}</span></h3></div>
              </div>
              <p class="side-copy">Join a friend's challenge or invite them into yours.</p>
              <form class="join-form" @submit.prevent="joinWithCode">
                <InputText v-model="inviteToken" placeholder="Paste an invite code" aria-label="Invitation code" />
                <Button type="submit" class="join-button" aria-label="Join challenge"><ChevronRight :size="17" /></Button>
              </form>
              <p v-if="inviteError" class="form-error" role="alert">{{ inviteError }}</p>
              <div v-if="invitationsQuery.isPending.value" class="invitation-empty">Loading invitations...</div>
              <div v-else-if="invitationsQuery.isError.value" class="form-error" role="alert">Invitations could not be loaded. <button class="link-button" @click="() => invitationsQuery.refetch()">Try again</button></div>
              <div v-else-if="invitationsQuery.data.value?.length" class="invitation-list">
                <article v-for="invitation in invitationsQuery.data.value" :key="invitation.id" class="invitation-row">
                  <span class="inviter-avatar">{{ invitation.inviterName.slice(0, 1).toUpperCase() }}</span>
                  <div><strong>{{ invitation.challengeName }}</strong><small>From {{ invitation.inviterName }}</small></div>
                  <button class="accept-button" aria-label="Accept invitation" @click="acceptInvitation(invitation.id)"><Check :size="15" /></button>
                  <button class="link-button" :aria-label="`Decline invitation to ${invitation.challengeName}`" @click="declineInvitation(invitation.id)">Decline</button>
                </article>
              </div>
              <div v-else class="invitation-empty">No invitations waiting for you.</div>
            </section>

            <section class="side-card rules-card">
              <div class="side-card-heading">
                <div class="side-icon gold"><Sparkles :size="17" /></div>
                <div><span class="eyebrow">THE RULES</span><h3>Race to 500</h3></div>
              </div>
              <div class="rule-item"><span class="rule-number">01</span><span>Earn points for trophies, promotions, and career milestones.</span></div>
              <div class="rule-item"><span class="rule-number">02</span><span>Play at your own pace. Seasons—not speed—decide the race.</span></div>
              <div class="rule-item"><span class="rule-number">03</span><span>Reach 500 points and manage at least three clubs to win.</span></div>
              <div class="target-progress"><div class="target-orbit"><Trophy :size="15" /></div><div><strong>500</strong><small>POINTS TO GLORY</small></div></div>
            </section>

            <section class="quote-card">
              <span class="quote-mark">“</span>
              <p>Football is played with the head. Your feet are just the tools.</p>
              <small>— Andrea Pirlo</small>
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
        <button v-if="!notification.readAt" class="link-button" @click="markNotificationRead(notification)">Mark as read</button>
      </article>
    </div>
    <p v-if="notificationError" class="form-error" role="alert">{{ notificationError }}</p>
  </Dialog>

  <Dialog v-model:visible="profileDialogVisible" modal :closable="profileQuery.data.value?.hasCompletedOnboarding ?? false" :close-on-escape="profileQuery.data.value?.hasCompletedOnboarding ?? false" :header="profileQuery.data.value?.hasCompletedOnboarding ? 'Edit profile' : 'Set up your profile'" :style="{ width: 'min(94vw, 460px)' }">
    <form class="dialog-form" @submit.prevent="saveProfile">
      <p class="dialog-intro">Choose the public name shown to other managers. Leave the avatar URL blank to use your initial.</p>
      <label for="profile-name">Public name</label>
      <InputText id="profile-name" v-model="profileName" required maxlength="80" />
      <label for="profile-avatar">Avatar URL (optional, HTTPS)</label>
      <InputText id="profile-avatar" v-model="profileAvatar" type="url" maxlength="2048" />
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
      <label for="challenge-description">Description (optional)</label>
      <InputText id="challenge-description" v-model="createDescription" maxlength="500" />
      <label for="trainer-name">Trainer name (optional)</label>
      <InputText id="trainer-name" v-model="createTrainerName" maxlength="80" :placeholder="profileQuery.data.value?.displayName" />
      <label for="start-season">Starting season</label>
      <InputText id="start-season" v-model="createSeasonYear" required inputmode="numeric" pattern="[0-9]{4}" />
      <label><input v-model="createAsDraft" type="checkbox" /> Save as draft</label>
      <fieldset>
        <legend>Official achievements</legend>
        <p class="dialog-intro">Choose the achievements active at the start. You can enable others and add custom achievements later in Rules.</p>
        <p v-if="catalogQuery.isPending.value">Loading the official catalog...</p>
        <p v-else-if="catalogQuery.isError.value" class="form-error" role="alert">The catalog could not be loaded. <button type="button" class="link-button" @click="() => catalogQuery.refetch()">Try again</button></p>
        <template v-else>
          <div class="dialog-actions"><button type="button" class="link-button" @click="createAchievementCodes = (catalogQuery.data.value ?? []).map(item => item.code)">Select all</button><button type="button" class="link-button" @click="createAchievementCodes = []">Clear selection</button></div>
          <div style="max-height: 220px; overflow-y: auto">
            <label v-for="item in catalogQuery.data.value" :key="item.code" style="display: block">
              <input v-model="createAchievementCodes" type="checkbox" :value="item.code" /> {{ item.code }} · {{ item.name }} (+{{ item.defaultPoints }})
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
