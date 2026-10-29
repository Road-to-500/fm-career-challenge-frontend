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

type UserProfile = SessionProfile

type ChallengeCard = {
  id: string
  name: string
  status: string
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

const queryClient = useQueryClient()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { t } = useI18n()
const createDialogVisible = ref(false)
const createName = ref('')
const createSeasonYear = ref('2026')
const createError = ref('')
const createPending = ref(false)
const inviteToken = ref('')
const inviteError = ref('')
const copiedChallengeId = ref<string>()
const connectionStatus = ref<'connected' | 'disconnected'>('disconnected')
let stopRealtime: (() => void) | undefined

const profileQuery = useQuery({
  queryKey: ['me'],
  queryFn: () => api<UserProfile>('/api/me'),
  retry: false,
})
const challengesQuery = useQuery({
  queryKey: ['my-challenges'],
  queryFn: () => api<ChallengeCard[]>('/api/me/challenges'),
  enabled: computed(() => profileQuery.isSuccess.value),
})
const invitationsQuery = useQuery({
  queryKey: ['invitations'],
  queryFn: () => api<Invitation[]>('/api/me/invitations'),
  enabled: computed(() => profileQuery.isSuccess.value),
})

watch(
  () => profileQuery.data.value,
  (profile) => {
    if (profile) session.setProfile(profile)
  },
  { immediate: true },
)

const challengeId = computed(() => String(route.params.id ?? ''))
const activeChallenges = computed(
  () => challengesQuery.data.value?.filter((item) => ['Active', 'PendingPlayers'].includes(item.status)) ?? [],
)
const completedChallenges = computed(
  () =>
    challengesQuery.data.value?.filter((item) =>
      ['Completed', 'Archived'].includes(item.status),
    ) ?? [],
)
const totalPoints = computed(() =>
  (challengesQuery.data.value ?? []).reduce((sum, item) => sum + item.myScore, 0),
)

onMounted(() => {
  if (challengeId.value) {
    stopRealtime = connectChallengeRealtime(challengeId.value, queryClient, (connected) => {
      connectionStatus.value = connected ? 'connected' : 'disconnected'
    })
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
}

async function createChallenge() {
  createError.value = ''
  createPending.value = true
  try {
    const created = await api<{ id: string }>('/api/challenges', {
      method: 'POST',
      body: JSON.stringify({
        name: createName.value.trim(),
        startSeasonYear: Number(createSeasonYear.value),
      }),
    })
    await queryClient.invalidateQueries({ queryKey: ['my-challenges'] })
    createDialogVisible.value = false
    createName.value = ''
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
  try {
    const response = await api<{ url: string }>(`/api/challenges/${id}/invites`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    await navigator.clipboard.writeText(response.url)
    copiedChallengeId.value = id
    window.setTimeout(() => (copiedChallengeId.value = undefined), 1800)
    await queryClient.invalidateQueries({ queryKey: ['my-challenges'] })
  } catch (error) {
    createError.value = error instanceof Error ? error.message : 'Invite link could not be copied.'
  }
}

async function handleSignOut() {
  try {
    await signOut()
    session.clearProfile()
    await queryClient.clear()
    window.location.assign('/dashboard')
  } catch (error) {
    createError.value = error instanceof Error ? error.message : 'Sign out failed.'
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
    <aside class="sidebar">
      <a class="brand" href="/dashboard" aria-label="FM Career Challenge home">
        <span class="brand-mark"><Trophy :size="19" :stroke-width="2.4" /></span>
        <span class="brand-copy">FM CAREER<span>CHALLENGE</span></span>
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
          <span class="connection-indicator" :class="connectionStatus" :title="connectionStatus">
            <span class="online-dot"></span> {{ connectionStatus === 'connected' ? 'Live' : 'Offline' }}
          </span>
          <button class="icon-button" aria-label="Notifications"><Bell :size="18" /><span class="notification-dot"></span></button>
          <div v-if="profileQuery.data.value" class="user-menu">
            <img
              v-if="profileQuery.data.value.avatarUrl"
              :src="profileQuery.data.value.avatarUrl"
              :alt="`${profileQuery.data.value.displayName}'s avatar`"
              class="avatar"
            />
            <span v-else class="avatar avatar-initials">{{ profileQuery.data.value.displayName.slice(0, 1).toUpperCase() }}</span>
            <span class="user-name">{{ profileQuery.data.value.displayName }}</span>
            <button class="icon-button small" aria-label="Sign out" @click="handleSignOut"><ChevronDown :size="16" /></button>
          </div>
          <div v-else class="provider-actions">
            <button class="text-button" @click="signIn('google')">Sign in</button>
          </div>
        </div>
      </header>

      <div class="page-content">
        <section class="welcome-row">
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

        <section class="stats-grid" aria-label="Career statistics">
          <article class="stat-card">
            <div class="stat-icon olive"><Flag :size="18" /></div>
            <div class="stat-value">{{ challengesQuery.data.value?.length ?? '—' }}</div>
            <div class="stat-label">TOTAL CHALLENGES</div>
            <div class="stat-foot"><span>Across your career</span></div>
          </article>
          <article class="stat-card">
            <div class="stat-icon gold"><Trophy :size="18" /></div>
            <div class="stat-value">{{ totalPoints.toLocaleString('en') }}</div>
            <div class="stat-label">CAREER POINTS</div>
            <div class="stat-foot"><span>Across all challenges</span></div>
          </article>
          <article class="stat-card">
            <div class="stat-icon green"><ArrowUpRight :size="18" /></div>
            <div class="stat-value">{{ activeChallenges.length }}</div>
            <div class="stat-label">IN PROGRESS</div>
            <div class="stat-foot"><span>Ready for the next season</span></div>
          </article>
          <article class="stat-card">
            <div class="stat-icon blue"><Shield :size="18" /></div>
            <div class="stat-value">{{ completedChallenges.length }}</div>
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
              <Button class="provider-button google-button" @click="signIn('google')">
                <span class="provider-g">G</span> Continue with Google
              </Button>
              <Button class="provider-button microsoft-button" @click="signIn('microsoft')">
                <span class="microsoft-mark"><i></i><i></i><i></i><i></i></span> Continue with Microsoft
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
                  <h2>Active challenges <span class="count-pill">{{ activeChallenges.length }}</span></h2>
                </div>
                <button class="link-button" @click="createDialogVisible = true">Create challenge <ChevronRight :size="15" /></button>
              </div>

              <div v-if="challengesQuery.isPending.value" class="challenge-placeholder">Loading your challenges…</div>
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
                  <div class="progress-label"><span>Journey to 500</span><span>{{ Math.min(100, Math.round((challenge.myScore / challenge.targetPoints) * 100)) }}%</span></div>
                  <ProgressBar :value="Math.min(100, Math.round((challenge.myScore / challenge.targetPoints) * 100))" :show-value="false" />
                  <div class="challenge-footer">
                    <span><span class="season-dot"></span> {{ challenge.currentSeason ?? 'Season 1' }}</span>
                    <span>Updated {{ formatActivity(challenge.lastActivityAt) }}</span>
                    <div class="card-actions">
                      <button class="subtle-action" :aria-label="`Copy invite for ${challenge.name}`" @click="copyInvite(challenge.id)">
                        <Check v-if="copiedChallengeId === challenge.id" :size="14" />
                        <Clipboard v-else :size="14" />
                      </button>
                      <button class="card-open" aria-label="Open challenge" @click="router.push(`/challenges/${challenge.id}`)"><ChevronRight :size="17" /></button>
                    </div>
                  </div>
                </article>
              </div>
            </section>

            <section v-if="completedChallenges.length" class="section-block history-section">
              <div class="section-heading">
                <div>
                  <div class="eyebrow"><span class="eyebrow-line"></span> THE RECORD BOOK</div>
                  <h2>Past challenges <span class="count-pill">{{ completedChallenges.length }}</span></h2>
                </div>
              </div>
              <div class="history-list">
                <article v-for="challenge in completedChallenges" :key="challenge.id" class="history-card">
                  <span class="history-icon"><Trophy :size="17" /></span>
                  <div class="history-main"><strong>{{ challenge.name }}</strong><span>{{ challenge.opponentName ?? 'Rival' }} · {{ challenge.currentSeason ?? 'Completed' }}</span></div>
                  <div class="history-score">{{ challenge.myScore }} <span>—</span> {{ challenge.opponentScore }}</div>
                  <span class="history-status">{{ challenge.status }}</span>
                  <ArrowDownLeft class="history-arrow" :size="16" />
                </article>
              </div>
            </section>
          </div>

          <aside class="secondary-column">
            <section id="invitations" class="side-card invite-card">
              <div class="side-card-heading">
                <div class="side-icon"><Users :size="17" /></div>
                <div><span class="eyebrow">YOUR NEXT RIVAL</span><h3>Invitations <span class="count-pill">{{ invitationsQuery.data.value?.length ?? 0 }}</span></h3></div>
              </div>
              <p class="side-copy">Join a friend's challenge or invite them into yours.</p>
              <form class="join-form" @submit.prevent="joinWithCode">
                <InputText v-model="inviteToken" placeholder="Paste an invite code" aria-label="Invitation code" />
                <Button type="submit" class="join-button" aria-label="Join challenge"><ChevronRight :size="17" /></Button>
              </form>
              <p v-if="inviteError" class="form-error" role="alert">{{ inviteError }}</p>
              <div v-if="invitationsQuery.data.value?.length" class="invitation-list">
                <article v-for="invitation in invitationsQuery.data.value" :key="invitation.id" class="invitation-row">
                  <span class="inviter-avatar">{{ invitation.inviterName.slice(0, 1).toUpperCase() }}</span>
                  <div><strong>{{ invitation.challengeName }}</strong><small>From {{ invitation.inviterName }}</small></div>
                  <button class="accept-button" aria-label="Accept invitation" @click="acceptInvitation(invitation.id)"><Check :size="15" /></button>
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

  <Dialog v-model:visible="createDialogVisible" modal header="Start a new challenge" :style="{ width: 'min(94vw, 460px)' }">
    <form class="dialog-form" @submit.prevent="createChallenge">
      <p class="dialog-intro">Set up your Race to 500. You can invite your rival once it's created.</p>
      <label for="challenge-name">Challenge name</label>
      <InputText id="challenge-name" v-model="createName" required maxlength="80" placeholder="e.g. The North Star Derby" />
      <label for="start-season">Starting season</label>
      <InputText id="start-season" v-model="createSeasonYear" required inputmode="numeric" pattern="[0-9]{4}" />
      <p v-if="createError" class="form-error" role="alert">{{ createError }}</p>
      <div class="dialog-actions">
        <Button type="button" class="cancel-button" label="Cancel" @click="createDialogVisible = false" />
        <Button type="submit" class="primary-button" :loading="createPending" label="Create challenge" />
      </div>
    </form>
  </Dialog>
</template>
