<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, reactive, ref } from 'vue'
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
import ThemeToggle from '../components/ThemeToggle.vue'

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
    isCorrectionMode: boolean
    version: number
  }
  participants: Participant[]
}

type ClubSeason = {
  careerStintId: string
  divisionLevel: number
  officialMatches: number
  leagueMatches: number
  leagueWins: number
  leagueDraws: number
  leagueLosses: number
  leaguePoints: number
  goalsFor: number
  goalsAgainst: number
  leaguePosition: number | null
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
  usesClubBreakdown: boolean
  clubSeasons: ClubSeason[]
  largestOutgoingTransfer: number
  currency: string
  notes?: string
  version: number
}

type AchievementClaim = {
  id: string
  clubId?: string | null
  seasonIndex: number
  clubName?: string
  countryCode?: string
  notes?: string
  version: number
  managedCompetitionMatches: number | null
  totalCompetitionMatches: number | null
  inChargeAtCompetitionEnd: boolean | null
  managedDecidingMatch: boolean | null
  firstSeasonAfterPromotion: boolean | null
  avoidedRelegation: boolean | null
  competitionLeaguePosition: number | null
  wonFirstDivisionTitle: boolean | null
  wonMajorNationalCup: boolean | null
  wonLeagueTitleUnbeaten: boolean | null
  cupWonInLowerDivision: boolean | null
  domesticCupMatchesManaged: number | null
  promotionDestinationLevel: number | null
  promotionWithoutTitle: boolean | null
  promotionStreakStartSeason: number | null
  reachedContinentalMainPhase: boolean | null
  priorContinentalMainPhase: boolean | null
  firstTopTierMainPhase: boolean | null
  firstContinentalTitleClub: string | null
  firstContinentalTitleCountry: string | null
  firstContinentalTitleClubId: string | null
  firstContinentalTitleSeason: number | null
  wonContinentalTitlesWithBothClubs: boolean | null
  startingCareerClub: string | null
  startingCareerCountry: string | null
  startingCareerClubId: string | null
  competitionId: string | null
  firstDivisionExperience: boolean | null
  higherDivisionClubMove: boolean | null
  previousBestDivisionLevel: number | null
  newDivisionLevel: number | null
  firstMajorClubTrophy: boolean | null
  trophyNotSuperCup: boolean | null
  wonTenMajorTrophies: boolean | null
  thirdDivisionStartSeason: number | null
  stayedWithClubFromThirdToFirst: boolean | null
  officialManagerOfYear: boolean | null
  competitionResultKind: string | null
  competitionResultStage: string | null
}

type Competition = { id: string; name: string; tier: 'Top' | 'Second' | 'Third' | 'Other'; version: number }

type Achievement = {
  code: string
  name: string
  description: string
  category: string
  frequency: string
  canChangeFrequency?: boolean
  frequencyVersions?: Array<{ versionNumber: number; effectiveSeasonIndex: number; frequency: string }>
  canChangeCupMinimum?: boolean
  minimumCupMatches?: number
  cupMinimumVersions?: Array<{ versionNumber: number; effectiveSeasonIndex: number; minimum: number }>
  points: number
  isEnabled: boolean
  isAutomatic: boolean
  automaticSeasonIndex: number | null
  claims: AchievementClaim[]
}

type Career = {
  id: string
  trainerName: string
  currentClubName?: string
  startingStatus: 'Unemployed' | 'Club' | null
  startingStintId: string | null
  startingStatusVersion: number
  requiresStartingStatus: boolean
  nationalTeam20MatchSeasonIndex: number | null
  nationalTeamMilestoneVersion: number
  nationalTeamMilestoneValid: boolean
  nationalTeamCalculatedSeasonIndex: number | null
  nationalTeamSeasonMatchesComplete: boolean
  threeContinentsSeasonIndex: number | null
  threeContinentsCalculatedSeasonIndex: number | null
  threeContinentsMilestoneVersion: number
  threeContinentsMilestoneValid: boolean
  clubs: Array<{
    id: string
    clubId?: string | null
    identityLabel?: string
    clubName: string
    countryCode: string
    countryName: string
    startSeasonIndex: number
    endSeasonIndex?: number | null
    initialDivisionLevel: number
    officialMatches: number
    eligibleSeasonIndex: number | null
    clubMilestoneValid: boolean
    clubEligibleSeasonIndex: number | null
    clubOfficialMatches: number
    countryEligibleSeasonIndex: number | null
    countryMilestoneValid: boolean
    countryEligibleSeason: number | null
    countryOfficialMatches: number
    version: number
  }>
}

type Geography = {
  countries: Array<{ code: string, name: string, continentCode: string }>
  continents: Array<{ code: string, name: string }>
}

type CatalogClub = { id: string, name: string, identityLabel: string, countryCode: string, countryName: string }

type Activity = {
  id: string
  type: string
  message: string
  seasonIndex: number | null
  createdAt: string
  participantName: string
}

type ChallengeInvite = {
  id: string
  inviteeEmail: string | null
  createdAt: string
  expiresAt: string
  status: 'Pending' | 'Accepted' | 'Declined' | 'Revoked' | 'Expired'
}

type Transfer = {
  id: string
  seasonIndex: number
  clubName: string
  playerName: string
  counterpartyName: string
  direction: 'Incoming' | 'Outgoing'
  fixedAmount: number
  currency: string
  notes?: string
  version: number
}

type NationalTeam = {
  id: string
  teamName: string
  countryCode: string | null
  startSeasonIndex: number
  endSeasonIndex: number | null
  officialMatches: number
  seasonMatches: Array<{ seasonIndex: number; officialMatches: number }>
  notes?: string
  version: number
}

type ScoreTimeline = {
  currencyMismatchSeasons: number[]
  commonSeasonIndex: number | null
  victoryPending: boolean
  pendingVictorySeasonIndex: number | null
  totals: Array<{
    participantId: string
    confirmedPoints: number
    pendingPoints: number
    basePoints: number
    bonusPoints: number
    duelPoints: number
    checkpointPoints: number
    commonSeasonPoints: number | null
  }>
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
  breakdown: Array<{
    participantId: string
    seasonIndex: number
    points: number
    status: 'Confirmed' | 'Pending'
    sourceType: string
    sourceKey: string
    ruleVersion: number
    label: string
    explanation: string | null
  }>
}

type RuleBook = {
  version: number
  challengeVersion: number
  rules: Array<{ achievementCode: string; points: number; isEnabled: boolean }>
  versions: Array<{ versionNumber: number; effectiveSeasonIndex: number }>
  history: Array<{ actorId: string | null; createdAt: string; policy: string | null; reason: string | null; code: string | null }>
}
type RuleImpact = {
  version: number
  effectiveSeasonIndex: number
  impact: Array<{ participantId: string; beforeConfirmed: number; afterConfirmed: number; beforePotential: number; afterPotential: number }>
  beforeWinner: string | null
  afterWinner: string | null
}

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const queryClient = useQueryClient()
const challengeId = String(route.params.id)
const activeTab = ref('Overview')
const connectionStatus = ref(false)
const clubDialogVisible = ref(false)
const careerStartDialogVisible = ref(false)
const careerStartStatus = ref<'Unemployed' | 'Club'>('Unemployed')
const careerStartStintId = ref('')
const careerStartVersion = ref(0)
const careerStartError = ref('')
const clubMatchesDialogVisible = ref(false)
const countryMilestoneDialogVisible = ref(false)
const countryMilestoneSeason = ref<number | null>(null)
const selectedClub = ref<Career['clubs'][number]>()
const editingClub = ref<Career['clubs'][number]>()
const clubActionError = ref('')
const updatedClubMatches = ref(0)
const updatedEligibleSeason = ref<number | null>(null)
const seasonDialogVisible = ref(false)
const selectedSeasonIndex = ref(0)
const selectedSeasonVersion = ref<number | null>(null)
const achievementDialogVisible = ref(false)
const selectedAchievement = ref<Achievement>()
const selectedClaim = ref<AchievementClaim>()
const participation = reactive({
  managedCompetitionMatches: null as number | null,
  totalCompetitionMatches: null as number | null,
  inChargeAtCompetitionEnd: false,
  managedDecidingMatch: false,
  firstSeasonAfterPromotion: false,
  avoidedRelegation: false,
  competitionLeaguePosition: null as number | null,
  wonFirstDivisionTitle: false,
  wonMajorNationalCup: false,
  wonLeagueTitleUnbeaten: false,
  cupWonInLowerDivision: false,
  domesticCupMatchesManaged: null as number | null,
  promotionDestinationLevel: null as number | null,
  promotionWithoutTitle: false,
  promotionStreakStartSeason: null as number | null,
  reachedContinentalMainPhase: false,
  continentalOrderConfirmed: false,
  firstTopTierMainPhase: false,
  firstContinentalTitleClub: '',
  firstContinentalTitleCountry: '',
  firstContinentalTitleSeason: null as number | null,
  wonContinentalTitlesWithBothClubs: false,
  startingCareerClub: '',
  startingCareerCountry: '',
  firstDivisionExperience: false,
  higherDivisionClubMove: false,
  previousBestDivisionLevel: null as number | null,
  newDivisionLevel: null as number | null,
  firstMajorClubTrophy: false,
  trophyNotSuperCup: false,
  wonTenMajorTrophies: false,
  thirdDivisionStartSeason: null as number | null,
  stayedWithClubFromThirdToFirst: false,
  officialManagerOfYear: false,
  competitionResultKind: '',
  competitionResultStage: '',
})
const needsInternationalResult = computed(() => ['G020', 'G021', 'G022', 'G024', 'G028', 'G029', 'G030', 'G031', 'G034', 'G035', 'G036']
  .includes(selectedAchievement.value?.code ?? ''))
const participationKind = computed(() => {
  const code = selectedAchievement.value?.code
  if (code && ['G001', 'G002', 'G003', 'G004'].includes(code)) return 'league'
  if (code && ['G008', 'G009'].includes(code)) return 'cup'
  if (code && ['G010', 'G023'].includes(code)) return 'supercup'
  if (code === 'G011') return 'survival'
  if (code === 'G012') return 'runnerup'
  if (code === 'G013') return 'double'
  if (code === 'G014') return 'unbeaten'
  if (code === 'G015') return 'lower-cup'
  if (code && ['G005', 'G006', 'G007'].includes(code)) return 'promotion'
  if (code && ['G017', 'G018'].includes(code)) return 'promotion-streak'
  if (code === 'G025') return 'continental-first'
  if (code === 'G026') return 'continental-repeat'
  if (code === 'G027') return 'continental-top-first'
  if (code === 'G032') return 'continental-two-clubs'
  if (code === 'G037') return 'career-move'
  if (code === 'G038') return 'first-division-experience'
  if (code === 'G039') return 'higher-division-move'
  if (code === 'G040') return 'first-major-trophy'
  if (code === 'G041') return 'country-move'
  if (code === 'G048') return 'ten-major-trophies'
  if (code === 'G050') return 'third-to-first'
  if (code === 'G051') return 'manager-of-year'
  if (code === 'G016') return 'promoted-top'
  if (code === 'G019') return 'promoted-champion'
  return null
})
const needsLeagueMatches = computed(() => ['league', 'survival', 'promoted-champion', 'double', 'unbeaten'].includes(participationKind.value ?? ''))
const needsPromotion = computed(() => ['survival', 'promoted-top', 'promoted-champion'].includes(participationKind.value ?? ''))
const needsPosition = computed(() => ['runnerup', 'promoted-top', 'promoted-champion'].includes(participationKind.value ?? ''))
const legacyParticipation = computed(() => {
  if (!selectedClaim.value) return false
  if (needsInternationalResult.value) return selectedClaim.value.competitionResultKind == null
  if (needsPromotion.value) return selectedClaim.value.firstSeasonAfterPromotion == null
  if (participationKind.value === 'runnerup') return selectedClaim.value.competitionLeaguePosition == null
  if (participationKind.value === 'double') return selectedClaim.value.wonFirstDivisionTitle == null
  if (participationKind.value === 'unbeaten') return selectedClaim.value.wonLeagueTitleUnbeaten == null
  if (participationKind.value === 'lower-cup') return selectedClaim.value.cupWonInLowerDivision == null
  if (participationKind.value === 'promotion') return selectedClaim.value.promotionDestinationLevel == null
  if (participationKind.value === 'promotion-streak') return selectedClaim.value.promotionStreakStartSeason == null
  if (['continental-first', 'continental-repeat', 'continental-top-first'].includes(participationKind.value ?? ''))
    return selectedClaim.value.reachedContinentalMainPhase == null
  if (participationKind.value === 'continental-two-clubs') return selectedClaim.value.wonContinentalTitlesWithBothClubs == null
  if (participationKind.value === 'career-move' || participationKind.value === 'country-move') return selectedClaim.value.startingCareerClub == null
  if (participationKind.value === 'first-division-experience') return selectedClaim.value.firstDivisionExperience == null
  if (participationKind.value === 'higher-division-move') return selectedClaim.value.higherDivisionClubMove == null
  if (participationKind.value === 'first-major-trophy') return selectedClaim.value.firstMajorClubTrophy == null
  if (participationKind.value === 'ten-major-trophies') return selectedClaim.value.wonTenMajorTrophies == null
  if (participationKind.value === 'third-to-first') return selectedClaim.value.stayedWithClubFromThirdToFirst == null
  if (participationKind.value === 'manager-of-year') return selectedClaim.value.officialManagerOfYear == null
  if (participationKind.value === 'league') return selectedClaim.value.managedCompetitionMatches == null
  return participationKind.value != null && selectedClaim.value.managedDecidingMatch == null
})
const claimActionError = ref('')
const transferDialogVisible = ref(false)
const selectedTransfer = ref<Transfer>()
const transferError = ref('')
const ruleCode = ref('')
const rulePoints = ref(0)
const ruleEnabled = ref(true)
const rulePolicy = ref<'FromSeason' | 'Retroactive'>('FromSeason')
const ruleEffectiveSeason = ref(0)
const ruleReason = ref('')
const ruleName = ref('')
const ruleDescription = ref('')
const ruleCategory = ref('')
const ruleFrequency = ref('')
const ruleCupMinimum = ref(2)
const applyDisplayedDetails = ref(false)
const ruleError = ref('')
const rulePreview = ref<RuleImpact>()
const rulePreviewKey = ref('')
const customAchievement = reactive({ name: '', description: '', frequency: 'Once', points: 0, effectiveSeasonIndex: 0 })
const customAchievementError = ref('')
const competitionError = ref('')
const editingCompetition = ref<Competition>()
const competitionForm = reactive({ name: '', tier: 'Top' as Competition['tier'] })
const claimCompetitionId = ref('')
const nationalTeamDialogVisible = ref(false)
const selectedNationalTeam = ref<NationalTeam>()
const nationalTeamError = ref('')
const nationalMilestoneDialogVisible = ref(false)
const nationalMilestoneSeason = ref<number | null>(null)
const nationalMilestoneVersion = ref(0)
const nationalMilestoneError = ref('')
const continentsMilestoneDialogVisible = ref(false)
const continentsMilestoneSeason = ref<number | null>(null)
const continentsMilestoneVersion = ref(0)
const continentsMilestoneError = ref('')
const nationalTeamForm = reactive({
  teamName: '', countryCode: '', startSeasonIndex: 0, endSeasonIndex: null as number | null, officialMatches: 0, notes: '',
})
const nationalSeasonMatches = ref<Array<{ seasonIndex: number; officialMatches: number }>>([])
const transferForm = reactive({
  seasonIndex: 0, clubName: '', playerName: '', counterpartyName: '',
  direction: 'Outgoing' as 'Incoming' | 'Outgoing', fixedAmount: 0, currency: 'EUR', notes: '',
})
const formError = ref('')
const saving = ref(false)
const invitationMessage = ref('')
const heroInviteUrl = ref('')
const inviteEmail = ref('')
const inviteExpiresInDays = ref(7)
const createdInviteUrl = ref('')
const inviteManagementError = ref('')
const correctionError = ref('')
const archiveError = ref('')
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
const geographyQuery = useQuery({
  queryKey: ['geography'],
  queryFn: () => api<Geography>('/api/geography'),
})
const clubCatalogSearch = ref('')
const clubIdentityLabel = ref('')
const selectedCatalogClub = ref<CatalogClub | null>(null)
const catalogClubMatches = computed(() => selectedCatalogClub.value !== null
  && selectedCatalogClub.value.name.trim().toUpperCase() === clubForm.values.clubName.trim().toUpperCase()
  && selectedCatalogClub.value.countryCode === clubForm.values.countryCode.trim().toUpperCase())
const clubCatalogQuery = useQuery({
  queryKey: ['club-catalog', clubCatalogSearch],
  queryFn: () => api<CatalogClub[]>(`/api/clubs?search=${encodeURIComponent(clubCatalogSearch.value.trim())}`),
  enabled: computed(() => clubDialogVisible.value),
})
const transfersQuery = useQuery({
  queryKey: ['transfers', challengeId],
  queryFn: () => api<Transfer[]>(`/api/challenges/${challengeId}/transfers`),
})
const nationalTeamsQuery = useQuery({
  queryKey: ['national-teams', challengeId],
  queryFn: () => api<NationalTeam[]>(`/api/challenges/${challengeId}/national-teams`),
})
const achievementQuery = useQuery({
  queryKey: ['achievements', challengeId],
  queryFn: () => api<Achievement[]>(`/api/challenges/${challengeId}/achievements`),
})
const rulesQuery = useQuery({
  queryKey: ['rules', challengeId],
  queryFn: () => api<RuleBook>(`/api/challenges/${challengeId}/rules`),
})
const competitionsQuery = useQuery({
  queryKey: ['competitions', challengeId],
  queryFn: () => api<Competition[]>(`/api/challenges/${challengeId}/competitions`),
})
const activityQuery = useQuery({
  queryKey: ['activity', challengeId],
  queryFn: () => api<Activity[]>(`/api/challenges/${challengeId}/activity`),
})

