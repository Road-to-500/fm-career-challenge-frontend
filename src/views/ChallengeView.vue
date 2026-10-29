<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { ArrowLeft, ArrowUpRight, BadgeCheck, CalendarDays, ChevronRight, CirclePlus, Clock3, Flag, Medal, Plus, Radio, Settings2, Shield, Trophy, Users } from '@lucide/vue'
import { useForm } from 'vee-validate'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../lib/api'
import { connectChallengeRealtime } from '../lib/realtime'

const ScoreTimelineChart = defineAsyncComponent(() => import('../components/ScoreTimelineChart.vue'))

type Participant = {
  id: string
  userId: string
  displayName: string
  trainerName?: string
  avatarUrl?: string
  score: number
  isCurrentUser: boolean
  role: 'Administrator' | 'Participant'
}

type Dashboard = {
  challenge: {
    id: string
    name: string
    description?: string
    targetPoints: number
    startSeasonYear: number
    status: string
    winningParticipantId?: string
    winningSeasonIndex?: number
  }
  participants: Participant[]
}

type Season = {
  id: string
  seasonIndex: number
  displayName: string
  status: string
  leagueMatches: number
  leagueWins: number
  leagueDraws: number
  leagueLosses: number
  leaguePoints: number
  goalsFor: number
  goalsAgainst: number
  leaguePosition?: number
  largestOutgoingTransfer: number
  currency: string
  notes?: string
}

type Achievement = {
  code: string
  name: string
  description: string
  category: string
  frequency: string
  points: number
  isEnabled: boolean
  claims: Array<{ id: string; seasonIndex: number; clubName?: string }>
}

type Career = {
  id: string
  trainerName: string
  currentClubName?: string
  clubs: Array<{
    id: string
    clubName: string
    countryCode: string
    countryName: string
    startSeasonIndex: number
    endSeasonIndex?: number
    initialDivisionLevel: number
    officialMatches: number
  }>
}

type Activity = {
  id: string
  type: string
  message: string
  seasonIndex?: number
  createdAt: string
  participantName: string
}

type ScoreTimeline = {
  participants: Array<{ id: string; name: string; isCurrentUser: boolean }>
  series: Array<{
    participantId: string
    participantName: string
    isCurrentUser: boolean
    seasonIndex: number
    confirmedPoints: number
    potentialPoints: number
    cumulativePoints: number
  }>
}

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const queryClient = useQueryClient()
const challengeId = String(route.params.id)
const activeTab = ref('Overview')
const connectionStatus = ref(false)
const clubDialogVisible = ref(false)
const seasonDialogVisible = ref(false)
const achievementDialogVisible = ref(false)
const selectedAchievement = ref<Achievement>()
const formError = ref('')
const saving = ref(false)
const invitationMessage = ref('')
let stopRealtime: (() => void) | undefined

const challengeQuery = useQuery({
  queryKey: ['challenge', challengeId],
  queryFn: () => api<Dashboard>(`/api/challenges/${challengeId}/dashboard`),
})
const scoreQuery = useQuery({
  queryKey: ['scores', challengeId],
  queryFn: () => api<ScoreTimeline>(`/api/challenges/${challengeId}/scores`),
})
const seasonsQuery = useQuery({
  queryKey: ['seasons', challengeId],
  queryFn: () => api<Season[]>(`/api/challenges/${challengeId}/seasons`),
})
const careerQuery = useQuery({
  queryKey: ['career', challengeId],
  queryFn: () => api<Career>(`/api/challenges/${challengeId}/career`),
})
const achievementQuery = useQuery({
  queryKey: ['achievements', challengeId],
  queryFn: () => api<Achievement[]>(`/api/challenges/${challengeId}/achievements`),
})
const activityQuery = useQuery({
  queryKey: ['activity', challengeId],
  queryFn: () => api<Activity[]>(`/api/challenges/${challengeId}/activity`),
})