const challenge = computed(() => challengeQuery.data.value?.challenge)
const participants = computed(() => challengeQuery.data.value?.participants ?? [])
const me = computed(() => participants.value.find(item => item.isCurrentUser))
const challengeInvitesQuery = useQuery({
  queryKey: ['challenge-invites', challengeId],
  queryFn: () => api<ChallengeInvite[]>(`/api/challenges/${challengeId}/invites`),
  enabled: computed(() => me.value?.role === 'Administrator' && activeTab.value === 'Rules'),
})
const rival = computed(() => participants.value.find(item => !item.isCurrentUser))
const myScoreDetails = computed(() => scoreQuery.data.value?.totals.find(item => item.participantId === me.value?.id))
const allSeasons = computed(() => seasonsQuery.data.value ?? [])
const allClubs = computed(() => careerQuery.data.value?.clubs ?? [])
const allTransfers = computed(() => transfersQuery.data.value ?? [])
const transferSummaries = computed(() => {
  const grouped = new Map<string, { currency: string; spent: number; received: number; largestPurchase: number; largestSale: number; count: number }>()
  for (const transfer of allTransfers.value) {
    const row = grouped.get(transfer.currency) ?? { currency: transfer.currency, spent: 0, received: 0, largestPurchase: 0, largestSale: 0, count: 0 }
    if (transfer.direction === 'Incoming') {
      row.spent += transfer.fixedAmount
      row.largestPurchase = Math.max(row.largestPurchase, transfer.fixedAmount)
    } else {
      row.received += transfer.fixedAmount
      row.largestSale = Math.max(row.largestSale, transfer.fixedAmount)
    }
    row.count++
    grouped.set(transfer.currency, row)
  }
  return [...grouped.values()]
})
const achievements = computed(() => achievementQuery.data.value ?? [])
const applicableCompetitions = computed(() => {
  const code = selectedAchievement.value?.code
  const tiers = code && ['G020', 'G027', 'G028', 'G029', 'G030'].includes(code) ? ['Top']
    : code && ['G021', 'G031'].includes(code) ? ['Second']
      : code === 'G022' ? ['Third']
        : code === 'G025' || code === 'G026' ? ['Top', 'Second', 'Third', 'Other'] : []
  return (competitionsQuery.data.value ?? []).filter(item => tiers.includes(item.tier))
})
const supportsCompetition = computed(() => ['G020', 'G021', 'G022', 'G025', 'G026', 'G027', 'G028', 'G029', 'G030', 'G031']
  .includes(selectedAchievement.value?.code ?? ''))
const categories = computed(() => [...new Set(achievements.value.map(item => item.category))])
const selectedCategory = ref('All')
const achievementSearch = ref('')
const achievementFrequency = ref('All')
const achievementStatus = ref('All')
const achievementPoints = ref('All')
const frequencies = computed(() => [...new Set(achievements.value.map(item => item.frequency))].sort())
const pointValues = computed(() => [...new Set(achievements.value.map(item => item.points))].sort((a, b) => a - b))
const visibleAchievements = computed(() =>
  achievements.value.filter(item => {
    const query = achievementSearch.value.trim().toLocaleLowerCase()
    const recorded = item.claims.length > 0 || item.automaticSeasonIndex != null
    return (selectedCategory.value === 'All' || item.category === selectedCategory.value)
      && (!query || [item.code, item.name, item.description].some(value => value.toLocaleLowerCase().includes(query)))
      && (achievementFrequency.value === 'All' || item.frequency === achievementFrequency.value)
      && (achievementPoints.value === 'All' || String(item.points) === achievementPoints.value)
      && (achievementStatus.value === 'All'
        || achievementStatus.value === 'Enabled' && item.isEnabled
        || achievementStatus.value === 'Disabled' && !item.isEnabled
        || achievementStatus.value === 'Recorded' && recorded
        || achievementStatus.value === 'Not recorded' && !recorded)
  }),
)
function clearAchievementFilters() {
  selectedCategory.value = 'All'
  achievementSearch.value = ''
  achievementFrequency.value = 'All'
  achievementStatus.value = 'All'
  achievementPoints.value = 'All'
}
const currentSeasonIndex = computed(() => {
  const active = allSeasons.value.find(item => item.status !== 'Completed')
  if (active) return active.seasonIndex
  return allSeasons.value.length ? Math.max(...allSeasons.value.map(item => item.seasonIndex)) + 1 : 0
})
const isRulesReadOnly = computed(() => ['Completed', 'Archived'].includes(challenge.value?.status ?? ''))
const isReadOnly = computed(() => isRulesReadOnly.value || challenge.value?.status === 'Draft')
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
  endSeasonIndex: z.number().int().min(0).max(100).nullable(),
  initialDivisionLevel: z.number().int().min(1).max(20),
  officialMatches: z.number().int().min(0).max(5000),
  eligibleSeasonIndex: z.number().int().min(0).max(100).nullable(),
}).refine(
  value => (value.endSeasonIndex === null || value.endSeasonIndex >= value.startSeasonIndex)
    && (value.eligibleSeasonIndex === null || value.eligibleSeasonIndex >= value.startSeasonIndex
      && (value.endSeasonIndex === null || value.eligibleSeasonIndex <= value.endSeasonIndex)),
  { message: 'Choose an ending season and milestone season within this stint.' },
)
const clubForm = useForm({
  initialValues: { clubName: '', countryName: '', countryCode: '', startSeasonIndex: 0, endSeasonIndex: null as number | null, initialDivisionLevel: 4, officialMatches: 0, eligibleSeasonIndex: null as number | null },
})
const [clubName] = clubForm.defineField('clubName')
const [countryName] = clubForm.defineField('countryName')
const [countryCode] = clubForm.defineField('countryCode')
const [clubStartSeason] = clubForm.defineField('startSeasonIndex')
const [clubEndSeason] = clubForm.defineField('endSeasonIndex')
const [divisionLevel] = clubForm.defineField('initialDivisionLevel')
const [clubMatches] = clubForm.defineField('officialMatches')
const [clubEligibleSeason] = clubForm.defineField('eligibleSeasonIndex')

function selectCatalogCountry(event: Event) {
  const code = (event.target as HTMLSelectElement).value
  const country = geographyQuery.data.value?.countries.find(item => item.code === code)
  if (!country) return
  countryCode.value = country.code
  countryName.value = country.name
}

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
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, 'Enter a three-letter currency code.'),
  notes: z.string().max(1000).optional(),
  isCompleted: z.boolean(),
}).refine(value => value.leagueWins + value.leagueDraws + value.leagueLosses === value.leagueMatches, {
  message: 'Wins, draws and losses must add up to league matches.',
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
const useClubBreakdown = ref(false)
const clearClubBreakdown = ref(false)
const clubSeasonRows = ref<ClubSeason[]>([])
const originalSeasonUsesBreakdown = ref(false)
const hadSavedClubBreakdown = ref(false)
const availableSeasonClubs = computed(() => (careerQuery.data.value?.clubs ?? []).filter(club =>
  club.startSeasonIndex <= selectedSeasonIndex.value && (club.endSeasonIndex == null || club.endSeasonIndex >= selectedSeasonIndex.value),
))

function addClubSeason() {
  const stint = availableSeasonClubs.value.find(club => !clubSeasonRows.value.some(row => row.careerStintId === club.id))
  if (!stint) return
  clubSeasonRows.value.push({
    careerStintId: stint.id, divisionLevel: stint.initialDivisionLevel, officialMatches: 0,
    leagueMatches: 0, leagueWins: 0, leagueDraws: 0, leagueLosses: 0, leaguePoints: 0,
    goalsFor: 0, goalsAgainst: 0, leaguePosition: null,
  })
}

const claimForm = useForm({
  initialValues: { seasonIndex: currentSeasonIndex.value, clubName: '', countryCode: '', notes: '' },
})
const [claimSeason] = claimForm.defineField('seasonIndex')
const claimFrequency = computed(() => {
  const achievement = selectedAchievement.value
  if (!achievement) return ''
  return achievement.frequencyVersions?.filter(item => item.effectiveSeasonIndex <= claimSeason.value)
    .sort((a, b) => b.versionNumber - a.versionNumber)[0]?.frequency ?? achievement.frequency
})
const claimCupMinimum = computed(() => selectedAchievement.value?.cupMinimumVersions
  ?.filter(item => item.effectiveSeasonIndex <= claimSeason.value)
  .sort((a, b) => b.versionNumber - a.versionNumber)[0]?.minimum ?? 2)
const [claimClub] = claimForm.defineField('clubName')
const [claimCountry] = claimForm.defineField('countryCode')
const [claimNotes] = claimForm.defineField('notes')
const selectedClaimClub = ref<Pick<Career['clubs'][number], 'id' | 'clubId' | 'clubName' | 'countryCode'> | null>(null)
const selectedStartingClub = ref<Pick<Career['clubs'][number], 'id' | 'clubId' | 'clubName' | 'countryCode'> | null>(null)
const selectedFirstTitleClub = ref<Pick<Career['clubs'][number], 'id' | 'clubId' | 'clubName' | 'countryCode'> | null>(null)
const claimClubMatches = computed(() => selectedClaimClub.value !== null
  && selectedClaimClub.value.clubName.trim().toUpperCase() === claimClub.value.trim().toUpperCase()
  && selectedClaimClub.value.countryCode.trim().toUpperCase() === claimCountry.value.trim().toUpperCase())
const startingClubMatches = computed(() => selectedStartingClub.value !== null
  && selectedStartingClub.value.clubName.trim().toUpperCase() === participation.startingCareerClub.trim().toUpperCase()
  && selectedStartingClub.value.countryCode.trim().toUpperCase() === participation.startingCareerCountry.trim().toUpperCase())
const firstTitleClubMatches = computed(() => selectedFirstTitleClub.value !== null
  && selectedFirstTitleClub.value.clubName.trim().toUpperCase() === participation.firstContinentalTitleClub.trim().toUpperCase()
  && selectedFirstTitleClub.value.countryCode.trim().toUpperCase() === participation.firstContinentalTitleCountry.trim().toUpperCase())

function selectClaimCareerClub(event: Event) {
  const stint = careerQuery.data.value?.clubs.find(item => item.id === (event.target as HTMLSelectElement).value)
  selectedClaimClub.value = stint ?? null
  if (!stint) return
  claimClub.value = stint.clubName
  claimCountry.value = stint.countryCode
}

function selectStartingCareerClub(event: Event) {
  const stint = careerQuery.data.value?.clubs.find(item => item.id === (event.target as HTMLSelectElement).value)
  selectedStartingClub.value = stint ?? null
  if (!stint) return
  participation.startingCareerClub = stint.clubName
  participation.startingCareerCountry = stint.countryCode
}

function selectFirstTitleCareerClub(event: Event) {
  const stint = careerQuery.data.value?.clubs.find(item => item.id === (event.target as HTMLSelectElement).value)
  selectedFirstTitleClub.value = stint ?? null
  if (!stint) return
  participation.firstContinentalTitleClub = stint.clubName
  participation.firstContinentalTitleCountry = stint.countryCode
}

function openClub(club?: Career['clubs'][number]) {
  editingClub.value = club
  clubForm.resetForm({ values: {
    clubName: club?.clubName ?? '', countryName: club?.countryName ?? '', countryCode: club?.countryCode ?? '',
    startSeasonIndex: club?.startSeasonIndex ?? currentSeasonIndex.value, endSeasonIndex: club?.endSeasonIndex ?? null,
    initialDivisionLevel: club?.initialDivisionLevel ?? 4, officialMatches: club?.officialMatches ?? 0,
    eligibleSeasonIndex: club?.eligibleSeasonIndex ?? null,
  } })
  clubCatalogSearch.value = ''
  clubIdentityLabel.value = ''
  selectedCatalogClub.value = club?.clubId
    ? { id: club.clubId, name: club.clubName, identityLabel: club.identityLabel ?? '', countryCode: club.countryCode, countryName: club.countryName }
    : null
  formError.value = ''
  clubDialogVisible.value = true
}

function selectCatalogClub(event: Event) {
  const selected = clubCatalogQuery.data.value?.find(item => item.id === (event.target as HTMLSelectElement).value)
  selectedCatalogClub.value = selected ?? null
  clubIdentityLabel.value = ''
  if (!selected) return
  clubName.value = selected.name
  countryCode.value = selected.countryCode
  countryName.value = selected.countryName
}

async function createCatalogClub() {
  formError.value = ''
  saving.value = true
  try {
    const club = await api<CatalogClub>('/api/clubs', {
      method: 'POST', body: JSON.stringify({
        name: clubName.value, countryCode: countryCode.value, identityLabel: clubIdentityLabel.value,
      }),
    })
    selectedCatalogClub.value = club
    clubName.value = club.name
    countryCode.value = club.countryCode
    countryName.value = club.countryName
    await queryClient.invalidateQueries({ queryKey: ['club-catalog'] })
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Club could not be added to the catalog.'
  } finally {
    saving.value = false
  }
}

async function submitClub() {
  formError.value = ''
  const validation = clubSchema.safeParse(clubForm.values)
  if (!validation.success) {
    formError.value = validation.error.issues[0]?.message ?? 'Check the club details.'
    return
  }
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/career/stints${editingClub.value ? `/${editingClub.value.id}` : ''}`, {
      method: editingClub.value ? 'PUT' : 'POST',
      body: JSON.stringify({ ...validation.data, version: editingClub.value?.version ?? null,
        clubId: catalogClubMatches.value ? selectedCatalogClub.value?.id : null,
        clearClubId: !!editingClub.value?.clubId && !catalogClubMatches.value }),
    })
    clubDialogVisible.value = false
    await invalidateChallenge()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Club could not be saved.'
  } finally {
    saving.value = false
  }
}

async function deleteClub(club: Career['clubs'][number]) {
  if (!window.confirm(`Remove ${careerClubLabel(club)} from your career? This may change milestones and scores.`)) return
  clubActionError.value = ''
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/career/stints/${club.id}?version=${club.version}`, { method: 'DELETE' })
    await invalidateChallenge()
  } catch (error) {
    clubActionError.value = error instanceof Error ? error.message : 'Club could not be removed.'
  } finally {
    saving.value = false
  }
}

function openClubMatches(club: Career['clubs'][number]) {
  selectedClub.value = club
  updatedClubMatches.value = club.officialMatches
  updatedEligibleSeason.value = club.eligibleSeasonIndex
  formError.value = ''
  clubMatchesDialogVisible.value = true
}

async function submitClubMatches() {
  if (!selectedClub.value) return
  formError.value = ''
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/career/stints/${selectedClub.value.id}/matches`, {
      method: 'PATCH',
      body: JSON.stringify({
        officialMatches: updatedClubMatches.value,
        eligibleSeasonIndex: updatedEligibleSeason.value,
        version: selectedClub.value.version,
      }),
    })
    clubMatchesDialogVisible.value = false
    await invalidateChallenge()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Club matches could not be saved.'
  } finally {
    saving.value = false
  }
}

function openCountryMilestone(club: Career['clubs'][number]) {
  selectedClub.value = club
  countryMilestoneSeason.value = club.countryEligibleSeasonIndex
  formError.value = ''
  countryMilestoneDialogVisible.value = true
}

async function submitCountryMilestone() {
  if (!selectedClub.value) return
  formError.value = ''
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/career/stints/${selectedClub.value.id}/country-milestone`, {
      method: 'PUT',
      body: JSON.stringify({ seasonIndex: countryMilestoneSeason.value, version: selectedClub.value.version }),
    })
    countryMilestoneDialogVisible.value = false
    await invalidateChallenge()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Country milestone could not be saved.'
  } finally {
    saving.value = false
  }
}

function openSeasonDialog(season?: Season) {
  const selected = season ?? allSeasons.value.find(item => item.seasonIndex === currentSeasonIndex.value)
  selectedSeasonIndex.value = selected?.seasonIndex ?? currentSeasonIndex.value
  selectedSeasonVersion.value = selected?.version ?? null
  useClubBreakdown.value = selected?.usesClubBreakdown ?? false
  originalSeasonUsesBreakdown.value = useClubBreakdown.value
  clubSeasonRows.value = (selected?.clubSeasons ?? []).map(row => ({ ...row }))
  hadSavedClubBreakdown.value = clubSeasonRows.value.length > 0
  clearClubBreakdown.value = false
  seasonForm.resetForm({ values: {
    leagueMatches: selected?.leagueMatches ?? 0,
    leagueWins: selected?.leagueWins ?? 0,
    leagueDraws: selected?.leagueDraws ?? 0,
    leagueLosses: selected?.leagueLosses ?? 0,
    leaguePoints: selected?.leaguePoints ?? 0,
    goalsFor: selected?.goalsFor ?? 0,
    goalsAgainst: selected?.goalsAgainst ?? 0,
    leaguePosition: selected?.leaguePosition ?? null,
    largestOutgoingTransfer: selected?.largestOutgoingTransfer ?? 0,
    currency: selected?.currency ?? 'EUR',
    notes: selected?.notes ?? '',
    isCompleted: selected?.status === 'Completed',
  } })
  formError.value = ''
  seasonDialogVisible.value = true
}

async function submitSeason() {
  formError.value = ''
  const validation = seasonSchema.safeParse(seasonForm.values)
  if (!validation.success) {
    formError.value = validation.error.issues[0]?.message ?? 'Check the season statistics.'
    return
  }
  if (useClubBreakdown.value) {
    const rowSchema = z.object({
      careerStintId: z.string().min(1), divisionLevel: z.number().int().min(1).max(100),
      officialMatches: z.number().int().min(0).max(5000), leagueMatches: z.number().int().min(0),
      leagueWins: z.number().int().min(0), leagueDraws: z.number().int().min(0),
      leagueLosses: z.number().int().min(0), leaguePoints: z.number().int().min(0),
      goalsFor: z.number().int().min(0), goalsAgainst: z.number().int().min(0),
      leaguePosition: z.number().int().min(1).max(100).nullable(),
    }).refine(row => row.leagueWins + row.leagueDraws + row.leagueLosses === row.leagueMatches
      && row.leagueMatches <= row.officialMatches, 'Each club needs matching win/draw/loss totals and at least as many official as league matches.')
    const rows = z.array(rowSchema).min(1, 'Add at least one club to the detailed season.').safeParse(clubSeasonRows.value)
    if (!rows.success) {
      formError.value = rows.error.issues[0]?.message ?? 'Check the club statistics.'
      return
    }
    if (new Set(rows.data.map(item => item.careerStintId)).size !== rows.data.length) {
      formError.value = 'Each club stint can appear only once per season.'
      return
    }
    if (!originalSeasonUsesBreakdown.value && !window.confirm('Replace this season’s quick league summary with the totals from its club breakdown?')) return
  } else if (clearClubBreakdown.value && !window.confirm('Remove the saved club breakdown for this season? This cannot be undone.')) return
  const transferCurrenciesChange = allTransfers.value.some(item =>
    item.seasonIndex === selectedSeasonIndex.value && item.currency !== validation.data.currency.toUpperCase())
  if (transferCurrenciesChange && !window.confirm('Relabel all transfers in this season to the new currency? Amounts will not be converted.')) return
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/seasons/${selectedSeasonIndex.value}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...validation.data, version: selectedSeasonVersion.value, confirmTransferCurrencyRelabel: transferCurrenciesChange,
        usesClubBreakdown: useClubBreakdown.value,
        clubSeasons: useClubBreakdown.value ? clubSeasonRows.value : null,
        clearClubBreakdown: !useClubBreakdown.value && clearClubBreakdown.value,
      }),
    })
    seasonDialogVisible.value = false
    await invalidateChallenge()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Season could not be saved.'
  } finally {
    saving.value = false
  }
}

function openAchievement(achievement: Achievement, claim?: AchievementClaim) {
  selectedAchievement.value = achievement
  selectedClaim.value = claim
  selectedClaimClub.value = claim?.clubId
    ? careerQuery.data.value?.clubs.find(item => item.clubId === claim.clubId)
      ?? { id: '', clubId: claim.clubId, clubName: claim.clubName ?? '', countryCode: claim.countryCode ?? '' }
    : null
  selectedStartingClub.value = claim?.startingCareerClubId
    ? careerQuery.data.value?.clubs.find(item => item.clubId === claim.startingCareerClubId)
      ?? { id: '', clubId: claim.startingCareerClubId, clubName: claim.startingCareerClub ?? '', countryCode: claim.startingCareerCountry ?? '' }
    : null
  selectedFirstTitleClub.value = claim?.firstContinentalTitleClubId
    ? careerQuery.data.value?.clubs.find(item => item.clubId === claim.firstContinentalTitleClubId)
      ?? { id: '', clubId: claim.firstContinentalTitleClubId, clubName: claim.firstContinentalTitleClub ?? '', countryCode: claim.firstContinentalTitleCountry ?? '' }
    : null
  claimCompetitionId.value = claim?.competitionId ?? ''
  Object.assign(participation, {
    managedCompetitionMatches: claim?.managedCompetitionMatches ?? null,
    totalCompetitionMatches: claim?.totalCompetitionMatches ?? null,
    inChargeAtCompetitionEnd: claim?.inChargeAtCompetitionEnd ?? false,
    managedDecidingMatch: claim?.managedDecidingMatch ?? false,
    firstSeasonAfterPromotion: claim?.firstSeasonAfterPromotion ?? false,
    avoidedRelegation: claim?.avoidedRelegation ?? false,
    competitionLeaguePosition: claim?.competitionLeaguePosition ?? null,
    wonFirstDivisionTitle: claim?.wonFirstDivisionTitle ?? false,
    wonMajorNationalCup: claim?.wonMajorNationalCup ?? false,
    wonLeagueTitleUnbeaten: claim?.wonLeagueTitleUnbeaten ?? false,
    cupWonInLowerDivision: claim?.cupWonInLowerDivision ?? false,
    domesticCupMatchesManaged: claim?.domesticCupMatchesManaged ?? null,
    promotionDestinationLevel: claim?.promotionDestinationLevel ?? null,
    promotionWithoutTitle: claim?.promotionWithoutTitle ?? false,
    promotionStreakStartSeason: claim?.promotionStreakStartSeason ?? null,
    reachedContinentalMainPhase: claim?.reachedContinentalMainPhase ?? false,
    continentalOrderConfirmed: achievement.code === 'G025' ? claim?.priorContinentalMainPhase === false : claim?.priorContinentalMainPhase === true,
    firstTopTierMainPhase: claim?.firstTopTierMainPhase ?? false,
    firstContinentalTitleClub: claim?.firstContinentalTitleClub ?? '',
    firstContinentalTitleCountry: claim?.firstContinentalTitleCountry ?? '',
    firstContinentalTitleSeason: claim?.firstContinentalTitleSeason ?? null,
    wonContinentalTitlesWithBothClubs: claim?.wonContinentalTitlesWithBothClubs ?? false,
    startingCareerClub: claim?.startingCareerClub ?? '',
    startingCareerCountry: claim?.startingCareerCountry ?? '',
    firstDivisionExperience: claim?.firstDivisionExperience ?? false,
    higherDivisionClubMove: claim?.higherDivisionClubMove ?? false,
    previousBestDivisionLevel: claim?.previousBestDivisionLevel ?? null,
    newDivisionLevel: claim?.newDivisionLevel ?? null,
    firstMajorClubTrophy: claim?.firstMajorClubTrophy ?? false,
    trophyNotSuperCup: claim?.trophyNotSuperCup ?? false,
    wonTenMajorTrophies: claim?.wonTenMajorTrophies ?? false,
    thirdDivisionStartSeason: claim?.thirdDivisionStartSeason ?? null,
    stayedWithClubFromThirdToFirst: claim?.stayedWithClubFromThirdToFirst ?? false,
    officialManagerOfYear: claim?.officialManagerOfYear ?? false,
    competitionResultKind: claim?.competitionResultKind ?? '',
    competitionResultStage: claim?.competitionResultStage ?? '',
  })
  claimForm.resetForm({
    values: {
      seasonIndex: claim?.seasonIndex ?? currentSeasonIndex.value,
      clubName: claim?.clubName ?? (claim ? '' : careerQuery.data.value?.currentClubName ?? ''),
      countryCode: claim?.countryCode ?? (claim ? '' : careerQuery.data.value?.clubs.at(-1)?.countryCode ?? ''),
      notes: claim?.notes ?? '',
    },
  })
  formError.value = ''
  achievementDialogVisible.value = true
}

async function submitAchievement() {
  if (!selectedAchievement.value) return
  formError.value = ''
  if (supportsCompetition.value && !competitionsQuery.isSuccess.value) {
    formError.value = 'Load the competition catalog before saving this achievement.'
    return
  }
  const validation = z.object({
    seasonIndex: z.number().int().min(0).max(100),
    clubName: z.string().trim().max(120),
    countryCode: z.string().trim().max(8),
    notes: z.string().max(1000),
  }).safeParse(claimForm.values)
  if (!validation.success) {
    formError.value = validation.error.issues[0]?.message ?? 'Check the achievement details.'
    return
  }
  saving.value = true
  try {
    const participationData: Record<string, string | number | boolean | null> = {}
    if (needsLeagueMatches.value) {
      participationData.managedCompetitionMatches = participation.managedCompetitionMatches
      participationData.totalCompetitionMatches = participation.totalCompetitionMatches
      if (participationKind.value !== 'survival') participationData.inChargeAtCompetitionEnd = participation.inChargeAtCompetitionEnd
    }
    if (participationKind.value === 'cup' || participationKind.value === 'lower-cup') participationData.managedCompetitionMatches = participation.managedCompetitionMatches
    if (['cup', 'supercup', 'double', 'lower-cup'].includes(participationKind.value ?? ''))
      participationData.managedDecidingMatch = participation.managedDecidingMatch
    if (needsPromotion.value) participationData.firstSeasonAfterPromotion = participation.firstSeasonAfterPromotion
    if (participationKind.value === 'survival') participationData.avoidedRelegation = participation.avoidedRelegation
    if (needsPosition.value) participationData.competitionLeaguePosition = participation.competitionLeaguePosition
    if (participationKind.value === 'double') {
      participationData.wonFirstDivisionTitle = participation.wonFirstDivisionTitle
      participationData.wonMajorNationalCup = participation.wonMajorNationalCup
      participationData.domesticCupMatchesManaged = participation.domesticCupMatchesManaged
    }
    if (participationKind.value === 'unbeaten') participationData.wonLeagueTitleUnbeaten = participation.wonLeagueTitleUnbeaten
    if (participationKind.value === 'lower-cup') participationData.cupWonInLowerDivision = participation.cupWonInLowerDivision
    if (participationKind.value === 'promotion') {
      participationData.promotionDestinationLevel = participation.promotionDestinationLevel
      participationData.promotionWithoutTitle = participation.promotionWithoutTitle
    }
    if (participationKind.value === 'promotion-streak') participationData.promotionStreakStartSeason = participation.promotionStreakStartSeason
    if (['continental-first', 'continental-repeat', 'continental-top-first'].includes(participationKind.value ?? ''))
      participationData.reachedContinentalMainPhase = participation.reachedContinentalMainPhase
    if (participationKind.value === 'continental-first' || participationKind.value === 'continental-repeat')
      participationData.priorContinentalMainPhase = participation.continentalOrderConfirmed ? participationKind.value === 'continental-repeat' : null
    if (participationKind.value === 'continental-top-first') participationData.firstTopTierMainPhase = participation.firstTopTierMainPhase
    if (participationKind.value === 'continental-two-clubs') {
      participationData.firstContinentalTitleClub = participation.firstContinentalTitleClub
      participationData.firstContinentalTitleCountry = participation.firstContinentalTitleCountry
      if (firstTitleClubMatches.value && selectedFirstTitleClub.value?.clubId)
        participationData.firstContinentalTitleClubId = selectedFirstTitleClub.value.clubId
      else if (selectedClaim.value?.firstContinentalTitleClubId) participationData.clearFirstContinentalTitleClubId = true
      participationData.firstContinentalTitleSeason = participation.firstContinentalTitleSeason
      participationData.wonContinentalTitlesWithBothClubs = participation.wonContinentalTitlesWithBothClubs
    }
    if (participationKind.value === 'career-move' || participationKind.value === 'country-move') {
      participationData.startingCareerClub = participation.startingCareerClub
      participationData.startingCareerCountry = participation.startingCareerCountry
      if (startingClubMatches.value && selectedStartingClub.value?.clubId)
        participationData.startingCareerClubId = selectedStartingClub.value.clubId
      else if (selectedClaim.value?.startingCareerClubId) participationData.clearStartingCareerClubId = true
    }
    if (participationKind.value === 'first-division-experience') participationData.firstDivisionExperience = participation.firstDivisionExperience
    if (participationKind.value === 'higher-division-move') {
      participationData.higherDivisionClubMove = participation.higherDivisionClubMove
      participationData.previousBestDivisionLevel = participation.previousBestDivisionLevel
      participationData.newDivisionLevel = participation.newDivisionLevel
    }
    if (participationKind.value === 'first-major-trophy') {
      participationData.firstMajorClubTrophy = participation.firstMajorClubTrophy
      participationData.trophyNotSuperCup = participation.trophyNotSuperCup
    }
    if (participationKind.value === 'ten-major-trophies') participationData.wonTenMajorTrophies = participation.wonTenMajorTrophies
    if (participationKind.value === 'third-to-first') {
      participationData.thirdDivisionStartSeason = participation.thirdDivisionStartSeason
      participationData.stayedWithClubFromThirdToFirst = participation.stayedWithClubFromThirdToFirst
    }
    if (participationKind.value === 'manager-of-year') participationData.officialManagerOfYear = participation.officialManagerOfYear
    if (needsInternationalResult.value) {
      participationData.competitionResultKind = participation.competitionResultKind
      participationData.competitionResultStage = participation.competitionResultStage
    }
    if (supportsCompetition.value) participationData.competitionId = claimCompetitionId.value || null
    if (claimClubMatches.value && selectedClaimClub.value?.clubId) participationData.clubId = selectedClaimClub.value.clubId
    else if (selectedClaim.value?.clubId) participationData.clearClubId = true
    await api(`/api/challenges/${challengeId}/achievement-claims${selectedClaim.value ? `/${selectedClaim.value.id}` : ''}`, {
      method: selectedClaim.value ? 'PUT' : 'POST',
      body: JSON.stringify(selectedClaim.value
        ? { ...validation.data, ...participationData, version: selectedClaim.value.version }
        : { code: selectedAchievement.value.code, ...validation.data, ...participationData }),
    })
    achievementDialogVisible.value = false
    await invalidateChallenge()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Achievement could not be recorded.'
  } finally {
    saving.value = false
  }
}

async function deleteAchievement(achievement: Achievement, claim: AchievementClaim) {
  if (!window.confirm(`Remove ${achievement.name} for ${seasonName(claim.seasonIndex)}? This will recalculate the score.`)) return
  claimActionError.value = ''
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/achievement-claims/${claim.id}?version=${claim.version}`, { method: 'DELETE' })
    await invalidateChallenge()
  } catch (error) {
    claimActionError.value = error instanceof Error ? error.message : 'Achievement could not be removed.'
  } finally {
    saving.value = false
  }
}

function openTransfer(transfer?: Transfer) {
  selectedTransfer.value = transfer
  const season = allSeasons.value.find(item => item.seasonIndex === currentSeasonIndex.value) ?? allSeasons.value.at(-1)
  Object.assign(transferForm, {
    seasonIndex: transfer?.seasonIndex ?? season?.seasonIndex ?? 0,
    clubName: transfer?.clubName ?? careerQuery.data.value?.currentClubName ?? '',
    playerName: transfer?.playerName ?? '', counterpartyName: transfer?.counterpartyName ?? '',
    direction: transfer?.direction ?? 'Outgoing', fixedAmount: transfer?.fixedAmount ?? 0,
    currency: transfer?.currency ?? season?.currency ?? 'EUR', notes: transfer?.notes ?? '',
  })
  transferError.value = ''
  transferDialogVisible.value = true
}

async function submitTransfer() {
  transferError.value = ''
  const validation = z.object({
    seasonIndex: z.number().int().min(0).max(100),
    clubName: z.string().trim().min(1).max(120),
    playerName: z.string().trim().min(1).max(120),
    counterpartyName: z.string().trim().min(1).max(120),
    direction: z.enum(['Incoming', 'Outgoing']),
    fixedAmount: z.number().min(0).max(9999999999999.99),
    currency: z.string().trim().regex(/^[A-Za-z]{3}$/),
    notes: z.string().max(1000),
  }).safeParse(transferForm)
  if (!validation.success) {
    transferError.value = validation.error.issues[0]?.message ?? 'Check the transfer details.'
    return
  }
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/transfers${selectedTransfer.value ? `/${selectedTransfer.value.id}` : ''}`, {
      method: selectedTransfer.value ? 'PUT' : 'POST',
      body: JSON.stringify({ ...validation.data, version: selectedTransfer.value?.version ?? null }),
    })
    transferDialogVisible.value = false
    await invalidateChallenge()
  } catch (error) {
    transferError.value = error instanceof Error ? error.message : 'Transfer could not be saved.'
  } finally {
    saving.value = false
  }
}

async function deleteTransfer(transfer: Transfer) {
  if (!window.confirm(`Remove the transfer for ${transfer.playerName}? This will recalculate the score.`)) return
  transferError.value = ''
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/transfers/${transfer.id}?version=${transfer.version}`, { method: 'DELETE' })
    await invalidateChallenge()
  } catch (error) {
    transferError.value = error instanceof Error ? error.message : 'Transfer could not be removed.'
  } finally {
    saving.value = false
  }
}

function openNationalTeam(team?: NationalTeam) {
  selectedNationalTeam.value = team
  Object.assign(nationalTeamForm, {
    teamName: team?.teamName ?? '', countryCode: team?.countryCode ?? '', startSeasonIndex: team?.startSeasonIndex ?? currentSeasonIndex.value,
    endSeasonIndex: team?.endSeasonIndex ?? null, officialMatches: team?.officialMatches ?? 0, notes: team?.notes ?? '',
  })
  nationalSeasonMatches.value = (team?.seasonMatches ?? []).map(item => ({ ...item }))
  nationalTeamError.value = ''
  nationalTeamDialogVisible.value = true
}

function addNationalSeasonMatches() {
  const start = nationalTeamForm.startSeasonIndex
  const end = nationalTeamForm.endSeasonIndex ?? 100
  const season = Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index)
    .find(index => !nationalSeasonMatches.value.some(item => item.seasonIndex === index))
  if (season === undefined) {
    nationalTeamError.value = 'There are no unallocated seasons within this stint.'
    return
  }
  nationalTeamError.value = ''
  nationalSeasonMatches.value.push({ seasonIndex: season, officialMatches: 0 })
}

function removeNationalSeasonMatches(index: number) {
  if (!window.confirm('Remove this national team season allocation? Save the stint to apply the change.')) return
  nationalSeasonMatches.value.splice(index, 1)
}

async function submitNationalTeam() {
  nationalTeamError.value = ''
  const validation = z.object({
    teamName: z.string().trim().min(1).max(120),
    countryCode: z.string().max(8),
    startSeasonIndex: z.number().int().min(0).max(100),
    endSeasonIndex: z.number().int().min(0).max(100).nullable(),
    officialMatches: z.number().int().min(0).max(5000),
    notes: z.string().max(1000),
  }).refine(value => value.endSeasonIndex === null || value.endSeasonIndex >= value.startSeasonIndex, {
    message: 'The end season cannot be before the start season.',
  }).safeParse(nationalTeamForm)
  if (!validation.success) {
    nationalTeamError.value = validation.error.issues[0]?.message ?? 'Check the national team details.'
    return
  }
  const allocations = nationalSeasonMatches.value
  if (allocations.some(item => !Number.isInteger(item.seasonIndex) || item.seasonIndex < validation.data.startSeasonIndex
      || item.seasonIndex > (validation.data.endSeasonIndex ?? 100)
      || !Number.isInteger(item.officialMatches) || item.officialMatches < 0 || item.officialMatches > 5000)
      || new Set(allocations.map(item => item.seasonIndex)).size !== allocations.length
      || allocations.reduce((total, item) => total + item.officialMatches, 0) > validation.data.officialMatches) {
    nationalTeamError.value = 'Season allocations must be unique, within the stint and not exceed its match total.'
    return
  }
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/national-teams${selectedNationalTeam.value ? `/${selectedNationalTeam.value.id}` : ''}`, {
      method: selectedNationalTeam.value ? 'PUT' : 'POST',
      body: JSON.stringify({ ...validation.data, version: selectedNationalTeam.value?.version ?? null, seasonMatches: allocations }),
    })
    nationalTeamDialogVisible.value = false
    await invalidateChallenge()
  } catch (error) {
    nationalTeamError.value = error instanceof Error ? error.message : 'National team could not be saved.'
  } finally {
    saving.value = false
  }
}