const challenge = computed(() => challengeQuery.data.value?.challenge)
const participants = computed(() => challengeQuery.data.value?.participants ?? [])
const me = computed(() => participants.value.find(item => item.isCurrentUser))
const rival = computed(() => participants.value.find(item => !item.isCurrentUser))
const allSeasons = computed(() => seasonsQuery.data.value ?? [])
const allClubs = computed(() => careerQuery.data.value?.clubs ?? [])
const achievements = computed(() => achievementQuery.data.value ?? [])
const categories = computed(() => [...new Set(achievements.value.map(item => item.category))])
const selectedCategory = ref('All')
const visibleAchievements = computed(() =>
  achievements.value.filter(item => selectedCategory.value === 'All' || item.category === selectedCategory.value),
)
const currentSeasonIndex = computed(() => {
  const active = allSeasons.value.find(item => item.status !== 'Completed')
  if (active) return active.seasonIndex
  return allSeasons.value.length ? Math.max(...allSeasons.value.map(item => item.seasonIndex)) + 1 : 0
})
const isReadOnly = computed(() => ['Completed', 'Archived'].includes(challenge.value?.status ?? ''))
onMounted(() => {
  stopRealtime = connectChallengeRealtime(challengeId, queryClient, connected => {
    connectionStatus.value = connected
  })
})

onUnmounted(() => stopRealtime?.())

const clubSchema = z.object({
  clubName: z.string().trim().min(1, 'Enter a club name.').max(120),
  countryName: z.string().trim().min(1, 'Enter a country.').max(80),
  countryCode: z.string().trim().min(2, 'Enter a country code.').max(8),
  startSeasonIndex: z.number().int().min(0).max(100),
  initialDivisionLevel: z.number().int().min(1).max(20),
  officialMatches: z.number().int().min(0).max(5000),
})
const clubForm = useForm({
  initialValues: { clubName: '', countryName: '', countryCode: '', startSeasonIndex: 0, initialDivisionLevel: 4, officialMatches: 0 },
})
const [clubName] = clubForm.defineField('clubName')
const [countryName] = clubForm.defineField('countryName')
const [countryCode] = clubForm.defineField('countryCode')
const [clubStartSeason] = clubForm.defineField('startSeasonIndex')
const [divisionLevel] = clubForm.defineField('initialDivisionLevel')
const [clubMatches] = clubForm.defineField('officialMatches')

const seasonSchema = z.object({
  leagueMatches: z.number().int().min(0),
  leagueWins: z.number().int().min(0),
  leagueDraws: z.number().int().min(0),
  leagueLosses: z.number().int().min(0),
  leaguePoints: z.number().int().min(0),
  goalsFor: z.number().int().min(0),
  goalsAgainst: z.number().int().min(0),
  leaguePosition: z.number().int().min(1).max(100).nullable(),
  largestOutgoingTransfer: z.number().min(0),
  currency: z.string().trim().min(3).max(3),
  notes: z.string().max(1000).optional(),
  isCompleted: z.boolean(),
})
const seasonForm = useForm({
  initialValues: {
    leagueMatches: 0, leagueWins: 0, leagueDraws: 0, leagueLosses: 0, leaguePoints: 0,
    goalsFor: 0, goalsAgainst: 0, leaguePosition: null as number | null,
    largestOutgoingTransfer: 0, currency: 'EUR', notes: '', isCompleted: false,
  },
})
const [leagueMatches] = seasonForm.defineField('leagueMatches')
const [leagueWins] = seasonForm.defineField('leagueWins')
const [leagueDraws] = seasonForm.defineField('leagueDraws')
const [leagueLosses] = seasonForm.defineField('leagueLosses')
const [leaguePoints] = seasonForm.defineField('leaguePoints')
const [goalsFor] = seasonForm.defineField('goalsFor')
const [goalsAgainst] = seasonForm.defineField('goalsAgainst')
const [leaguePosition] = seasonForm.defineField('leaguePosition')
const [largestOutgoingTransfer] = seasonForm.defineField('largestOutgoingTransfer')
const [currency] = seasonForm.defineField('currency')
const [seasonNotes] = seasonForm.defineField('notes')
const [isCompleted] = seasonForm.defineField('isCompleted')

const claimForm = useForm({
  initialValues: { seasonIndex: currentSeasonIndex.value, clubName: '', countryCode: '', notes: '' },
})
const [claimSeason] = claimForm.defineField('seasonIndex')
const [claimClub] = claimForm.defineField('clubName')
const [claimCountry] = claimForm.defineField('countryCode')
const [claimNotes] = claimForm.defineField('notes')