async function deleteNationalTeam(team: NationalTeam) {
  if (!window.confirm(`Remove the national team stint with ${team.teamName}?`)) return
  nationalTeamError.value = ''
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/national-teams/${team.id}?version=${team.version}`, { method: 'DELETE' })
    await invalidateChallenge()
  } catch (error) {
    nationalTeamError.value = error instanceof Error ? error.message : 'National team could not be removed.'
  } finally {
    saving.value = false
  }
}

function openCareerStart() {
  const career = careerQuery.data.value
  careerStartStatus.value = career?.startingStatus ?? 'Unemployed'
  careerStartStintId.value = career?.startingStintId ?? ''
  careerStartVersion.value = career?.startingStatusVersion ?? 0
  careerStartError.value = ''
  careerStartDialogVisible.value = true
}

async function saveCareerStart() {
  careerStartError.value = ''
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/career/start`, {
      method: 'PUT',
      body: JSON.stringify({
        status: careerStartStatus.value,
        stintId: careerStartStatus.value === 'Club' ? careerStartStintId.value || null : null,
        version: careerStartVersion.value,
      }),
    })
    careerStartDialogVisible.value = false
    await invalidateChallenge()
  } catch (error) {
    careerStartError.value = error instanceof Error ? error.message : 'Career start could not be saved.'
  } finally {
    saving.value = false
  }
}

function openNationalMilestone() {
  nationalMilestoneSeason.value = careerQuery.data.value?.nationalTeam20MatchSeasonIndex ?? null
  nationalMilestoneVersion.value = careerQuery.data.value?.nationalTeamMilestoneVersion ?? 0
  nationalMilestoneError.value = ''
  nationalMilestoneDialogVisible.value = true
}

async function saveNationalMilestone() {
  nationalMilestoneError.value = ''
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/career/national-team-milestone`, {
      method: 'PUT',
      body: JSON.stringify({ seasonIndex: nationalMilestoneSeason.value, version: nationalMilestoneVersion.value }),
    })
    nationalMilestoneDialogVisible.value = false
    await invalidateChallenge()
  } catch (error) {
    nationalMilestoneError.value = error instanceof Error ? error.message : 'National team milestone could not be saved.'
  } finally {
    saving.value = false
  }
}

function openContinentsMilestone() {
  continentsMilestoneSeason.value = careerQuery.data.value?.threeContinentsSeasonIndex ?? null
  continentsMilestoneVersion.value = careerQuery.data.value?.threeContinentsMilestoneVersion ?? 0
  continentsMilestoneError.value = ''
  continentsMilestoneDialogVisible.value = true
}

async function saveContinentsMilestone() {
  continentsMilestoneError.value = ''
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/career/three-continents-milestone`, {
      method: 'PUT',
      body: JSON.stringify({ seasonIndex: continentsMilestoneSeason.value, version: continentsMilestoneVersion.value }),
    })
    continentsMilestoneDialogVisible.value = false
    await invalidateChallenge()
  } catch (error) {
    continentsMilestoneError.value = error instanceof Error ? error.message : 'Continent milestone could not be saved.'
  } finally {
    saving.value = false
  }
}

async function inviteRival() {
  invitationMessage.value = ''
  heroInviteUrl.value = ''
  try {
    const invitation = await api<{ url: string }>(`/api/challenges/${challengeId}/invites`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    heroInviteUrl.value = invitation.url
    try {
      await navigator.clipboard.writeText(invitation.url)
      invitationMessage.value = 'Invitation link copied.'
    } catch {
      invitationMessage.value = 'The link was created but could not be copied. Copy it manually below.'
    }
  } catch (error) {
    invitationMessage.value = error instanceof Error ? error.message : 'Invitation could not be created.'
  }
}

async function createManagedInvite() {
  inviteManagementError.value = ''
  createdInviteUrl.value = ''
  saving.value = true
  try {
    const result = await api<{ url: string }>(`/api/challenges/${challengeId}/invites`, {
      method: 'POST',
      body: JSON.stringify({ email: inviteEmail.value.trim() || null, expiresInDays: inviteExpiresInDays.value }),
    })
    createdInviteUrl.value = result.url
    inviteEmail.value = ''
    await queryClient.invalidateQueries({ queryKey: ['challenge-invites', challengeId] })
  } catch (error) {
    inviteManagementError.value = error instanceof Error ? error.message : 'Invitation could not be created.'
  } finally {
    saving.value = false
  }
}

async function revokeInvite(invitation: ChallengeInvite) {
  if (!window.confirm('Revoke this invitation? Its link can no longer be used.')) return
  inviteManagementError.value = ''
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/invites/${invitation.id}/revoke`, { method: 'POST' })
    await queryClient.invalidateQueries({ queryKey: ['challenge-invites', challengeId] })
  } catch (error) {
    inviteManagementError.value = error instanceof Error ? error.message : 'Invitation could not be revoked.'
  } finally {
    saving.value = false
  }
}

async function changeCorrectionMode(reopen: boolean) {
  const message = reopen
    ? 'Reopen this completed challenge for corrections? The winner will be cleared until corrections are finished.'
    : 'Finish corrections and recalculate the final result?'
  if (!window.confirm(message)) return
  correctionError.value = ''
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/${reopen ? 'reopen' : 'finish-corrections'}`, {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    })
    await invalidateChallenge()
  } catch (error) {
    correctionError.value = error instanceof Error ? error.message : 'The challenge could not be updated.'
  } finally {
    saving.value = false
  }
}

async function changeArchive(archive: boolean) {
  const prompt = archive
    ? 'Archive this challenge? It becomes read-only and pending invitations are revoked.'
    : 'Restore this challenge to its previous status? Revoked invitations will not be restored.'
  if (!window.confirm(prompt)) return
  archiveError.value = ''
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/${archive ? 'archive' : 'restore'}`, {
      method: 'POST', body: JSON.stringify({ confirm: true }),
    })
    await invalidateChallenge()
  } catch (error) {
    archiveError.value = error instanceof Error ? error.message : 'The challenge status could not be changed.'
  } finally {
    saving.value = false
  }
}

async function publishDraft() {
  if (!challenge.value || challenge.value.status !== 'Draft') return
  archiveError.value = ''
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/publish`, {
      method: 'POST', body: JSON.stringify({ version: challenge.value.version }),
    })
    await invalidateChallenge()
  } catch (error) {
    archiveError.value = error instanceof Error ? error.message : 'The draft could not be published.'
  } finally {
    saving.value = false
  }
}

function selectRule() {
  const rule = rulesQuery.data.value?.rules.find(item => item.achievementCode === ruleCode.value)
  const achievement = achievements.value.find(item => item.code === ruleCode.value)
  rulePoints.value = rule?.points ?? 0
  ruleEnabled.value = rule?.isEnabled ?? true
  ruleName.value = achievement?.name ?? ''
  ruleDescription.value = achievement?.description ?? ''
  ruleCategory.value = achievement?.category ?? ''
  ruleFrequency.value = achievement?.frequency ?? ''
  ruleCupMinimum.value = achievement?.minimumCupMatches ?? 2
  applyDisplayedDetails.value = false
  ruleEffectiveSeason.value = currentSeasonIndex.value
  rulePreview.value = undefined
  ruleError.value = ''
}

function ruleLabel(code: string) {
  const achievement = achievements.value.find(item => item.code === code)
  if (achievement) return `${code} · ${achievement.name}`
  if (code.startsWith('bonus:')) return `First bonus · ${code.slice(6).replace(/^first-/, '').replaceAll('-', ' ')}`
  if (code.startsWith('duel:')) return `Season duel · ${code.slice(5).replaceAll('-', ' ')}`
  if (code.startsWith('checkpoint-')) return `Checkpoint · ${code.slice(11)} points`
  return code
}

function ruleChangePayload() {
  const achievement = achievements.value.find(item => item.code === ruleCode.value)
  return {
    code: ruleCode.value, points: rulePoints.value, isEnabled: ruleEnabled.value,
    nameOverride: achievement && (applyDisplayedDetails.value || ruleName.value !== achievement.name) ? ruleName.value : null,
    descriptionOverride: achievement && (applyDisplayedDetails.value || ruleDescription.value !== achievement.description) ? ruleDescription.value : null,
    categoryOverride: achievement && (applyDisplayedDetails.value || ruleCategory.value !== achievement.category) ? ruleCategory.value : null,
    frequencyOverride: achievement?.canChangeFrequency && (applyDisplayedDetails.value || ruleFrequency.value !== achievement.frequency) ? ruleFrequency.value : null,
    minimumCupMatchesOverride: achievement?.canChangeCupMinimum && (applyDisplayedDetails.value || ruleCupMinimum.value !== achievement.minimumCupMatches) ? ruleCupMinimum.value : null,
    policy: rulePolicy.value, effectiveSeasonIndex: ruleEffectiveSeason.value,
    expectedVersion: rulesQuery.data.value?.version ?? 0,
    expectedChallengeVersion: rulesQuery.data.value?.challengeVersion ?? null, reason: ruleReason.value,
  }
}

async function previewRuleChange() {
  ruleError.value = ''
  saving.value = true
  try {
    const payload = ruleChangePayload()
    rulePreview.value = await api<RuleImpact>(`/api/challenges/${challengeId}/rules/preview`, {
      method: 'POST', body: JSON.stringify(payload),
    })
    rulePreviewKey.value = JSON.stringify(payload)
  } catch (error) {
    rulePreview.value = undefined
    ruleError.value = error instanceof Error ? error.message : 'Rule change could not be previewed.'
  } finally {
    saving.value = false
  }
}

async function applyRuleChange() {
  const payload = ruleChangePayload()
  if (!rulePreview.value || JSON.stringify(payload) !== rulePreviewKey.value) {
    ruleError.value = 'Preview the current changes before applying them.'
    return
  }
  if (!window.confirm('Apply this rule version and recalculate scores?')) return
  ruleError.value = ''
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/rules`, {
      method: 'POST', body: JSON.stringify({ ...payload, confirm: true }),
    })
    rulePreview.value = undefined
    await invalidateChallenge()
    selectRule()
  } catch (error) {
    ruleError.value = error instanceof Error ? error.message : 'Rule change could not be applied.'
  } finally {
    saving.value = false
  }
}

async function createCustomAchievement() {
  customAchievementError.value = ''
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/custom-achievements`, {
      method: 'POST',
      body: JSON.stringify({
        ...customAchievement,
        expectedVersion: rulesQuery.data.value?.version,
        expectedChallengeVersion: rulesQuery.data.value?.challengeVersion,
      }),
    })
    customAchievement.name = ''
    customAchievement.description = ''
    customAchievement.points = 0
    rulePreview.value = undefined
    await invalidateChallenge()
  } catch (error) {
    customAchievementError.value = error instanceof Error ? error.message : 'Custom achievement could not be created.'
  } finally {
    saving.value = false
  }
}

function editCompetition(competition?: Competition) {
  editingCompetition.value = competition
  competitionForm.name = competition?.name ?? ''
  competitionForm.tier = competition?.tier ?? 'Top'
  competitionError.value = ''
}

async function saveCompetition() {
  competitionError.value = ''
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/competitions${editingCompetition.value ? `/${editingCompetition.value.id}` : ''}`, {
      method: editingCompetition.value ? 'PUT' : 'POST',
      body: JSON.stringify({ ...competitionForm, version: editingCompetition.value?.version ?? null }),
    })
    editCompetition()
    rulePreview.value = undefined
    await invalidateChallenge()
  } catch (error) {
    competitionError.value = error instanceof Error ? error.message : 'Competition could not be saved.'
  } finally {
    saving.value = false
  }
}

async function deleteCompetition(competition: Competition) {
  if (!window.confirm(`Remove ${competition.name} from this challenge? Competitions used by claims cannot be removed.`)) return
  competitionError.value = ''
  saving.value = true
  try {
    await api(`/api/challenges/${challengeId}/competitions/${competition.id}?version=${competition.version}`, { method: 'DELETE' })
    if (editingCompetition.value?.id === competition.id) editCompetition()
    rulePreview.value = undefined
    await invalidateChallenge()
  } catch (error) {
    competitionError.value = error instanceof Error ? error.message : 'Competition could not be removed.'
  } finally {
    saving.value = false
  }
}

async function invalidateChallenge() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] }),
    queryClient.invalidateQueries({ queryKey: ['my-challenges'] }),
    queryClient.invalidateQueries({ queryKey: ['seasons', challengeId] }),
    queryClient.invalidateQueries({ queryKey: ['career', challengeId] }),
    queryClient.invalidateQueries({ queryKey: ['national-teams', challengeId] }),
    queryClient.invalidateQueries({ queryKey: ['rules', challengeId] }),
    queryClient.invalidateQueries({ queryKey: ['competitions', challengeId] }),
    queryClient.invalidateQueries({ queryKey: ['challenge-invites', challengeId] }),
    queryClient.invalidateQueries({ queryKey: ['transfers', challengeId] }),
    queryClient.invalidateQueries({ queryKey: ['achievements', challengeId] }),
    queryClient.invalidateQueries({ queryKey: ['activity', challengeId] }),
    queryClient.invalidateQueries({ queryKey: ['scores', challengeId] }),
  ])
}

function seasonName(index: number) {
  const start = (challenge.value?.startSeasonYear ?? 2026) + index
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`
}

function largestSeasonSale(season: Season) {
  return Math.max(season.largestOutgoingTransfer, ...allTransfers.value
    .filter(item => item.seasonIndex === season.seasonIndex && item.direction === 'Outgoing'
      && item.currency.toUpperCase() === season.currency.toUpperCase())
    .map(item => item.fixedAmount))
}

function categoryIcon(category: string) {
  return category === 'Continental' || category === 'International' ? Medal : category === 'Career' ? Users : Trophy
}

function careerClubLabel(club: Career['clubs'][number]) {
  return club.identityLabel ? `${club.clubName} · ${club.identityLabel}` : club.clubName
}

function clubSeasonLabel(stintId: string) {
  if (careerQuery.isPending.value) return 'Loading club...'
  if (careerQuery.isError.value) return 'Club unavailable'
  const stint = careerQuery.data.value?.clubs.find(club => club.id === stintId)
  return stint ? `${careerClubLabel(stint)} (${stint.countryCode})` : 'Club no longer available'
}
</script>

<template>
  <main class="challenge-shell">
    <a class="skip-link" href="#challenge-content">Skip to main content</a>
    <header class="challenge-topbar">
      <a class="brand" href="/dashboard" aria-label="FM Career Challenge home"><span class="brand-mark"><Trophy :size="18" /></span><span class="brand-copy">FM CAREER <span>CHALLENGE</span></span></a>
      <div class="challenge-top-actions">
        <ThemeToggle />
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
      <section id="challenge-content" class="challenge-hero" tabindex="-1">
        <div class="challenge-hero-inner">
          <div class="challenge-hero-copy">
            <div class="hero-kicker"><span class="live-pulse"></span> {{ challenge.status.toUpperCase() }} <span class="hero-divider">/</span> RACE TO 500</div>
            <h1>{{ challenge.name }}</h1>
            <p>{{ challenge.description || 'A career is measured in seasons, not speed. Make every one count.' }}</p>
            <div class="hero-meta"><span><CalendarDays :size="14" /> Started {{ challenge.startSeasonYear }}/{{ String((challenge.startSeasonYear + 1) % 100).padStart(2, '0') }}</span><span><Users :size="14" /> {{ participants.length }} of 2 managers</span></div>
          </div>
          <div class="hero-actions">
            <Button v-if="challenge.status === 'Draft' && me?.role === 'Administrator'" class="primary-button" :loading="saving" label="Publish draft" @click="publishDraft" />
            <Button v-if="!rival && !isReadOnly && me?.role === 'Administrator'" class="invite-button" @click="inviteRival"><Users :size="16" /> Invite your rival</Button>
            <Button v-if="me?.role === 'Administrator' && !challenge.isCorrectionMode" class="outline-button" :loading="saving" @click="changeArchive(challenge.status !== 'Archived')">{{ challenge.status === 'Archived' ? 'Restore challenge' : 'Archive challenge' }}</Button>
            <span v-if="invitationMessage" class="invitation-feedback" role="status">{{ invitationMessage }}</span>
            <label v-if="heroInviteUrl && !rival">Invitation link <InputText :model-value="heroInviteUrl" readonly /></label>
            <span v-if="archiveError" class="form-error" role="alert">{{ archiveError }}</span>
            <Tag v-if="isReadOnly" :value="challenge.status === 'Draft' ? 'CONFIGURATION ONLY' : 'READ ONLY'" severity="secondary" />
          </div>
        </div>
      </section>

      <section class="scoreboard">
        <article class="manager-score">
          <span class="manager-avatar you">{{ me?.trainerName?.slice(0, 1) ?? 'Y' }}</span>
          <div class="manager-label"><span>YOUR CAREER</span><strong>{{ me?.trainerName ?? me?.displayName ?? 'Manager' }}</strong><small>{{ careerQuery.isPending.value ? 'Loading club…' : careerQuery.isError.value ? 'Club unavailable' : careerQuery.data.value?.currentClubName ?? 'No current club' }}</small></div>
          <div class="manager-points"><strong>{{ me?.score ?? 0 }}</strong><span>PTS</span></div>
          <div class="score-progress"><ProgressBar :value="Math.min(100, ((me?.score ?? 0) / challenge.targetPoints) * 100)" aria-label="Your career progress" :show-value="false" /><small>{{ Math.max(0, challenge.targetPoints - (me?.score ?? 0)) }} points to go</small></div>
        </article>
        <div class="score-divider"><span>VS</span></div>
        <article class="manager-score rival-score">
          <span class="manager-avatar rival">{{ rival?.trainerName?.slice(0, 1) ?? '?' }}</span>
          <div class="manager-label"><span>RIVAL CAREER</span><strong>{{ rival?.trainerName ?? rival?.displayName ?? 'Waiting for rival' }}</strong><small>{{ rival ? 'Another season, another story' : 'Share your invitation link' }}</small></div>
          <div class="manager-points"><strong>{{ rival?.score ?? '—' }}</strong><span>PTS</span></div>
          <div class="score-progress"><ProgressBar :value="Math.min(100, ((rival?.score ?? 0) / challenge.targetPoints) * 100)" aria-label="Rival career progress" :show-value="false" /><small>{{ rival ? `${Math.max(0, challenge.targetPoints - rival.score)} points to go` : 'Not started' }}</small></div>
        </article>
      </section>

      <section v-if="challenge.status === 'Draft'" class="winner-banner">Configure the rules, then publish the draft to invite a rival and record results.</section>
      <section v-if="challenge.status === 'Completed'" class="winner-banner">
        <Trophy :size="18" /> <strong>Challenge complete.</strong> The winner has been confirmed for {{ seasonName(challenge.winningSeasonIndex ?? 0) }}.
        <Button v-if="me?.role === 'Administrator'" class="text-action" :loading="saving" @click="changeCorrectionMode(true)">Reopen for corrections</Button>
      </section>
      <section v-if="challenge.isCorrectionMode" class="winner-banner">
        <strong>Correction mode.</strong> The result will not be finalised until the administrator finishes corrections.
        <Button v-if="me?.role === 'Administrator'" class="text-action" :loading="saving" @click="changeCorrectionMode(false)">Finish corrections</Button>
      </section>
      <p v-if="correctionError" class="form-error" role="alert">{{ correctionError }}</p>
      <section v-if="careerQuery.data.value?.requiresStartingStatus && !careerQuery.data.value?.startingStatus" class="winner-banner">
        <strong>Record your career start before entering results.</strong>
        <button type="button" class="link-button" @click="activeTab = 'Career'">Go to career</button>
      </section>

      <nav class="challenge-tabs" aria-label="Challenge sections">
        <button v-for="tab in ['Overview', 'Career', 'Seasons', 'Transfers', 'Achievements', 'Activity', 'Rules']" :key="tab" :class="{ selected: activeTab === tab }" :aria-pressed="activeTab === tab" @click="activeTab = tab">
          {{ tab }}
          <span v-if="tab === 'Achievements' && achievementQuery.isSuccess.value" class="tab-count">{{ achievements.length }}</span>
        </button>
        <span class="tabs-live"><span class="online-dot"></span> {{ connectionStatus ? 'SYNCED' : 'SYNCING' }}</span>
      </nav>
      <p v-if="seasonsQuery.isError.value && activeTab !== 'Seasons' && activeTab !== 'Overview'" class="detail-error" role="alert">Seasons could not be loaded. Actions that need the current season are unavailable. <button class="link-button" @click="() => seasonsQuery.refetch()">Try again</button></p>
      <p v-else-if="seasonsQuery.isPending.value && activeTab !== 'Seasons' && activeTab !== 'Overview'" class="challenge-placeholder" role="status">Loading seasons before enabling season-dependent actions…</p>

      <section v-if="activeTab === 'Overview'" class="challenge-content overview-grid">
        <div class="overview-main">
          <div class="detail-section-head"><div><span class="eyebrow"><span class="eyebrow-line"></span> NEXT MILESTONE</span><h2>Your season, your story.</h2></div><Button v-if="!isReadOnly" class="primary-button" :disabled="!seasonsQuery.isSuccess.value" @click="openSeasonDialog()"><Plus :size="15" /> Update season</Button></div>
          <div v-if="seasonsQuery.isPending.value || careerQuery.isPending.value" class="challenge-placeholder" role="status">Loading your season and career…</div>
          <div v-else-if="seasonsQuery.isError.value || careerQuery.isError.value" class="detail-error" role="alert">Your season and career could not be loaded. <button class="link-button" @click="() => { seasonsQuery.refetch(); careerQuery.refetch() }">Try again</button></div>
          <div v-else class="season-feature">
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
          <div class="detail-section-head compact"><div><span class="eyebrow"><span class="eyebrow-line"></span> CAREER PATH</span><h2>Club journey</h2></div><Button v-if="!isReadOnly" class="text-action" @click="openClub()"><CirclePlus :size="15" /> Add club</Button></div>
          <div class="score-timeline-card">
            <div class="chart-heading"><div><span class="eyebrow"><span class="eyebrow-line"></span> SEASON BY SEASON</span><h3>Confirmed points timeline</h3></div><span class="chart-legend-dot"></span></div>
            <div v-if="scoreQuery.isPending.value" class="chart-empty">Loading score history...</div>
            <div v-else-if="scoreQuery.isError.value" class="chart-empty" role="alert">Score history could not be loaded.</div>
            <ScoreTimelineChart
              v-else
              :participants="scoreQuery.data.value?.participants ?? []"
              :series="scoreQuery.data.value?.series ?? []"
              :start-year="challenge.startSeasonYear"
            />
          </div>
          <div v-if="scoreQuery.data.value" class="rulebook-grid">
            <article><strong>Your score breakdown</strong><p>{{ myScoreDetails?.basePoints ?? 0 }} achievement · {{ myScoreDetails?.bonusPoints ?? 0 }} first bonuses · {{ myScoreDetails?.duelPoints ?? 0 }} duels · {{ myScoreDetails?.checkpointPoints ?? 0 }} checkpoints</p><p>{{ myScoreDetails?.confirmedPoints ?? 0 }} confirmed · {{ myScoreDetails?.pendingPoints ?? 0 }} pending (not included in confirmed points)</p></article>
            <article><strong>Last common completed season</strong><p v-if="scoreQuery.data.value.commonSeasonIndex != null">{{ seasonName(scoreQuery.data.value.commonSeasonIndex) }}: <span v-for="(total, index) in scoreQuery.data.value.totals" :key="total.participantId">{{ index ? ' · ' : '' }}{{ participants.find(item => item.id === total.participantId)?.trainerName ?? 'Manager' }} {{ total.commonSeasonPoints }} pts</span></p><p v-else>No completed season in common yet.</p></article>
          </div>
          <p v-if="scoreQuery.data.value?.victoryPending" class="rulebook-note" role="status">Victory is pending<span v-if="scoreQuery.data.value.pendingVictorySeasonIndex != null"> from {{ seasonName(scoreQuery.data.value.pendingVictorySeasonIndex) }}</span>. Comparable seasons and outstanding scoring must determine a winner before the challenge can finish.</p>
          <details v-if="scoreQuery.data.value" class="rulebook-note">
            <summary>Detailed score events</summary>
            <p v-if="!scoreQuery.data.value.breakdown.length">No scoring events have been recorded yet.</p>
            <div v-else class="season-table-wrap">
              <table class="season-table"><thead><tr><th>SEASON</th><th>MANAGER</th><th>REASON</th><th>STATUS</th><th>POINTS</th><th>RULE VERSION</th></tr></thead><tbody><tr v-for="event in scoreQuery.data.value.breakdown" :key="`${event.participantId}-${event.sourceType}-${event.sourceKey}`"><td>{{ seasonName(event.seasonIndex) }}</td><td>{{ participants.find(item => item.id === event.participantId)?.trainerName ?? 'Manager' }}</td><td>{{ event.label }}<small v-if="event.explanation"><br />{{ event.explanation }}</small></td><td>{{ event.status }}</td><td>{{ event.points }}</td><td>v{{ event.ruleVersion }}</td></tr></tbody></table>
            </div>
          </details>
          <div v-if="careerQuery.isPending.value" class="challenge-placeholder" role="status">Loading clubs…</div>
          <div v-else-if="careerQuery.isError.value" class="detail-error" role="alert">Could not load clubs. <button class="link-button" @click="() => careerQuery.refetch()">Try again</button></div>
          <div v-else-if="allClubs.length" class="club-path">
            <article v-for="club in allClubs" :key="club.id" class="club-path-item">
              <div class="club-path-mark">{{ club.clubName.slice(0, 1).toUpperCase() }}</div>
              <div class="club-path-copy"><strong>{{ careerClubLabel(club) }}</strong><span>{{ club.countryName }} · {{ seasonName(club.startSeasonIndex) }}{{ club.endSeasonIndex != null ? ` — ${seasonName(club.endSeasonIndex)}` : ' — Present' }}</span></div>
              <span class="matches-badge">{{ club.officialMatches }} matches</span>
            </article>
          </div>
          <div v-else class="empty-detail"><Flag :size="20" /><strong>No clubs in your timeline</strong><span>Add the clubs you've managed to unlock career goals and the three-club victory requirement.</span></div>
        </div>

        <aside class="overview-side">
          <article class="detail-side-card checkpoint-card"><span class="eyebrow"><span class="eyebrow-line"></span> ROAD TO GLORY</span><h3>Progress to {{ challenge.targetPoints }}</h3><div class="checkpoint-ring"><div><strong>{{ Math.min(100, Math.round(((me?.score ?? 0) / challenge.targetPoints) * 100)) }}<small>%</small></strong><span>COMPLETE</span></div></div><div class="checkpoint-meta"><span>{{ me?.score ?? 0 }} points</span><span>{{ challenge.targetPoints }} target</span></div><ProgressBar :value="Math.min(100, ((me?.score ?? 0) / challenge.targetPoints) * 100)" aria-label="Progress to the challenge target" :show-value="false" /><div class="three-clubs"><Shield :size="15" /><span>A win also requires 3 clubs with at least 20 official games each.</span></div></article>
          <article class="detail-side-card next-goal-card"><div class="side-card-heading"><div class="side-icon gold"><Trophy :size="16" /></div><div><span class="eyebrow">QUICK ADD</span><h3>Log a milestone</h3></div></div><p>Turn this season's achievements into points. Pick from your challenge's rulebook.</p><Button class="outline-button full-button" @click="activeTab = 'Achievements'">Explore achievements <ChevronRight :size="14" /></Button></article>
          <article class="detail-side-card season-card-small"><div class="side-card-heading"><div class="side-icon"><Radio :size="16" /></div><div><span class="eyebrow">LIVE COMPARISON</span><h3>Season timeline</h3></div></div><p>First bonuses and duels compare the in-game season—not real-world activity.</p><div class="timeline-seasons"><span v-for="season in allSeasons.slice(-4)" :key="season.id" :class="{ complete: season.status === 'Completed' }">{{ season.displayName }}</span></div></article>
        </aside>
      </section>

      <section v-else-if="activeTab === 'Career'" class="challenge-content tab-content">
        <div class="detail-section-head"><div><span class="eyebrow"><span class="eyebrow-line"></span> MANAGER PROFILE</span><h2>Your career timeline</h2><p class="section-copy">Clubs count toward the win condition once you've managed at least 20 official games.</p></div><Button v-if="!isReadOnly" class="primary-button" @click="openClub()"><Plus :size="15" /> Add a club</Button></div>
        <div v-if="careerQuery.isSuccess.value" class="rulebook-note"><div>
          <strong>Career start</strong>
          <p v-if="careerQuery.data.value?.startingStatus === 'Unemployed'">Started unemployed.</p>
          <p v-else-if="careerQuery.data.value?.startingStatus === 'Club'">Starting club: {{ allClubs.find(club => club.id === careerQuery.data.value?.startingStintId)?.clubName }}.</p>
          <p v-else>Not recorded. Start unemployed or at a club below the first division.</p>
          <Button v-if="!isReadOnly" class="outline-button" label="Set career start" @click="openCareerStart" />
        </div></div>
        <p v-if="clubActionError" class="form-error" role="alert">{{ clubActionError }}</p>
        <div v-if="careerQuery.isPending.value" class="challenge-placeholder" role="status">Loading clubs…</div>
        <div v-else-if="careerQuery.isError.value" class="detail-error" role="alert">Could not load your career. <button class="link-button" @click="() => careerQuery.refetch()">Try again</button></div>
        <div v-else-if="allClubs.length" class="career-timeline">
          <article v-for="(club, index) in allClubs" :key="club.id" class="timeline-club">
            <div class="timeline-marker"><span>{{ String(index + 1).padStart(2, '0') }}</span></div>
            <div class="timeline-club-card"><div class="timeline-club-title"><div><strong>{{ careerClubLabel(club) }}</strong><span>{{ club.countryName }} · Division level {{ club.initialDivisionLevel }}</span></div><Tag :value="club.clubEligibleSeasonIndex != null ? 'MILESTONE ELIGIBLE' : club.eligibleSeasonIndex != null ? 'MILESTONE NEEDS REVIEW' : club.clubOfficialMatches >= 20 ? 'MILESTONE SEASON NEEDED' : `${club.clubOfficialMatches}/20 CLUB GAMES`" :severity="club.clubEligibleSeasonIndex != null ? 'success' : 'secondary'" /></div><div class="timeline-club-bottom"><span><CalendarDays :size="13" /> {{ seasonName(club.startSeasonIndex) }}{{ club.endSeasonIndex != null ? ` to ${seasonName(club.endSeasonIndex)}` : ' to present' }}</span><span><Flag :size="13" /> {{ club.officialMatches }} matches in this stint · {{ club.clubOfficialMatches }} across club stints · {{ club.countryOfficialMatches }} in {{ club.countryName }}</span><span v-if="club.eligibleSeasonIndex != null && club.clubMilestoneValid === false">This stint's club milestone needs review</span><span v-if="club.countryEligibleSeason != null">Country milestone: {{ seasonName(club.countryEligibleSeason) }}</span><span v-if="club.countryEligibleSeasonIndex != null && club.countryMilestoneValid === false">This stint's country milestone needs review</span><button v-if="!isReadOnly" class="link-button" :aria-label="`Update matches for ${careerClubLabel(club)}`" @click="openClubMatches(club)">Update matches</button><button v-if="!isReadOnly" class="link-button" :disabled="saving" :aria-label="`Set country milestone for ${careerClubLabel(club)}`" @click="openCountryMilestone(club)">Country milestone</button><button v-if="!isReadOnly" class="link-button" :disabled="saving" :aria-label="`Edit ${careerClubLabel(club)}`" @click="openClub(club)">Edit</button><button v-if="!isReadOnly" class="link-button" :disabled="saving" :aria-label="`Remove ${careerClubLabel(club)}`" @click="deleteClub(club)">Remove</button></div></div>
          </article>
        </div>
        <div v-else class="empty-detail large"><Users :size="23" /><strong>Your journey is waiting.</strong><span>Add the clubs you've managed, including your starting club, to see your full career path.</span><Button v-if="!isReadOnly" class="primary-button" @click="openClub()"><Plus :size="15" /> Add first club</Button></div>
        <div v-if="careerQuery.isSuccess.value" class="rulebook-note"><div><strong>Three continents</strong><p>Complete season match allocations and catalog country codes calculate the milestone. Otherwise, record the season when you first managed a match in your third continent.</p><p v-if="careerQuery.data.value?.threeContinentsCalculatedSeasonIndex != null">Calculated milestone season: {{ seasonName(careerQuery.data.value.threeContinentsCalculatedSeasonIndex) }}.</p><p v-if="careerQuery.data.value?.threeContinentsSeasonIndex != null">Attested milestone season: {{ seasonName(careerQuery.data.value.threeContinentsSeasonIndex) }}. <span v-if="!careerQuery.data.value.threeContinentsMilestoneValid">Milestone needs review: the career records no longer support it.</span><span v-else>The career records support this milestone.</span></p><Button v-if="!isReadOnly" type="button" class="outline-button" label="Set continent milestone" @click="openContinentsMilestone" /></div></div>
        <div class="detail-section-head"><div><span class="eyebrow"><span class="eyebrow-line"></span> NATIONAL TEAMS</span><h2>International career</h2><p class="section-copy">National team matches are recorded separately from club matches and can overlap a club stint.</p></div><Button v-if="!isReadOnly" class="primary-button" :disabled="!seasonsQuery.isSuccess.value" @click="openNationalTeam()"><Plus :size="15" /> Add national team</Button></div>
        <p v-if="nationalTeamError && !nationalTeamDialogVisible" class="form-error" role="alert">{{ nationalTeamError }}</p>
        <div v-if="nationalTeamsQuery.isPending.value" class="challenge-placeholder">Loading national teams…</div>
        <div v-else-if="nationalTeamsQuery.isError.value" class="detail-error" role="alert">Could not load national teams: {{ nationalTeamsQuery.error.value?.message }}</div>
        <div v-else-if="nationalTeamsQuery.data.value?.length" class="season-table-wrap"><table class="season-table"><thead><tr><th>TEAM</th><th>START</th><th>END</th><th>OFFICIAL MATCHES</th><th v-if="!isReadOnly">ACTION</th></tr></thead><tbody><tr v-for="team in nationalTeamsQuery.data.value" :key="team.id"><td>{{ team.teamName }}</td><td>{{ seasonName(team.startSeasonIndex) }}</td><td>{{ team.endSeasonIndex === null ? 'Present' : seasonName(team.endSeasonIndex) }}</td><td>{{ team.officialMatches }}</td><td v-if="!isReadOnly"><button class="link-button" :disabled="saving" :aria-label="`Edit ${team.teamName} stint`" @click="openNationalTeam(team)">Edit</button> <button class="link-button" :disabled="saving" :aria-label="`Remove ${team.teamName} stint`" @click="deleteNationalTeam(team)">Remove</button></td></tr></tbody></table></div>
        <div v-else class="empty-detail"><span>No national team stints recorded.</span></div>
        <div v-if="careerQuery.isSuccess.value" class="rulebook-note"><div><strong>20 national team matches</strong><p>Complete season allocations across all national team stints calculate the milestone automatically. Otherwise, record the season when you completed your 20th official match. Club matches do not count.</p><p v-if="careerQuery.data.value?.nationalTeamCalculatedSeasonIndex != null">Calculated milestone season: {{ seasonName(careerQuery.data.value.nationalTeamCalculatedSeasonIndex) }}.</p><p v-if="careerQuery.data.value?.nationalTeam20MatchSeasonIndex != null">Attested milestone season: {{ seasonName(careerQuery.data.value.nationalTeam20MatchSeasonIndex) }}. <span v-if="!careerQuery.data.value.nationalTeamMilestoneValid">Milestone needs review: the national team records no longer support it.</span><span v-else>The national team records support this milestone.</span></p><Button v-if="!isReadOnly" type="button" class="outline-button" label="Set milestone season" @click="openNationalMilestone" /></div></div>
      </section>

      <section v-else-if="activeTab === 'Seasons'" class="challenge-content tab-content">
        <div class="detail-section-head"><div><span class="eyebrow"><span class="eyebrow-line"></span> SEASON RECORDS</span><h2>Every season, on the record.</h2><p class="section-copy">League figures determine the annual PPG and goals-per-game duels. Complete seasons to confirm head-to-head results.</p></div><Button v-if="!isReadOnly" class="primary-button" :disabled="!seasonsQuery.isSuccess.value" @click="openSeasonDialog()"><Plus :size="15" /> Update season</Button></div>
        <p v-if="scoreQuery.data.value?.currencyMismatchSeasons?.length" class="form-error" role="status">Transfer duels are pending for {{ scoreQuery.data.value.currencyMismatchSeasons.map(seasonName).join(', ') }}: both managers must record their sales in the same currency.</p>
        <div v-if="seasonsQuery.isPending.value" class="challenge-placeholder" role="status">Loading seasons…</div>
        <div v-else-if="seasonsQuery.isError.value" class="detail-error" role="alert">Could not load seasons. <button class="link-button" @click="() => seasonsQuery.refetch()">Try again</button></div>
        <div v-else-if="allSeasons.length" class="season-table-wrap"><table class="season-table"><thead><tr><th>SEASON</th><th>STATUS</th><th>GAMES</th><th>W-D-L</th><th>POINTS</th><th>GOALS</th><th>BEST SALE</th><th v-if="!isReadOnly">ACTION</th></tr></thead><tbody><tr v-for="season in allSeasons" :key="season.id"><td><strong>{{ season.displayName }}</strong></td><td><Tag :value="season.status" :severity="season.status === 'Completed' ? 'success' : 'secondary'" /></td><td>{{ season.leagueMatches }}</td><td>{{ season.leagueWins }}-{{ season.leagueDraws }}-{{ season.leagueLosses }}</td><td>{{ season.leaguePoints }}</td><td>{{ season.goalsFor }}-{{ season.goalsAgainst }}</td><td>{{ transfersQuery.isPending.value ? 'Loading…' : transfersQuery.isError.value ? 'Unavailable' : new Intl.NumberFormat('en', { style: 'currency', currency: season.currency }).format(largestSeasonSale(season)) }}</td><td v-if="!isReadOnly"><button class="link-button" :aria-label="`Edit ${season.displayName}`" @click="openSeasonDialog(season)">Edit</button></td></tr></tbody></table></div>
        <div v-else class="empty-detail large"><CalendarDays :size="23" /><strong>No seasons recorded yet.</strong><span>Record your first season to begin earning duels and building your FM timeline.</span><Button v-if="!isReadOnly" class="primary-button" @click="openSeasonDialog()"><Plus :size="15" /> Record a season</Button></div>
        <div v-for="season in allSeasons.filter(item => item.clubSeasons?.length)" :key="`${season.id}-clubs`" class="rulebook-note">
          <div><strong>{{ season.displayName }} · club statistics</strong><p>{{ season.usesClubBreakdown ? 'These club totals determine the season league duels.' : 'Saved club statistics; the quick summary currently determines the season league duels.' }}</p>
            <div class="season-table-wrap"><table class="season-table"><thead><tr><th>CLUB</th><th>DIVISION</th><th>OFFICIAL</th><th>LEAGUE</th><th>W-D-L</th><th>POINTS</th><th>GOALS</th><th>POSITION</th></tr></thead><tbody><tr v-for="row in season.clubSeasons" :key="row.careerStintId"><td>{{ clubSeasonLabel(row.careerStintId) }}</td><td>{{ row.divisionLevel }}</td><td>{{ row.officialMatches }}</td><td>{{ row.leagueMatches }}</td><td>{{ row.leagueWins }}-{{ row.leagueDraws }}-{{ row.leagueLosses }}</td><td>{{ row.leaguePoints }}</td><td>{{ row.goalsFor }}-{{ row.goalsAgainst }}</td><td>{{ row.leaguePosition ?? '—' }}</td></tr></tbody></table></div>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 'Transfers'" class="challenge-content tab-content">
        <div class="detail-section-head"><div><span class="eyebrow"><span class="eyebrow-line"></span> TRANSFERS</span><h2>Deals on the record.</h2><p class="section-copy">Record fixed fees only. A season's largest sale is the higher of its quick summary and individual sales; the same deal is never added twice.</p></div><Button v-if="!isReadOnly" class="primary-button" :disabled="!seasonsQuery.isSuccess.value" @click="openTransfer()"><Plus :size="15" /> Record transfer</Button></div>
        <p v-if="transferError && !transferDialogVisible" class="form-error" role="alert">{{ transferError }}</p>
        <div v-if="transfersQuery.isPending.value" class="challenge-placeholder">Loading transfers…</div>
        <div v-else-if="transfersQuery.isError.value" class="detail-error" role="alert">Could not load transfers: {{ transfersQuery.error.value?.message }}</div>
        <template v-else-if="allTransfers.length">
          <div class="rulebook-grid"><article v-for="summary in transferSummaries" :key="summary.currency"><strong>{{ summary.currency }} · {{ summary.count }} operations</strong><p>Spent {{ summary.spent.toLocaleString('en') }} · Received {{ summary.received.toLocaleString('en') }} · Balance {{ (summary.received - summary.spent).toLocaleString('en') }} · Largest purchase {{ summary.largestPurchase.toLocaleString('en') }} · Largest sale {{ summary.largestSale.toLocaleString('en') }}</p></article></div>
          <div class="season-table-wrap"><table class="season-table"><thead><tr><th>SEASON</th><th>PLAYER</th><th>TYPE</th><th>MANAGED CLUB</th><th>OTHER CLUB</th><th>FIXED FEE</th><th v-if="!isReadOnly">ACTION</th></tr></thead><tbody><tr v-for="transfer in allTransfers" :key="transfer.id"><td>{{ seasonName(transfer.seasonIndex) }}</td><td>{{ transfer.playerName }}</td><td>{{ transfer.direction === 'Incoming' ? 'Purchase' : 'Sale' }}</td><td>{{ transfer.clubName }}</td><td>{{ transfer.counterpartyName }}</td><td>{{ new Intl.NumberFormat('en', { style: 'currency', currency: transfer.currency }).format(transfer.fixedAmount) }}</td><td v-if="!isReadOnly"><button class="link-button" :disabled="saving" :aria-label="`Edit transfer for ${transfer.playerName}`" @click="openTransfer(transfer)">Edit</button> <button class="link-button" :disabled="saving" :aria-label="`Remove transfer for ${transfer.playerName}`" @click="deleteTransfer(transfer)">Remove</button></td></tr></tbody></table></div>
        </template>
        <div v-else class="empty-detail large"><strong>No individual transfers recorded.</strong><span>You can also enter your largest sale directly in the season form.</span></div>
      </section>

      <section v-else-if="activeTab === 'Achievements'" class="challenge-content tab-content">
        <div class="detail-section-head"><div><span class="eyebrow"><span class="eyebrow-line"></span> THE RULEBOOK</span><h2>Milestones & achievements</h2><p class="section-copy">The backend calculates points, but not every condition is checked automatically. Please verify the requirements before recording an achievement.</p></div><div v-if="achievementQuery.isSuccess.value" class="achievement-total"><strong>{{ achievements.length }}</strong><span>GOALS IN THIS RULEBOOK</span></div></div>
        <div class="category-filter" aria-label="Achievement category filters"><button v-for="category in ['All', ...categories]" :key="category" :class="{ selected: selectedCategory === category }" :aria-pressed="selectedCategory === category" @click="selectedCategory = category">{{ category }}</button></div>
        <div v-if="achievementQuery.isSuccess.value" class="achievement-filters">
          <label>Search achievements <input v-model="achievementSearch" type="search" placeholder="Name, code or description" /></label>
          <label>Frequency <select v-model="achievementFrequency"><option value="All">All frequencies</option><option v-for="frequency in frequencies" :key="frequency" :value="frequency">{{ frequency.replace(/([A-Z])/g, ' $1').trim() }}</option></select></label>
          <label>Status <select v-model="achievementStatus"><option value="All">All statuses</option><option>Enabled</option><option>Disabled</option><option>Recorded</option><option>Not recorded</option></select></label>
          <label>Points <select v-model="achievementPoints"><option value="All">All points</option><option v-for="points in pointValues" :key="points" :value="String(points)">{{ points }}</option></select></label>
          <button type="button" class="outline-button" @click="clearAchievementFilters">Clear filters</button>
        </div>
        <p v-if="claimActionError" class="form-error" role="alert">{{ claimActionError }}</p>
        <div v-if="achievementQuery.isPending.value" class="challenge-placeholder">Loading challenge rules…</div>
        <div v-else-if="achievementQuery.isError.value" class="detail-error" role="alert">Could not load achievements. <button class="link-button" @click="() => achievementQuery.refetch()">Try again</button></div>
        <p v-else-if="visibleAchievements.length === 0" class="empty-detail" role="status">No achievements match these filters.</p>
        <div v-else class="achievement-grid">
          <article v-for="achievement in visibleAchievements" :key="achievement.code" class="achievement-card" :class="{ disabled: !achievement.isEnabled }">
            <div class="achievement-top"><span class="achievement-icon"><component :is="categoryIcon(achievement.category)" :size="17" /></span><span class="achievement-code">{{ achievement.code }}</span></div>
            <h3>{{ achievement.name }}</h3><p>{{ achievement.description }}</p>
            <div class="achievement-meta"><strong>+{{ achievement.points }}<small> pts</small></strong><span>{{ achievement.frequency.replace(/([A-Z])/g, ' $1').toLowerCase() }}</span></div>
            <div v-if="achievement.claims.length" class="claim-history"><BadgeCheck :size="13" /> {{ achievement.claims.length }} recorded</div>
            <div v-if="achievement.isAutomatic" class="claim-history"><BadgeCheck :size="13" /> {{ achievement.automaticSeasonIndex == null ? (achievement.code === 'G033' ? 'Calculated from national team matches and the recorded milestone season.' : achievement.code === 'G053' ? 'Calculated from club and national team countries and the recorded three-continent milestone season.' : achievement.code === 'G048' ? 'Calculated from recorded major trophy claims.' : ['G042', 'G043', 'G044', 'G047'].includes(achievement.code) ? 'Calculated from clubs with 20 matches and an eligibility season.' : 'Calculated from first-division titles; add club and country details to title claims.') : `Unlocked in ${seasonName(achievement.automaticSeasonIndex)}` }}</div>
            <div v-if="!achievement.isEnabled" class="claim-history">Disabled in the latest rule version; earlier seasons may still allow this achievement.</div>
            <div v-for="claim in achievement.claims" :key="claim.id" class="claim-history">
              <span>{{ seasonName(claim.seasonIndex) }}{{ claim.clubName ? ` · ${claim.clubName}` : '' }}</span>
              <span v-if="achievement.code === 'G053'">Older manual record; set the career milestone to update it.</span>
              <button v-if="!isReadOnly && achievement.code !== 'G053'" class="link-button" :disabled="saving" :aria-label="`Edit ${achievement.name} for ${seasonName(claim.seasonIndex)}`" @click="openAchievement(achievement, claim)">Edit</button>
              <button v-if="!isReadOnly" class="link-button" :disabled="saving" :aria-label="`Remove ${achievement.name} for ${seasonName(claim.seasonIndex)}`" @click="deleteAchievement(achievement, claim)">Remove</button>
            </div>
            <Button v-if="!isReadOnly && !achievement.isAutomatic" class="achievement-add" :disabled="!seasonsQuery.isSuccess.value" @click="openAchievement(achievement)"><Plus :size="14" /> Record</Button>
            <span v-else class="achievement-locked">{{ achievement.isAutomatic ? 'AUTOMATIC' : 'READ ONLY' }}</span>
          </article>
        </div>
      </section>

      <section v-else-if="activeTab === 'Activity'" class="challenge-content tab-content">
        <div class="detail-section-head"><div><span class="eyebrow"><span class="eyebrow-line"></span> LIVE MATCH CENTRE</span><h2>Challenge activity</h2><p class="section-copy">Real-time updates are notices; the API remains the source of truth.</p></div></div>
        <div v-if="activityQuery.isPending.value" class="challenge-placeholder">Loading activity…</div>
        <div v-else-if="activityQuery.isError.value" class="detail-error" role="alert">Could not load activity. <button class="link-button" @click="() => activityQuery.refetch()">Try again</button></div>
        <div v-else-if="activityQuery.data.value?.length" class="activity-feed">
          <article v-for="item in activityQuery.data.value" :key="item.id" class="activity-item"><span class="activity-mark"><Trophy v-if="item.type.startsWith('achievement')" :size="15" /><ArrowUpRight v-else :size="15" /></span><div><strong>{{ item.participantName }}</strong><p>{{ item.message }}</p><small>{{ item.seasonIndex != null ? seasonName(item.seasonIndex) : 'Challenge activity' }} · {{ new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt)) }}</small></div></article>
        </div>
        <div v-else class="empty-detail large"><Clock3 :size="23" /><strong>The story starts here.</strong><span>Challenge activity will appear as players add clubs, record seasons, and reach new milestones.</span></div>
      </section>

      <section v-else class="challenge-content tab-content">
        <div class="detail-section-head"><div><span class="eyebrow"><span class="eyebrow-line"></span> CHALLENGE SETTINGS</span><h2>Race to 500 rules</h2><p class="section-copy">Rules are scoped to this challenge and scoring is recalculated by the server.</p></div><Settings2 :size="20" class="settings-mark" /></div>
        <div class="rulebook-grid"><article><span>01</span><strong>{{ challenge.targetPoints }} confirmed points</strong><p>Base achievements, confirmed bonuses, seasonal duels, and confirmed checkpoints build your total.</p></article><article><span>02</span><strong>Three eligible clubs</strong><p>To win, log at least 20 official matches with each of three distinct clubs.</p></article><article><span>03</span><strong>In-game chronology</strong><p>First bonuses compare the challenge season index, not when a result was entered.</p></article><article><span>04</span><strong>One rival, separate saves</strong><p>Each manager records their own career. Opponents can never edit another player's record.</p></article></div>
        <div v-if="me?.role === 'Administrator'" class="detail-form-grid">
          <h3>Manage invitations</h3>
          <form v-if="!rival && !isReadOnly" class="detail-form-grid" @submit.prevent="createManagedInvite">
            <label>Email (optional)<InputText v-model="inviteEmail" type="email" maxlength="256" /></label>
            <label>Expires after days<InputNumber v-model="inviteExpiresInDays" required :min="1" :max="30" /></label>
            <Button type="submit" class="outline-button" :loading="saving" label="Create invitation" />
          </form>
          <label v-if="createdInviteUrl">Invitation link (copy it now)<InputText :model-value="createdInviteUrl" readonly /></label>
          <p v-if="inviteManagementError" class="form-error" role="alert">{{ inviteManagementError }}</p>
          <div v-if="challengeInvitesQuery.isPending.value" class="challenge-placeholder">Loading invitations…</div>
          <p v-else-if="challengeInvitesQuery.isError.value" class="form-error" role="alert">Could not load invitations: {{ challengeInvitesQuery.error.value?.message }}</p>
          <div v-else-if="challengeInvitesQuery.data.value?.length" class="season-table-wrap">
            <table class="season-table"><thead><tr><th>RECIPIENT</th><th>STATUS</th><th>EXPIRES</th><th>ACTION</th></tr></thead><tbody><tr v-for="invitation in challengeInvitesQuery.data.value" :key="invitation.id"><td>{{ invitation.inviteeEmail ?? 'Invite link' }}</td><td>{{ invitation.status }}</td><td>{{ new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(invitation.expiresAt)) }}</td><td><button v-if="invitation.status === 'Pending'" class="link-button" :disabled="saving" @click="revokeInvite(invitation)">Revoke</button></td></tr></tbody></table>
          </div>
          <p v-else>No invitations have been created.</p>
        </div>
        <div v-if="rulesQuery.isPending.value" class="challenge-placeholder">Loading rule versions…</div>
        <p v-else-if="rulesQuery.isError.value" class="form-error" role="alert">Could not load challenge rules: {{ rulesQuery.error.value?.message }}</p>
        <template v-else-if="rulesQuery.data.value">
          <div class="rulebook-note"><Shield :size="16" /><p>Current version {{ rulesQuery.data.value.version }}. Enable an official achievement below to add it to this challenge. Rule changes are versioned and audited; preview their impact before applying them.</p></div>
          <div class="rulebook-note"><p><strong>Version history:</strong> <span v-for="(version, index) in rulesQuery.data.value.versions" :key="version.versionNumber">{{ index ? ' · ' : '' }}v{{ version.versionNumber }} from {{ seasonName(version.effectiveSeasonIndex) }}</span></p></div>
          <div v-if="rulesQuery.data.value.history.length" class="rulebook-note"><div><strong>Change history</strong><p v-for="(entry, index) in rulesQuery.data.value.history" :key="`${entry.createdAt}-${index}`">{{ new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt)) }} · {{ participants.find(item => item.userId === entry.actorId)?.displayName ?? 'Administrator' }} · {{ entry.code ?? 'Rule' }} · {{ entry.policy === 'Retroactive' ? 'Retroactive' : 'From season' }}{{ entry.reason ? ` · ${entry.reason}` : '' }}</p></div></div>
          <div class="rulebook-note"><div><strong>Continental competition catalog</strong><p>Map competitions to their continental tier. Linking a result distinguishes different competitions played in the same season; older unlinked claims remain conservative.</p>
            <p v-if="competitionsQuery.isPending.value">Loading competitions...</p>
            <p v-else-if="competitionsQuery.isError.value" class="form-error" role="alert">Could not load competitions. <button class="link-button" @click="() => competitionsQuery.refetch()">Try again</button></p>
            <p v-else-if="!competitionsQuery.data.value?.length">No competitions configured.</p>
            <div v-else v-for="competition in competitionsQuery.data.value" :key="competition.id">
              {{ competition.name }} · {{ competition.tier }}
              <button v-if="me?.role === 'Administrator' && !isRulesReadOnly" type="button" class="link-button" :disabled="saving" :aria-label="`Edit ${competition.name}`" @click="editCompetition(competition)">Edit</button>
              <button v-if="me?.role === 'Administrator' && !isRulesReadOnly" type="button" class="link-button" :disabled="saving" :aria-label="`Remove ${competition.name}`" @click="deleteCompetition(competition)">Remove</button>
            </div>
          </div></div>
          <form v-if="me?.role === 'Administrator' && !isRulesReadOnly && competitionsQuery.isSuccess.value" class="detail-form-grid" @submit.prevent="saveCompetition">
            <h3>{{ editingCompetition ? 'Edit competition' : 'Add a competition' }}</h3>
            <label>Competition name<InputText v-model="competitionForm.name" required maxlength="120" /></label>
            <label>Continental tier<select v-model="competitionForm.tier"><option value="Top">Top tier</option><option value="Second">Second tier</option><option value="Third">Third tier</option><option value="Other">Other continental competition</option></select></label>
            <p v-if="competitionError" class="form-error" role="alert">{{ competitionError }}</p>
            <div class="dialog-actions"><Button v-if="editingCompetition" type="button" class="cancel-button" label="Cancel" @click="editCompetition()" /><Button type="submit" class="outline-button" :loading="saving" :label="editingCompetition ? 'Save competition' : 'Add competition'" /></div>
          </form>
          <form v-if="me?.role === 'Administrator' && !isRulesReadOnly" class="detail-form-grid" @submit.prevent="createCustomAchievement">
            <h3>Add a custom achievement</h3>
            <p class="form-intro">Custom achievements belong only to this challenge and can be recorded by both managers.</p>
            <label>Name<InputText v-model="customAchievement.name" required maxlength="120" /></label>
            <label>Description<InputText v-model="customAchievement.description" required maxlength="500" /></label>
            <div class="form-row"><label>Frequency<select v-model="customAchievement.frequency"><option value="Once">Once</option><option value="Season">Once per season</option><option value="PerClub">Once per club</option><option value="PerCountry">Once per country</option><option value="ClubSeason">Once per club and season</option></select></label><label>Points<InputNumber v-model="customAchievement.points" required :min="0" :max="10000" /></label></div>
            <label>First applicable season index<InputNumber v-model="customAchievement.effectiveSeasonIndex" required :min="0" :max="100" /></label>
            <p v-if="customAchievementError" class="form-error" role="alert">{{ customAchievementError }}</p>
            <Button type="submit" class="outline-button" :loading="saving" label="Add custom achievement" />
          </form>
          <form v-if="me?.role === 'Administrator' && !isRulesReadOnly && seasonsQuery.isSuccess.value" class="detail-form-grid" @submit.prevent="previewRuleChange">
            <label>Scoring rule<select v-model="ruleCode" required @change="selectRule"><option value="" disabled>Choose a scoring rule</option><option v-for="rule in rulesQuery.data.value.rules" :key="rule.achievementCode" :value="rule.achievementCode">{{ ruleLabel(rule.achievementCode) }}{{ rule.isEnabled ? '' : ' (disabled)' }}</option></select></label>
            <template v-if="achievements.some(item => item.code === ruleCode)">
              <p class="form-intro">Display text is specific to this challenge; changing it does not change the achievement's scoring conditions.</p>
              <label>Achievement name<InputText v-model="ruleName" required maxlength="120" /></label>
              <label>Achievement description<InputText v-model="ruleDescription" required maxlength="500" /></label>
              <label>Achievement category<InputText v-model="ruleCategory" required maxlength="80" /></label>
              <label v-if="achievements.find(item => item.code === ruleCode)?.canChangeFrequency">Frequency<select v-model="ruleFrequency" required><option value="Once">Once</option><option value="Season">Once per season</option><option value="PerClub">Once per club</option><option value="PerCountry">Once per country</option><option value="ClubSeason">Once per club and season</option></select></label>
              <label v-if="achievements.find(item => item.code === ruleCode)?.canChangeCupMinimum">Minimum cup matches managed<InputNumber v-model="ruleCupMinimum" required :min="1" :max="1000" /></label>
              <p v-if="achievements.find(item => item.code === ruleCode)?.canChangeFrequency" class="form-intro">Earlier eligible records count toward the new frequency. Automatic milestones retain their fixed frequency.</p>
              <p class="form-intro">Unchanged details retain their value at each existing season boundary.</p>
              <label class="checkbox-label"><input v-model="applyDisplayedDetails" type="checkbox" /> Apply all displayed details across affected seasons, replacing scheduled values</label>
            </template>
            <div class="form-row"><label>Points<InputNumber v-model="rulePoints" required :min="0" :max="10000" /></label><label>Application<select v-model="rulePolicy"><option value="FromSeason">From a specific season</option><option value="Retroactive">Retroactively to all seasons</option></select></label></div>
            <label v-if="rulePolicy === 'FromSeason'">First applicable season index<InputNumber v-model="ruleEffectiveSeason" required :min="0" :max="100" /></label>
            <label class="checkbox-label"><input v-model="ruleEnabled" type="checkbox" /> Rule enabled</label>
            <label>Reason (optional)<InputText v-model="ruleReason" maxlength="1000" /></label>
            <p v-if="ruleError" class="form-error" role="alert">{{ ruleError }}</p>
            <Button type="submit" class="outline-button" :loading="saving" label="Preview impact" />
            <div v-if="rulePreview" class="rulebook-note"><div><strong>Preview: version {{ rulePreview.version }} from {{ seasonName(rulePreview.effectiveSeasonIndex) }}</strong><p v-for="impact in rulePreview.impact" :key="impact.participantId">{{ participants.find(item => item.id === impact.participantId)?.trainerName ?? 'Manager' }}: {{ impact.beforeConfirmed }} → {{ impact.afterConfirmed }} confirmed; {{ impact.beforePotential }} → {{ impact.afterPotential }} potential</p><p v-if="rulePreview.beforeWinner !== rulePreview.afterWinner">This change may alter the winning result.</p><Button type="button" class="primary-button" :loading="saving" label="Apply rule version" @click="applyRuleChange" /></div></div>
          </form>
        </template>
      </section>
    </template>
  </main>

  <Dialog v-model:visible="careerStartDialogVisible" modal header="Career start" :style="{ width: 'min(94vw, 520px)' }">
    <form class="detail-form-grid" @submit.prevent="saveCareerStart">
      <p class="form-intro">The challenge starts unemployed or at a club below the first division. A first-division job after starting unemployed is allowed. This is self-reported.</p>
      <label>Starting situation<select v-model="careerStartStatus"><option value="Unemployed">Unemployed</option><option value="Club">Club below the first division</option></select></label>
      <label v-if="careerStartStatus === 'Club'">Starting club<select v-model="careerStartStintId" required><option value="">Select a recorded club</option><option v-for="club in allClubs.filter(item => item.initialDivisionLevel > 1)" :key="club.id" :value="club.id">{{ careerClubLabel(club) }} · {{ seasonName(club.startSeasonIndex) }} · division {{ club.initialDivisionLevel }}</option></select></label>
      <p v-if="careerStartStatus === 'Club'">Add the starting club to your career first. If several clubs start in the same season, choose the actual starting club.</p>
      <p v-if="careerStartError" class="form-error" role="alert">{{ careerStartError }}</p>
      <div class="dialog-actions"><Button type="button" class="cancel-button" label="Cancel" @click="careerStartDialogVisible = false" /><Button type="submit" class="primary-button" :loading="saving" label="Save career start" /></div>
    </form>
  </Dialog>

  <Dialog v-model:visible="clubDialogVisible" modal :header="editingClub ? 'Edit club stint' : 'Add a club to your career'" :style="{ width: 'min(94vw, 520px)' }">
    <form class="detail-form-grid" @submit.prevent="submitClub">
      <p class="form-intro">Record matches for this stint only. Matches can be combined across stints for the same club; link distinct clubs with the same name and country to distinguish them. Complete detailed season records determine the milestone automatically. Otherwise, record the season in this stint when the club reached 20 matches; if it qualified earlier, use a season in this stint when it was already eligible. Without either, the milestone remains pending.</p>
      <label>Search club catalog<InputText v-model="clubCatalogSearch" maxlength="120" placeholder="Search by club name" /></label>
      <label v-if="clubCatalogQuery.isSuccess.value">Choose a catalog club
        <select :value="selectedCatalogClub?.id ?? ''" @change="selectCatalogClub">
          <option value="">Enter club details manually</option>
          <option v-if="selectedCatalogClub && !clubCatalogQuery.data.value?.some(club => club.id === selectedCatalogClub?.id)" :value="selectedCatalogClub.id">{{ selectedCatalogClub.name }}<template v-if="selectedCatalogClub.identityLabel"> · {{ selectedCatalogClub.identityLabel }}</template> · {{ selectedCatalogClub.countryName }}</option>
          <option v-for="club in clubCatalogQuery.data.value" :key="club.id" :value="club.id">{{ club.name }}<template v-if="club.identityLabel"> · {{ club.identityLabel }}</template> · {{ club.countryName }}</option>
        </select>
      </label>
      <p v-else-if="clubCatalogQuery.isPending.value" class="form-intro">Loading the club catalog...</p>
      <p v-else-if="clubCatalogQuery.isError.value" class="form-error" role="alert">Could not load the club catalog. Enter club details manually or try again.</p>
      <label>Club name<InputText v-model="clubName" required maxlength="120" placeholder="e.g. FC Porto" /></label>
      <label>Identity label (optional)<InputText v-model="clubIdentityLabel" maxlength="80" placeholder="e.g. Women or Reserves" /></label>
      <p class="form-intro">Use an identity label to add a distinct club with the same name and country. Existing text-only stints remain unlinked; select their intended identity before adding another same-name stint so their eligibility does not change unexpectedly.</p>
      <label v-if="geographyQuery.isSuccess.value">Choose a country from the catalog
        <select :value="geographyQuery.data.value?.countries.some(item => item.code === countryCode) ? countryCode : ''" @change="selectCatalogCountry">
          <option value="">Select a country</option>
          <option v-for="country in geographyQuery.data.value?.countries" :key="country.code" :value="country.code">{{ country.name }} ({{ country.code }})</option>
        </select>
      </label>
      <p v-else-if="geographyQuery.isError.value" class="form-error" role="alert">Could not load the country catalog. Enter the country and code manually.</p>
      <div class="form-row"><label>Country<InputText v-model="countryName" required maxlength="80" placeholder="Portugal" /></label><label>Country code<InputText v-model="countryCode" required maxlength="8" placeholder="PT" /></label></div>
      <Button type="button" class="outline-button" label="Add entered club to catalog" :loading="saving" @click="createCatalogClub" />
      <p v-if="selectedCatalogClub && catalogClubMatches" class="form-intro">Catalog club selected: {{ selectedCatalogClub.name }}<template v-if="selectedCatalogClub.identityLabel"> · {{ selectedCatalogClub.identityLabel }}</template> · {{ selectedCatalogClub.countryName }}.</p>
      <p v-else-if="selectedCatalogClub" class="form-intro">The edited name or country no longer matches the selected catalog club; saving will unlink it.</p>
      <p v-if="geographyQuery.data.value?.countries.find(item => item.code === countryCode)" class="form-intro">Continent: {{ geographyQuery.data.value.continents.find(item => item.code === geographyQuery.data.value?.countries.find(country => country.code === countryCode)?.continentCode)?.name }}</p>
      <div class="form-row"><label>Starting season index<InputNumber v-model="clubStartSeason" required :min="0" :max="100" /></label><label>Division level<InputNumber v-model="divisionLevel" required :min="1" :max="20" /></label></div>
      <label>Ending season index (optional)<InputNumber v-model="clubEndSeason" :min="clubStartSeason" :max="100" /></label>
      <label>Official matches managed<InputNumber v-model="clubMatches" required :min="0" /></label>
      <label>Season index when the club reached 20 matches (optional)<InputNumber v-model="clubEligibleSeason" :min="clubStartSeason" :max="clubEndSeason ?? 100" /></label>
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <div class="dialog-actions"><Button type="button" class="cancel-button" label="Cancel" @click="clubDialogVisible = false" /><Button type="submit" class="primary-button" :loading="saving" label="Save club" /></div>
    </form>
  </Dialog>

  <Dialog v-model:visible="nationalTeamDialogVisible" modal header="National team stint" :style="{ width: 'min(94vw, 520px)' }">
    <form class="detail-form-grid" @submit.prevent="submitNationalTeam">
      <label>National team<InputText v-model="nationalTeamForm.teamName" required maxlength="120" /></label>
      <label v-if="geographyQuery.isSuccess.value">Team country (optional)
        <select v-model="nationalTeamForm.countryCode"><option value="">Not specified</option><option v-for="country in geographyQuery.data.value?.countries" :key="country.code" :value="country.code">{{ country.name }} ({{ country.code }})</option></select>
      </label>
      <p v-else-if="geographyQuery.isError.value" class="form-error" role="alert">Could not load the country catalog. The existing country will be preserved.</p>
      <p class="form-intro">Set the team country for this stint to count towards the three-continent milestone.</p>
      <div class="form-row"><label>Starting season index<InputNumber v-model="nationalTeamForm.startSeasonIndex" required :min="0" :max="100" /></label><label>Ending season index (optional)<InputNumber v-model="nationalTeamForm.endSeasonIndex" :min="0" :max="100" /></label></div>
      <label>Official matches<InputNumber v-model="nationalTeamForm.officialMatches" required :min="0" :max="5000" /></label>
      <p class="form-intro">Optional season allocations: enter the official matches managed in each season. The allocations must add up to the stint total to calculate the 20-match milestone.</p>
      <div v-for="(row, index) in nationalSeasonMatches" :key="index" class="form-row">
        <label>Season index<InputNumber v-model="row.seasonIndex" required :min="0" :max="100" /></label>
        <label>Matches in season<InputNumber v-model="row.officialMatches" required :min="0" :max="5000" /></label>
        <button type="button" class="link-button" :aria-label="`Remove national team season allocation ${index + 1}`" @click="removeNationalSeasonMatches(index)">Remove</button>
      </div>
      <Button type="button" class="outline-button" label="Add season allocation" @click="addNationalSeasonMatches" />
      <label>Notes<InputText v-model="nationalTeamForm.notes" maxlength="1000" /></label>
      <p v-if="nationalTeamError" class="form-error" role="alert">{{ nationalTeamError }}</p>
      <div class="dialog-actions"><Button type="button" class="cancel-button" label="Cancel" @click="nationalTeamDialogVisible = false" /><Button type="submit" class="primary-button" :loading="saving" label="Save national team" /></div>
    </form>
  </Dialog>

  <Dialog v-model:visible="nationalMilestoneDialogVisible" modal header="National team match milestone" :style="{ width: 'min(94vw, 520px)' }">
    <form class="detail-form-grid" @submit.prevent="saveNationalMilestone">
      <p class="form-intro">Confirm the FM season in which you reached 20 official matches across your national teams. A stint with recorded matches must be active in that season. Leave it empty to clear the milestone season.</p>
      <label>20th match season index<InputNumber v-model="nationalMilestoneSeason" :min="0" :max="100" /></label>
      <p v-if="nationalMilestoneError" class="form-error" role="alert">{{ nationalMilestoneError }}</p>
      <div class="dialog-actions"><Button type="button" class="cancel-button" label="Cancel" @click="nationalMilestoneDialogVisible = false" /><Button type="submit" class="primary-button" :loading="saving" label="Save milestone" /></div>
    </form>
  </Dialog>

  <Dialog v-model:visible="transferDialogVisible" modal header="Transfer details" :style="{ width: 'min(94vw, 560px)' }">
    <form class="detail-form-grid" @submit.prevent="submitTransfer">
      <p class="form-intro">Record the season first. The transfer currency must match that season's currency; currencies are not converted automatically.</p>
      <label>FM season index<InputNumber v-model="transferForm.seasonIndex" required :min="0" :max="100" /></label>
      <div class="form-row"><label>Player<InputText v-model="transferForm.playerName" required maxlength="120" /></label><label>Managed club<InputText v-model="transferForm.clubName" required maxlength="120" /></label></div>
      <div class="form-row"><label>Other club<InputText v-model="transferForm.counterpartyName" required maxlength="120" /></label><label>Type<select v-model="transferForm.direction"><option value="Outgoing">Sale</option><option value="Incoming">Purchase</option></select></label></div>
      <div class="form-row"><label>Fixed fee<InputNumber v-model="transferForm.fixedAmount" required :min="0" :max-fraction-digits="2" /></label><label>Currency<InputText v-model="transferForm.currency" required maxlength="3" /></label></div>
      <label>Notes<InputText v-model="transferForm.notes" maxlength="1000" /></label>
      <p v-if="transferError" class="form-error" role="alert">{{ transferError }}</p>
      <div class="dialog-actions"><Button type="button" class="cancel-button" label="Cancel" @click="transferDialogVisible = false" /><Button type="submit" class="primary-button" :loading="saving" label="Save transfer" /></div>
    </form>
  </Dialog>

  <Dialog v-model:visible="clubMatchesDialogVisible" modal header="Update club matches" :style="{ width: 'min(94vw, 480px)' }">
    <form class="detail-form-grid" @submit.prevent="submitClubMatches">
      <p class="form-intro">{{ selectedClub?.clubName }}: enter matches in this stint only. Complete detailed season records determine the milestone automatically. Otherwise, record the season in this stint when the club reached 20 matches; if it qualified earlier, use a season in this stint when it was already eligible. Without either, the milestone remains pending.</p>
      <label>Official matches managed<InputNumber v-model="updatedClubMatches" required :min="0" :max="5000" /></label>
      <label>Season index when the club reached 20 matches (optional)<InputNumber v-model="updatedEligibleSeason" :min="selectedClub?.startSeasonIndex ?? 0" :max="selectedClub?.endSeasonIndex ?? 100" /></label>
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <div class="dialog-actions"><Button type="button" class="cancel-button" label="Cancel" @click="clubMatchesDialogVisible = false" /><Button type="submit" class="primary-button" :loading="saving" label="Save matches" /></div>
    </form>
  </Dialog>

  <Dialog v-model:visible="continentsMilestoneDialogVisible" modal header="Three continents milestone" :style="{ width: 'min(94vw, 480px)' }">
    <form class="detail-form-grid" @submit.prevent="saveContinentsMilestone">
      <p class="form-intro">Confirm the FM season when you first managed an official club or national team match in a third continent. Record the stints and their matches first. Match totals are per stint, so the exact season is your attestation. Leave empty to clear it.</p>
      <label>Third continent season index<InputNumber v-model="continentsMilestoneSeason" :min="0" :max="100" /></label>
      <p v-if="continentsMilestoneError" class="form-error" role="alert">{{ continentsMilestoneError }}</p>
      <div class="dialog-actions"><Button type="button" class="cancel-button" label="Cancel" @click="continentsMilestoneDialogVisible = false" /><Button type="submit" class="primary-button" :loading="saving" label="Save continent milestone" /></div>
    </form>
  </Dialog>

  <Dialog v-model:visible="countryMilestoneDialogVisible" modal header="Country match milestone" :style="{ width: 'min(94vw, 480px)' }">
    <form class="detail-form-grid" @submit.prevent="submitCountryMilestone">
      <p class="form-intro">Record the season when you reached 20 official matches across clubs in {{ selectedClub?.countryName }}, on the stint active for that match. Leave empty to clear this stint's country milestone. Complete detailed season records determine the country milestone automatically; otherwise an eligible club also makes its country eligible.</p>
      <label>Country 20th-match season index<InputNumber v-model="countryMilestoneSeason" :min="selectedClub?.startSeasonIndex ?? 0" :max="selectedClub?.endSeasonIndex ?? 100" /></label>
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <div class="dialog-actions"><Button type="button" class="cancel-button" label="Cancel" @click="countryMilestoneDialogVisible = false" /><Button type="submit" class="primary-button" :loading="saving" label="Save country milestone" /></div>
    </form>
  </Dialog>

  <Dialog v-model:visible="seasonDialogVisible" modal header="Update season" :style="{ width: 'min(94vw, 620px)' }">
    <form class="detail-form-grid" @submit.prevent="submitSeason">
      <p class="form-intro">Season {{ seasonName(selectedSeasonIndex) }} · Keep the two saves independent; only seasons completed by both unlock duels. Uncheck the completion option to reopen a season.</p>
      <label class="checkbox-label"><input v-model="useClubBreakdown" type="checkbox" /> Use per-club season statistics</label>
      <template v-if="!useClubBreakdown">
        <p v-if="hadSavedClubBreakdown" class="form-intro">Saved club statistics remain available if you switch back to the breakdown.</p>
        <label v-if="hadSavedClubBreakdown" class="checkbox-label"><input v-model="clearClubBreakdown" type="checkbox" /> Remove the saved club breakdown</label>
        <div class="form-row"><label>League matches<InputNumber v-model="leagueMatches" required :min="0" /></label><label>League points<InputNumber v-model="leaguePoints" required :min="0" /></label></div>
        <div class="form-row"><label>Wins<InputNumber v-model="leagueWins" required :min="0" /></label><label>Draws<InputNumber v-model="leagueDraws" required :min="0" /></label><label>Losses<InputNumber v-model="leagueLosses" required :min="0" /></label></div>
        <div class="form-row"><label>Goals for<InputNumber v-model="goalsFor" required :min="0" /></label><label>Goals against<InputNumber v-model="goalsAgainst" required :min="0" /></label><label>League position<InputNumber v-model="leaguePosition" :min="1" /></label></div>
      </template>
      <template v-else>
        <p class="form-intro">League totals are calculated from these club stints. Record each stint and its total official matches in Career first; allocated season matches cannot exceed that total.</p>
        <p v-if="careerQuery.isError.value" class="form-error" role="alert">Could not load club stints. <button type="button" class="link-button" @click="() => careerQuery.refetch()">Try again</button></p>
        <fieldset v-for="(row, index) in clubSeasonRows" :key="index">
          <legend>Club {{ index + 1 }}</legend>
          <label>Career stint<select v-model="row.careerStintId" required><option v-for="club in availableSeasonClubs" :key="club.id" :value="club.id">{{ careerClubLabel(club) }} · {{ club.countryCode }} · {{ seasonName(club.startSeasonIndex) }}</option></select></label>
          <div class="form-row"><label>Division level<InputNumber v-model="row.divisionLevel" required :min="1" :max="100" /></label><label>Official matches<InputNumber v-model="row.officialMatches" required :min="0" :max="5000" /></label><label>League matches<InputNumber v-model="row.leagueMatches" required :min="0" /></label></div>
          <div class="form-row"><label>Wins<InputNumber v-model="row.leagueWins" required :min="0" /></label><label>Draws<InputNumber v-model="row.leagueDraws" required :min="0" /></label><label>Losses<InputNumber v-model="row.leagueLosses" required :min="0" /></label></div>
          <div class="form-row"><label>League points<InputNumber v-model="row.leaguePoints" required :min="0" /></label><label>Goals for<InputNumber v-model="row.goalsFor" required :min="0" /></label><label>Goals against<InputNumber v-model="row.goalsAgainst" required :min="0" /></label><label>Final position<InputNumber v-model="row.leaguePosition" :min="1" :max="100" /></label></div>
          <button type="button" class="link-button" @click="clubSeasonRows.splice(index, 1)">Remove club</button>
        </fieldset>
        <Button type="button" class="outline-button" label="Add club statistics" :disabled="!careerQuery.isSuccess.value || clubSeasonRows.length >= availableSeasonClubs.length" @click="addClubSeason" />
      </template>
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
      <label v-if="careerQuery.isSuccess.value && careerQuery.data.value?.clubs.length">Career club (optional)
        <select :value="selectedClaimClub?.id ?? ''" @change="selectClaimCareerClub">
          <option value="">Enter club details manually</option>
          <option v-for="club in careerQuery.data.value.clubs" :key="club.id" :value="club.id">{{ careerClubLabel(club) }} · {{ club.countryCode }} · {{ seasonName(club.startSeasonIndex) }}</option>
        </select>
      </label>
      <p v-if="selectedClaimClub?.clubId && claimClubMatches" class="form-intro">This achievement is linked to a catalog club. Changing its name or country unlinks it.</p>
      <p v-else-if="selectedClaimClub?.clubId" class="form-intro">The edited name or country no longer matches the linked catalog club; saving will unlink it.</p>
      <label>{{ participationKind === 'continental-two-clubs' ? 'Second title club (required)' : participationKind === 'career-move' ? 'New club (required)' : ['first-major-trophy', 'third-to-first'].includes(participationKind ?? '') || ['PerClub', 'ClubSeason'].includes(claimFrequency) ? 'Club (required)' : 'Club, if applicable' }}<InputText v-model="claimClub" :required="['continental-two-clubs', 'career-move', 'first-major-trophy', 'third-to-first'].includes(participationKind ?? '') || ['PerClub', 'ClubSeason'].includes(claimFrequency)" maxlength="120" placeholder="Club name" /></label>
      <label>{{ ['double', 'continental-two-clubs', 'career-move', 'country-move'].includes(participationKind ?? '') || claimFrequency === 'PerCountry' ? 'Country code (required)' : 'Country code, if applicable' }}<InputText v-model="claimCountry" :required="['double', 'continental-two-clubs', 'career-move', 'country-move'].includes(participationKind ?? '') || claimFrequency === 'PerCountry'" maxlength="8" placeholder="e.g. PT" /></label>
      <p v-if="['PerClub', 'ClubSeason'].includes(claimFrequency)" class="form-intro">Provide the country code to distinguish clubs with the same name in different countries. Without it, the name may match a club in any country.</p>
      <template v-if="supportsCompetition">
        <p v-if="competitionsQuery.isPending.value" class="form-intro">Loading competitions...</p>
        <p v-else-if="competitionsQuery.isError.value" class="form-error" role="alert">Could not load competitions. <button type="button" class="link-button" @click="() => competitionsQuery.refetch()">Try again</button></p>
        <label v-else>Competition (optional)<select v-model="claimCompetitionId"><option value="">Not specified</option><option v-for="competition in applicableCompetitions" :key="competition.id" :value="competition.id">{{ competition.name }} · {{ competition.tier }}</option></select></label>
        <p v-if="competitionsQuery.isSuccess.value" class="form-intro">The challenge administrator can add competitions under Rules. Unspecified competition results use conservative same-season exclusions.</p>
      </template>
      <p v-if="legacyParticipation" class="form-intro">This older record has no achievement condition details. Enter them to save a correction.</p>
      <template v-if="needsInternationalResult">
        <p class="form-intro">Select the competition and result you achieved. These details are self-reported.</p>
        <label>Competition type<select v-model="participation.competitionResultKind" required>
          <option value="" disabled>Select a competition type</option>
          <option value="ClubContinentalTop">Top-tier continental club competition</option>
          <option value="ClubContinentalSecond">Second-tier continental club competition</option>
          <option value="ClubContinentalThird">Third-tier continental club competition</option>
          <option value="ClubWorld">Club world championship</option>
          <option value="NationalWorld">National team World Cup</option>
          <option value="NationalContinental">Continental national team championship</option>
        </select></label>
        <label>Final result<select v-model="participation.competitionResultStage" required>
          <option value="" disabled>Select a result</option>
          <option value="Winner">Winner</option>
          <option value="RunnerUp">Runner-up</option>
          <option value="QuarterFinalElimination">Eliminated in the quarter-final</option>
          <option value="SemiFinalElimination">Eliminated in the semi-final</option>
        </select></label>
      </template>
      <template v-if="needsLeagueMatches">
        <div class="form-row"><label>League matches you managed<InputNumber v-model="participation.managedCompetitionMatches" required :min="1" :max="1000" /></label><label>Total league matches<InputNumber v-model="participation.totalCompetitionMatches" required :min="1" :max="1000" /></label></div>
        <label v-if="participationKind !== 'survival'" class="checkbox-label"><input v-model="participation.inChargeAtCompetitionEnd" type="checkbox" required /> I was in charge at the end of the league competition.</label>
      </template>
      <template v-if="participationKind === 'cup' || participationKind === 'lower-cup'">
        <label>Cup matches you managed<InputNumber v-model="participation.managedCompetitionMatches" required :min="claimCupMinimum" :max="1000" /></label>
        <label class="checkbox-label"><input v-model="participation.managedDecidingMatch" type="checkbox" required /> I managed the cup final.</label>
      </template>
      <label v-else-if="participationKind === 'supercup'" class="checkbox-label"><input v-model="participation.managedDecidingMatch" type="checkbox" required /> I managed the winning super cup match.</label>
      <template v-if="participationKind === 'double'">
        <p class="form-intro">Both trophies must be from the country and FM season above.</p>
        <label class="checkbox-label"><input v-model="participation.wonFirstDivisionTitle" type="checkbox" required /> I won the first-division title.</label>
        <label class="checkbox-label"><input v-model="participation.wonMajorNationalCup" type="checkbox" required /> I won the major national cup in the same country and season.</label>
        <label>National cup matches you managed<InputNumber v-model="participation.domesticCupMatchesManaged" required :min="2" :max="1000" /></label>
        <label class="checkbox-label"><input v-model="participation.managedDecidingMatch" type="checkbox" required /> I managed the cup final.</label>
      </template>
      <label v-if="participationKind === 'unbeaten'" class="checkbox-label"><input v-model="participation.wonLeagueTitleUnbeaten" type="checkbox" required /> I won the league without a defeat.</label>
      <label v-if="participationKind === 'lower-cup'" class="checkbox-label"><input v-model="participation.cupWonInLowerDivision" type="checkbox" required /> I won the major national cup with a lower-division club.</label>
      <template v-if="participationKind === 'promotion'">
        <label>Division level reached<InputNumber v-model="participation.promotionDestinationLevel" required :min="1" :max="100" /></label>
        <label class="checkbox-label"><input v-model="participation.promotionWithoutTitle" type="checkbox" required /> The club was promoted without winning the corresponding league title.</label>
      </template>
      <template v-if="participationKind === 'promotion-streak'">
        <label>FM season index of the first promotion<InputNumber v-model="participation.promotionStreakStartSeason" required :min="0" :max="100" /></label>
        <p class="form-intro">The same club must have been promoted in each consecutive season through the milestone season above.</p>
      </template>
      <template v-if="['continental-first', 'continental-repeat', 'continental-top-first'].includes(participationKind ?? '')">
        <label class="checkbox-label"><input v-model="participation.reachedContinentalMainPhase" type="checkbox" required /> The club reached the competition's main group or league phase.</label>
        <label v-if="participationKind === 'continental-first'" class="checkbox-label"><input v-model="participation.continentalOrderConfirmed" type="checkbox" required /> This was the club's first continental main-phase participation.</label>
        <label v-else-if="participationKind === 'continental-repeat'" class="checkbox-label"><input v-model="participation.continentalOrderConfirmed" type="checkbox" required /> The club previously reached a continental main phase.</label>
        <label v-else class="checkbox-label"><input v-model="participation.firstTopTierMainPhase" type="checkbox" required /> This was the club's first main-phase participation in the top-tier continental competition.</label>
      </template>
      <template v-if="participationKind === 'continental-two-clubs'">
        <p class="form-intro">The season above is when you won the title with the second club.</p>
        <label v-if="careerQuery.isSuccess.value && careerQuery.data.value?.clubs.length">Select first title career club (optional)
          <select :value="selectedFirstTitleClub?.id ?? ''" @change="selectFirstTitleCareerClub">
            <option value="">Enter first title club details manually</option>
            <option v-for="club in careerQuery.data.value.clubs" :key="club.id" :value="club.id">{{ careerClubLabel(club) }} · {{ club.countryCode }} · {{ seasonName(club.startSeasonIndex) }}</option>
          </select>
        </label>
        <p v-if="selectedFirstTitleClub?.clubId && firstTitleClubMatches" class="form-intro">The first title club is linked to the club catalog. Changing its name or country unlinks it.</p>
        <p v-else-if="selectedFirstTitleClub?.clubId" class="form-intro">The edited first title club no longer matches the linked catalog club; saving will unlink it.</p>
        <label>First title club<InputText v-model="participation.firstContinentalTitleClub" required maxlength="120" /></label>
        <label>First title club country code<InputText v-model="participation.firstContinentalTitleCountry" required maxlength="8" /></label>
        <label>First title season index<InputNumber v-model="participation.firstContinentalTitleSeason" required :min="0" :max="100" /></label>
        <label class="checkbox-label"><input v-model="participation.wonContinentalTitlesWithBothClubs" type="checkbox" required /> I won a continental club trophy with each club.</label>
      </template>
      <template v-if="participationKind === 'career-move' || participationKind === 'country-move'">
        <p class="form-intro">{{ participationKind === 'career-move' ? 'First record both clubs in your career. The new club must have at least 20 matches across its stints;' : 'First record your starting club and stints in the new country. The country must have at least 20 matches across those stints;' }} use the season in which that milestone was reached. If multiple clubs begin in your earliest season, identify your actual starting club below.</p>
        <label v-if="careerQuery.isSuccess.value && careerQuery.data.value?.clubs.length">Select starting career club (optional)
          <select :value="selectedStartingClub?.id ?? ''" @change="selectStartingCareerClub">
            <option value="">Enter starting club details manually</option>
            <option v-for="club in careerQuery.data.value.clubs" :key="club.id" :value="club.id">{{ careerClubLabel(club) }} · {{ club.countryCode }} · {{ seasonName(club.startSeasonIndex) }}</option>
          </select>
        </label>
        <p v-if="selectedStartingClub?.clubId && startingClubMatches" class="form-intro">The starting club is linked to the club catalog. Changing its name or country unlinks it.</p>
        <p v-else-if="selectedStartingClub?.clubId" class="form-intro">The edited starting club no longer matches the linked catalog club; saving will unlink it.</p>
        <label>Starting club<InputText v-model="participation.startingCareerClub" required maxlength="120" /></label>
        <label>Starting club country code<InputText v-model="participation.startingCareerCountry" required maxlength="8" /></label>
      </template>
      <label v-if="participationKind === 'first-division-experience'" class="checkbox-label"><input v-model="participation.firstDivisionExperience" type="checkbox" required /> This was my first experience managing in the first division.</label>
      <template v-if="participationKind === 'first-major-trophy'">
        <p class="form-intro">An earlier attested major trophy for this identified club contradicts this claim. Records without a reliable club identity and ordering within a season cannot be verified.</p>
        <label class="checkbox-label"><input v-model="participation.firstMajorClubTrophy" type="checkbox" required /> This was my first major trophy with this club.</label>
        <label class="checkbox-label"><input v-model="participation.trophyNotSuperCup" type="checkbox" required /> The trophy was not a super cup.</label>
      </template>
      <label v-if="participationKind === 'ten-major-trophies'" class="checkbox-label"><input v-model="participation.wonTenMajorTrophies" type="checkbox" required /> I had won at least ten major trophies by this season.</label>
      <template v-if="participationKind === 'third-to-first'">
        <label>Season index managing this club in the third division<InputNumber v-model="participation.thirdDivisionStartSeason" required :min="0" :max="claimSeason" /></label>
        <label class="checkbox-label"><input v-model="participation.stayedWithClubFromThirdToFirst" type="checkbox" required /> I stayed with the same club from the third division until reaching the first.</label>
      </template>
      <label v-if="participationKind === 'manager-of-year'" class="checkbox-label"><input v-model="participation.officialManagerOfYear" type="checkbox" required /> I won the official Football Manager Manager of the Year award.</label>
      <template v-if="participationKind === 'higher-division-move'">
        <p class="form-intro">Lower division numbers represent higher levels. Enter your previous best and the division of the new club.</p>
        <label>Best division previously managed<InputNumber v-model="participation.previousBestDivisionLevel" required :min="2" :max="100" /></label>
        <label>New club division<InputNumber v-model="participation.newDivisionLevel" required :min="1" :max="99" /></label>
        <label class="checkbox-label"><input v-model="participation.higherDivisionClubMove" type="checkbox" required /> This was my first move to a club in a division higher than any I had previously managed.</label>
      </template>
      <label v-if="needsPromotion" class="checkbox-label"><input v-model="participation.firstSeasonAfterPromotion" type="checkbox" required /> This was the club's first season after promotion to the first division.</label>
      <label v-if="participationKind === 'survival'" class="checkbox-label"><input v-model="participation.avoidedRelegation" type="checkbox" required /> The club remained in the first division.</label>
      <label v-if="needsPosition">Final league position<InputNumber v-model="participation.competitionLeaguePosition" required :min="1" :max="1000" /></label>
      <label>Notes<InputText v-model="claimNotes" maxlength="1000" placeholder="Optional context" /></label>
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <div class="dialog-actions"><Button type="button" class="cancel-button" label="Cancel" @click="achievementDialogVisible = false" /><Button type="submit" class="primary-button" :loading="saving" :label="selectedClaim ? 'Save changes' : 'Record achievement'" /></div>
    </form>
  </Dialog>
</template>