async function submitClub() {
  formError.value = ''
  const validation = clubSchema.safeParse(clubForm.values)
  if (!validation.success) {
    formError.value = validation.error.issues[0]?.message ?? 'Check the club details.'
    return
  }
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/career/stints`, {
      method: 'POST',
      body: JSON.stringify(validation.data),
    })
    clubDialogVisible.value = false
    clubForm.resetForm({ values: { ...clubForm.values, clubName: '', countryName: '', countryCode: '', officialMatches: 0 } })
    await invalidateChallenge()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Club could not be saved.'
  } finally {
    saving.value = false
  }
}

async function submitSeason() {
  formError.value = ''
  const validation = seasonSchema.safeParse(seasonForm.values)
  if (!validation.success) {
    formError.value = validation.error.issues[0]?.message ?? 'Check the season statistics.'
    return
  }
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/seasons/${currentSeasonIndex.value}`, {
      method: 'PUT',
      body: JSON.stringify(validation.data),
    })
    seasonDialogVisible.value = false
    await invalidateChallenge()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Season could not be saved.'
  } finally {
    saving.value = false
  }
}

function openAchievement(achievement: Achievement) {
  selectedAchievement.value = achievement
  claimForm.resetForm({
    values: {
      seasonIndex: currentSeasonIndex.value,
      clubName: careerQuery.data.value?.currentClubName ?? '',
      countryCode: careerQuery.data.value?.clubs.at(-1)?.countryCode ?? '',
      notes: '',
    },
  })
  formError.value = ''
  achievementDialogVisible.value = true
}

async function submitAchievement() {
  if (!selectedAchievement.value) return
  formError.value = ''
  const validation = z.object({
    seasonIndex: z.number().int().min(0).max(100),
    clubName: z.string().trim(),
    countryCode: z.string().trim(),
    notes: z.string().max(1000),
  }).safeParse(claimForm.values)
  if (!validation.success) {
    formError.value = validation.error.issues[0]?.message ?? 'Check the achievement details.'
    return
  }
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/achievement-claims`, {
      method: 'POST',
      body: JSON.stringify({ code: selectedAchievement.value.code, ...validation.data }),
    })
    achievementDialogVisible.value = false
    await invalidateChallenge()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Achievement could not be recorded.'
  } finally {
    saving.value = false
  }
}

async function inviteRival() {
  invitationMessage.value = ''
  try {
    const invitation = await api<{ url: string }>(`/api/challenges/${challengeId}/invites`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    await navigator.clipboard.writeText(invitation.url)
    invitationMessage.value = 'Invitation link copied.'
    window.setTimeout(() => (invitationMessage.value = ''), 2400)
  } catch (error) {
    invitationMessage.value = error instanceof Error ? error.message : 'Invitation could not be created.'
  }
}

async function invalidateChallenge() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] }),
    queryClient.invalidateQueries({ queryKey: ['my-challenges'] }),
    queryClient.invalidateQueries({ queryKey: ['seasons', challengeId] }),
    queryClient.invalidateQueries({ queryKey: ['career', challengeId] }),
    queryClient.invalidateQueries({ queryKey: ['achievements', challengeId] }),
    queryClient.invalidateQueries({ queryKey: ['activity', challengeId] }),
    queryClient.invalidateQueries({ queryKey: ['scores', challengeId] }),
  ])
}

function seasonName(index: number) {
  const start = (challenge.value?.startSeasonYear ?? 2026) + index
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`
}

function categoryIcon(category: string) {
  return category === 'Continental' || category === 'International' ? Medal : category === 'Career' ? Users : Trophy
}
</script>

<template>
  <main class="challenge-shell">
    <header class="challenge-topbar">
      <a class="brand" href="/dashboard"><span class="brand-mark"><Trophy :size="18" /></span><span class="brand-copy">FM CAREER<span>CHALLENGE</span></span></a>
      <div class="challenge-top-actions">
        <span class="connection-indicator" :class="{ connected: connectionStatus }"><span class="online-dot"></span>{{ connectionStatus ? 'Live updates on' : 'Reconnecting' }}</span>
        <Button class="outline-button" @click="router.push('/dashboard')"><ArrowLeft :size="15" /> Dashboard</Button>
      </div>
    </header>

    <div v-if="challengeQuery.isPending.value" class="challenge-loading"><span class="loading-spinner"></span> {{ t('challenge.loading') }}</div>
    <div v-else-if="challengeQuery.isError.value" class="detail-error">
      <strong>{{ t('challenge.unavailable') }}</strong>
      <p>{{ challengeQuery.error.value?.message }}</p>
      <Button class="outline-button" @click="router.push('/dashboard')">Back to dashboard</Button>
    </div>

    <template v-else-if="challenge">
      <section class="challenge-hero">
        <div class="challenge-hero-inner">
          <div class="challenge-hero-copy">
            <div class="hero-kicker"><span class="live-pulse"></span> {{ challenge.status.toUpperCase() }} <span class="hero-divider">/</span> RACE TO 500</div>
            <h1>{{ challenge.name }}</h1>
            <p>{{ challenge.description || 'A career is measured in seasons, not speed. Make every one count.' }}</p>
            <div class="hero-meta"><span><CalendarDays :size="14" /> Started {{ challenge.startSeasonYear }}/{{ String((challenge.startSeasonYear + 1) % 100).padStart(2, '0') }}</span><span><Users :size="14" /> {{ participants.length }} of 2 managers</span></div>
          </div>
          <div class="hero-actions">
            <Button v-if="!rival && me?.role === 'Administrator'" class="invite-button" @click="inviteRival"><Users :size="16" /> Invite your rival</Button>
            <span v-if="invitationMessage" class="invitation-feedback" role="status">{{ invitationMessage }}</span>
            <Tag v-if="isReadOnly" value="READ ONLY" severity="secondary" />
          </div>
        </div>
      </section>

      <section class="scoreboard">
        <article class="manager-score">
          <span class="manager-avatar you">{{ me?.trainerName?.slice(0, 1) ?? 'Y' }}</span>
          <div class="manager-label"><span>YOUR CAREER</span><strong>{{ me?.trainerName ?? me?.displayName ?? 'Manager' }}</strong><small>{{ careerQuery.data.value?.currentClubName ?? 'No current club' }}</small></div>
          <div class="manager-points"><strong>{{ me?.score ?? 0 }}</strong><span>PTS</span></div>
          <div class="score-progress"><ProgressBar :value="Math.min(100, ((me?.score ?? 0) / challenge.targetPoints) * 100)" :show-value="false" /><small>{{ Math.max(0, challenge.targetPoints - (me?.score ?? 0)) }} points to go</small></div>
        </article>
        <div class="score-divider"><span>VS</span></div>
        <article class="manager-score rival-score">
          <span class="manager-avatar rival">{{ rival?.trainerName?.slice(0, 1) ?? '?' }}</span>
          <div class="manager-label"><span>RIVAL CAREER</span><strong>{{ rival?.trainerName ?? rival?.displayName ?? 'Waiting for rival' }}</strong><small>{{ rival ? 'Another season, another story' : 'Share your invitation link' }}</small></div>
          <div class="manager-points"><strong>{{ rival?.score ?? '—' }}</strong><span>PTS</span></div>
          <div class="score-progress"><ProgressBar :value="Math.min(100, ((rival?.score ?? 0) / challenge.targetPoints) * 100)" :show-value="false" /><small>{{ rival ? `${Math.max(0, challenge.targetPoints - rival.score)} points to go` : 'Not started' }}</small></div>
        </article>
      </section>

      <section v-if="challenge.status === 'Completed'" class="winner-banner">
        <Trophy :size="18" /> <strong>Challenge complete.</strong> The winner has been confirmed for {{ seasonName(challenge.winningSeasonIndex ?? 0) }}.
      </section>

      <nav class="challenge-tabs" aria-label="Challenge sections">
        <button v-for="tab in ['Overview', 'Career', 'Seasons', 'Achievements', 'Activity', 'Rules']" :key="tab" :class="{ selected: activeTab === tab }" @click="activeTab = tab">
          {{ tab }}
          <span v-if="tab === 'Achievements'" class="tab-count">{{ achievements.length }}</span>
        </button>
        <span class="tabs-live"><span class="online-dot"></span> {{ connectionStatus ? 'SYNCED' : 'SYNCING' }}</span>
      </nav>

      <section v-if="activeTab === 'Overview'" class="challenge-content overview-grid">
        <div class="overview-main">
          <div class="detail-section-head"><div><span class="eyebrow"><span class="eyebrow-line"></span> NEXT MILESTONE</span><h2>Your season, your story.</h2></div><Button v-if="!isReadOnly" class="primary-button" @click="seasonDialogVisible = true"><Plus :size="15" /> Update season</Button></div>
          <div class="season-feature">
            <div class="season-feature-meta"><Tag :value="`SEASON ${currentSeasonIndex + 1}`" /><span>{{ seasonName(currentSeasonIndex) }}</span></div>
            <h3>{{ careerQuery.data.value?.currentClubName ?? 'The next chapter starts here.' }}</h3>
            <p>{{ careerQuery.data.value?.currentClubName ? 'Keep your season record up to date. Your results shape your score and head-to-head duels.' : 'Add your first club to build a career timeline and unlock career milestones.' }}</p>
            <div class="season-quick-stats">
              <div><strong>{{ allSeasons.at(-1)?.leagueMatches ?? 0 }}</strong><span>LEAGUE GAMES</span></div>
              <div><strong>{{ allSeasons.at(-1)?.leaguePoints ?? 0 }}</strong><span>LEAGUE POINTS</span></div>
              <div><strong>{{ allSeasons.at(-1)?.goalsFor ?? 0 }}</strong><span>GOALS SCORED</span></div>
              <div><strong>{{ allClubs.length }}</strong><span>CLUBS MANAGED</span></div>
            </div>
          </div>
          <div class="detail-section-head compact"><div><span class="eyebrow"><span class="eyebrow-line"></span> CAREER PATH</span><h2>Club journey</h2></div><Button v-if="!isReadOnly" class="text-action" @click="clubDialogVisible = true"><CirclePlus :size="15" /> Add club</Button></div>
          <div class="score-timeline-card">
            <div class="chart-heading"><div><span class="eyebrow"><span class="eyebrow-line"></span> SEASON BY SEASON</span><h3>Confirmed points timeline</h3></div><span class="chart-legend-dot"></span></div>
            <ScoreTimelineChart
              :participants="scoreQuery.data.value?.participants ?? []"
              :series="scoreQuery.data.value?.series ?? []"
              :start-year="challenge.startSeasonYear"
            />
          </div>
          <div v-if="allClubs.length" class="club-path">
            <article v-for="club in allClubs" :key="club.id" class="club-path-item">
              <div class="club-path-mark">{{ club.clubName.slice(0, 1).toUpperCase() }}</div>
              <div class="club-path-copy"><strong>{{ club.clubName }}</strong><span>{{ club.countryName }} · {{ seasonName(club.startSeasonIndex) }}{{ club.endSeasonIndex ? ` — ${seasonName(club.endSeasonIndex)}` : ' — Present' }}</span></div>
              <span class="matches-badge">{{ club.officialMatches }} matches</span>
            </article>
          </div>
          <div v-else class="empty-detail"><Flag :size="20" /><strong>No clubs in your timeline</strong><span>Add the clubs you've managed to unlock career goals and the three-club victory requirement.</span></div>
        </div>

        <aside class="overview-side">
          <article class="detail-side-card checkpoint-card"><span class="eyebrow"><span class="eyebrow-line"></span> ROAD TO GLORY</span><h3>Progress to 500</h3><div class="checkpoint-ring"><div><strong>{{ Math.min(100, Math.round(((me?.score ?? 0) / challenge.targetPoints) * 100)) }}<small>%</small></strong><span>COMPLETE</span></div></div><div class="checkpoint-meta"><span>{{ me?.score ?? 0 }} points</span><span>{{ challenge.targetPoints }} target</span></div><ProgressBar :value="Math.min(100, ((me?.score ?? 0) / challenge.targetPoints) * 100)" :show-value="false" /><div class="three-clubs"><Shield :size="15" /><span>{{ me?.score && me.score >= 500 ? 'Reach 500 and manage 3 clubs with 20+ games each to win.' : 'A win also requires 3 clubs with at least 20 official games each.' }}</span></div></article>
          <article class="detail-side-card next-goal-card"><div class="side-card-heading"><div class="side-icon gold"><Trophy :size="16" /></div><div><span class="eyebrow">QUICK ADD</span><h3>Log a milestone</h3></div></div><p>Turn this season's achievements into points. Pick from your challenge's rulebook.</p><Button class="outline-button full-button" @click="activeTab = 'Achievements'">Explore achievements <ChevronRight :size="14" /></Button></article>
          <article class="detail-side-card season-card-small"><div class="side-card-heading"><div class="side-icon"><Radio :size="16" /></div><div><span class="eyebrow">LIVE COMPARISON</span><h3>Season timeline</h3></div></div><p>First bonuses and duels compare the in-game season—not real-world activity.</p><div class="timeline-seasons"><span v-for="season in allSeasons.slice(-4)" :key="season.id" :class="{ complete: season.status === 'Completed' }">{{ season.displayName }}</span></div></article>
        </aside>
      </section>

      <section v-else-if="activeTab === 'Career'" class="challenge-content tab-content">
        <div class="detail-section-head"><div><span class="eyebrow"><span class="eyebrow-line"></span> MANAGER PROFILE</span><h2>Your career timeline</h2><p class="section-copy">Clubs count toward the win condition once you've managed at least 20 official games.</p></div><Button v-if="!isReadOnly" class="primary-button" @click="clubDialogVisible = true"><Plus :size="15" /> Add a club</Button></div>
        <div v-if="allClubs.length" class="career-timeline">
          <article v-for="(club, index) in allClubs" :key="club.id" class="timeline-club">
            <div class="timeline-marker"><span>{{ String(index + 1).padStart(2, '0') }}</span></div>
            <div class="timeline-club-card"><div class="timeline-club-title"><div><strong>{{ club.clubName }}</strong><span>{{ club.countryName }} · Division level {{ club.initialDivisionLevel }}</span></div><Tag :value="club.officialMatches >= 20 ? 'MILESTONE ELIGIBLE' : `${club.officialMatches}/20 GAMES`" :severity="club.officialMatches >= 20 ? 'success' : 'secondary'" /></div><div class="timeline-club-bottom"><span><CalendarDays :size="13" /> {{ seasonName(club.startSeasonIndex) }}{{ club.endSeasonIndex ? ` to ${seasonName(club.endSeasonIndex)}` : ' to present' }}</span><span><Flag :size="13" /> {{ club.officialMatches }} official matches</span></div></div>
          </article>
        </div>
        <div v-else class="empty-detail large"><Users :size="23" /><strong>Your journey is waiting.</strong><span>Add the clubs you've managed, including your starting club, to see your full career path.</span><Button v-if="!isReadOnly" class="primary-button" @click="clubDialogVisible = true"><Plus :size="15" /> Add first club</Button></div>
      </section>

      <section v-else-if="activeTab === 'Seasons'" class="challenge-content tab-content">
        <div class="detail-section-head"><div><span class="eyebrow"><span class="eyebrow-line"></span> SEASON RECORDS</span><h2>Every season, on the record.</h2><p class="section-copy">League figures determine the annual PPG and goals-per-game duels. Complete seasons to confirm head-to-head results.</p></div><Button v-if="!isReadOnly" class="primary-button" @click="seasonDialogVisible = true"><Plus :size="15" /> Update {{ seasonName(currentSeasonIndex) }}</Button></div>
        <div v-if="allSeasons.length" class="season-table-wrap"><table class="season-table"><thead><tr><th>SEASON</th><th>STATUS</th><th>GAMES</th><th>W-D-L</th><th>POINTS</th><th>GOALS</th><th>BEST SALE</th></tr></thead><tbody><tr v-for="season in allSeasons" :key="season.id"><td><strong>{{ season.displayName }}</strong></td><td><Tag :value="season.status" :severity="season.status === 'Completed' ? 'success' : 'secondary'" /></td><td>{{ season.leagueMatches }}</td><td>{{ season.leagueWins }}-{{ season.leagueDraws }}-{{ season.leagueLosses }}</td><td>{{ season.leaguePoints }}</td><td>{{ season.goalsFor }}-{{ season.goalsAgainst }}</td><td>{{ new Intl.NumberFormat('en', { style: 'currency', currency: season.currency }).format(season.largestOutgoingTransfer) }}</td></tr></tbody></table></div>
        <div v-else class="empty-detail large"><CalendarDays :size="23" /><strong>No seasons recorded yet.</strong><span>Record your first season to begin earning duels and building your FM timeline.</span><Button v-if="!isReadOnly" class="primary-button" @click="seasonDialogVisible = true"><Plus :size="15" /> Record a season</Button></div>
      </section>

      <section v-else-if="activeTab === 'Achievements'" class="challenge-content tab-content">
        <div class="detail-section-head"><div><span class="eyebrow"><span class="eyebrow-line"></span> THE RULEBOOK</span><h2>Milestones & achievements</h2><p class="section-copy">The backend calculates all points. Record the event, season, and club where required.</p></div><div class="achievement-total"><strong>{{ achievements.length }}</strong><span>GOALS IN THIS RULEBOOK</span></div></div>
        <div class="category-filter"><button v-for="category in ['All', ...categories]" :key="category" :class="{ selected: selectedCategory === category }" @click="selectedCategory = category">{{ category }}</button></div>
        <div v-if="achievementQuery.isPending.value" class="challenge-placeholder">Loading challenge rules…</div>
        <div v-else class="achievement-grid">
          <article v-for="achievement in visibleAchievements" :key="achievement.code" class="achievement-card" :class="{ disabled: !achievement.isEnabled }">
            <div class="achievement-top"><span class="achievement-icon"><component :is="categoryIcon(achievement.category)" :size="17" /></span><span class="achievement-code">{{ achievement.code }}</span></div>
            <h3>{{ achievement.name }}</h3><p>{{ achievement.description }}</p>
            <div class="achievement-meta"><strong>+{{ achievement.points }}<small> pts</small></strong><span>{{ achievement.frequency.replace(/([A-Z])/g, ' $1').toLowerCase() }}</span></div>
            <div v-if="achievement.claims.length" class="claim-history"><BadgeCheck :size="13" /> {{ achievement.claims.length }} recorded</div>
            <Button v-if="!isReadOnly && achievement.isEnabled" class="achievement-add" @click="openAchievement(achievement)"><Plus :size="14" /> Record</Button>
            <span v-else class="achievement-locked">{{ achievement.isEnabled ? 'READ ONLY' : 'DISABLED BY ADMIN' }}</span>
          </article>
        </div>
      </section>

      <section v-else-if="activeTab === 'Activity'" class="challenge-content tab-content">
        <div class="detail-section-head"><div><span class="eyebrow"><span class="eyebrow-line"></span> LIVE MATCH CENTRE</span><h2>Challenge activity</h2><p class="section-copy">Real-time updates are notices; the API remains the source of truth.</p></div></div>
        <div v-if="activityQuery.isPending.value" class="challenge-placeholder">Loading activity…</div>
        <div v-else-if="activityQuery.data.value?.length" class="activity-feed">
          <article v-for="item in activityQuery.data.value" :key="item.id" class="activity-item"><span class="activity-mark"><Trophy v-if="item.type.startsWith('achievement')" :size="15" /><ArrowUpRight v-else :size="15" /></span><div><strong>{{ item.participantName }}</strong><p>{{ item.message }}</p><small>{{ item.seasonIndex !== undefined ? seasonName(item.seasonIndex) : 'Challenge activity' }} · {{ new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt)) }}</small></div></article>
        </div>
        <div v-else class="empty-detail large"><Clock3 :size="23" /><strong>The story starts here.</strong><span>Challenge activity will appear as players add clubs, record seasons, and reach new milestones.</span></div>
      </section>

      <section v-else class="challenge-content tab-content">
        <div class="detail-section-head"><div><span class="eyebrow"><span class="eyebrow-line"></span> CHALLENGE SETTINGS</span><h2>Race to 500 rules</h2><p class="section-copy">Rules are scoped to this challenge and scoring is recalculated by the server.</p></div><Settings2 :size="20" class="settings-mark" /></div>
        <div class="rulebook-grid"><article><span>01</span><strong>500 confirmed points</strong><p>Base achievements, confirmed bonuses, seasonal duels, and confirmed checkpoints build your total.</p></article><article><span>02</span><strong>Three eligible clubs</strong><p>To win, log at least 20 official matches with each of three distinct clubs.</p></article><article><span>03</span><strong>In-game chronology</strong><p>First bonuses compare the challenge season index, not when a result was entered.</p></article><article><span>04</span><strong>One rival, separate saves</strong><p>Each manager records their own career. Opponents can never edit another player's record.</p></article></div>
        <div class="rulebook-note"><Shield :size="16" /><p>Challenge rule editing is reserved for its administrator. Rule changes require a new version, an audit record, and a recalculation before they affect the leaderboard.</p></div>
      </section>
    </template>
  </main>

  <Dialog v-model:visible="clubDialogVisible" modal header="Add a club to your career" :style="{ width: 'min(94vw, 520px)' }">
    <form class="detail-form-grid" @submit.prevent="submitClub">
      <p class="form-intro">Record one club stint at a time. A club counts toward the win requirement once it has 20 official matches.</p>
      <label>Club name<InputText v-model="clubName" required maxlength="120" placeholder="e.g. FC Porto" /></label>
      <div class="form-row"><label>Country<InputText v-model="countryName" required maxlength="80" placeholder="Portugal" /></label><label>Country code<InputText v-model="countryCode" required maxlength="8" placeholder="PT" /></label></div>
      <div class="form-row"><label>Starting season index<InputNumber v-model="clubStartSeason" required :min="0" :max="100" /></label><label>Division level<InputNumber v-model="divisionLevel" required :min="1" :max="20" /></label></div>
      <label>Official matches managed<InputNumber v-model="clubMatches" required :min="0" /></label>
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <div class="dialog-actions"><Button type="button" class="cancel-button" label="Cancel" @click="clubDialogVisible = false" /><Button type="submit" class="primary-button" :loading="saving" label="Save club" /></div>
    </form>
  </Dialog>

  <Dialog v-model:visible="seasonDialogVisible" modal header="Update current season" :style="{ width: 'min(94vw, 620px)' }">
    <form class="detail-form-grid" @submit.prevent="submitSeason">
      <p class="form-intro">Season {{ seasonName(currentSeasonIndex) }} · Keep the two saves independent; only seasons completed by both unlock duels.</p>
      <div class="form-row"><label>League matches<InputNumber v-model="leagueMatches" required :min="0" /></label><label>League points<InputNumber v-model="leaguePoints" required :min="0" /></label></div>
      <div class="form-row"><label>Wins<InputNumber v-model="leagueWins" required :min="0" /></label><label>Draws<InputNumber v-model="leagueDraws" required :min="0" /></label><label>Losses<InputNumber v-model="leagueLosses" required :min="0" /></label></div>
      <div class="form-row"><label>Goals for<InputNumber v-model="goalsFor" required :min="0" /></label><label>Goals against<InputNumber v-model="goalsAgainst" required :min="0" /></label><label>League position<InputNumber v-model="leaguePosition" :min="1" /></label></div>
      <div class="form-row"><label>Largest fixed outgoing fee<InputNumber v-model="largestOutgoingTransfer" required :min="0" :max-fraction-digits="2" /></label><label>Currency<InputText v-model="currency" required maxlength="3" /></label></div>
      <label>Notes<InputText v-model="seasonNotes" maxlength="1000" placeholder="Optional context" /></label>
      <label class="checkbox-label"><input v-model="isCompleted" type="checkbox" /> Mark this FM season complete</label>
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <div class="dialog-actions"><Button type="button" class="cancel-button" label="Cancel" @click="seasonDialogVisible = false" /><Button type="submit" class="primary-button" :loading="saving" label="Save season" /></div>
    </form>
  </Dialog>

  <Dialog v-model:visible="achievementDialogVisible" modal :header="selectedAchievement?.name ?? 'Record achievement'" :style="{ width: 'min(94vw, 480px)' }">
    <form class="detail-form-grid" @submit.prevent="submitAchievement">
      <p class="form-intro">The server checks whether this objective is available at its configured frequency. The claim is compared by FM season.</p>
      <label>FM season index<InputNumber v-model="claimSeason" :min="0" :max="100" required /></label>
      <label>Club, if applicable<InputText v-model="claimClub" maxlength="120" placeholder="Club name" /></label>
      <label>Country code, if applicable<InputText v-model="claimCountry" maxlength="8" placeholder="e.g. PT" /></label>
      <label>Notes<InputText v-model="claimNotes" maxlength="1000" placeholder="Optional context" /></label>
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <div class="dialog-actions"><Button type="button" class="cancel-button" label="Cancel" @click="achievementDialogVisible = false" /><Button type="submit" class="primary-button" :loading="saving" label="Record achievement" /></div>
    </form>
  </Dialog>
</template>
