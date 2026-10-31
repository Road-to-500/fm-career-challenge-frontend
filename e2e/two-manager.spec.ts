import { expect, test } from '@playwright/test'
import type { Page, WebSocketRoute } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const skipAccessibility = process.env.FMCC_SKIP_ACCESSIBILITY === 'true'

async function checkAccessibility(page: Page) {
  if (skipAccessibility) return

  await page.evaluate(async () => {
    await Promise.all(document.getAnimations()
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => undefined)))
  })
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, details: node.failureSummary })) }))).toEqual([])
}

async function completeSeason(page: Page, points: number, goals: number) {
  await page.getByRole('button', { name: 'Seasons', exact: true }).click()
  await page.getByRole('button', { name: 'Update season', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Update season' })
  await checkAccessibility(page)
  await dialog.getByLabel('Use per-club season statistics').uncheck()
  await dialog.getByLabel('League matches', { exact: true }).fill('15')
  await dialog.getByLabel('League points', { exact: true }).fill(String(points))
  await dialog.getByLabel('Wins', { exact: true }).fill(points === 11 ? '3' : '2')
  await dialog.getByLabel('Draws', { exact: true }).fill('2')
  await dialog.getByLabel('Losses', { exact: true }).fill(points === 11 ? '10' : '11')
  await dialog.getByLabel('Goals for', { exact: true }).fill(String(goals))
  await dialog.getByLabel('Goals against', { exact: true }).fill('10')
  await dialog.getByLabel('Mark this FM season complete').check()
  await dialog.getByRole('button', { name: 'Save season' }).click()
  await expect(dialog).toBeHidden()
}

test('two managers join a challenge and synchronize an automatic milestone', async ({ browser, page, request }, testInfo) => {
  const identitiesResponse = await request.post('/api/_e2e/identities')
  expect(identitiesResponse.ok()).toBeTruthy()
  const identities = await identitiesResponse.json() as { owner: string; rival: string }
  await page.context().addCookies([{ name: 'fmcc.e2e', value: identities.owner, url: 'http://127.0.0.1:5176' }])
  const rivalContext = await browser.newContext({ ...testInfo.project.use })
  await rivalContext.addCookies([{ name: 'fmcc.e2e', value: identities.rival, url: 'http://127.0.0.1:5176' }])
  const rival = await rivalContext.newPage()
  let blockSignalRReconnects = false
  let rivalSignalRSocket: WebSocketRoute | undefined
  await rival.routeWebSocket('**/hubs/challenges*', async socket => {
    if (blockSignalRReconnects) {
      socket.close()
      return
    }
    rivalSignalRSocket = await socket.connectToServer()
  })

  try {
    if (!skipAccessibility && testInfo.project.name === 'mobile-light') {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await rival.emulateMedia({ reducedMotion: 'reduce' })
    }
    if (testInfo.project.name.endsWith('-light')) {
      await page.addInitScript(() => localStorage.setItem('fm-career-challenge-theme', 'light'))
      await rival.addInitScript(() => localStorage.setItem('fm-career-challenge-theme', 'light'))
    }
    await page.goto('/dashboard')
    await expect(page.getByRole('button', { name: 'Create challenge', exact: true })).toBeVisible()
    if (!skipAccessibility && testInfo.project.name === 'mobile-light') {
      await expect(page.getByRole('button', { name: 'Create challenge', exact: true })).toHaveCSS('transition-duration', '1e-05s')
    }
    if (!skipAccessibility) {
      await page.keyboard.press('Tab')
      await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.locator('#dashboard-content')).toBeFocused()
    }
    await checkAccessibility(page)
    await page.getByRole('button', { name: 'Create challenge', exact: true }).click()
    const createDialog = page.getByRole('dialog', { name: 'Start a new challenge' })
    await expect(createDialog).toBeVisible()
    if (!skipAccessibility) {
      await page.keyboard.press('Escape')
      await expect(createDialog).toBeHidden()
      await expect(page.getByRole('button', { name: 'Create challenge', exact: true })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(createDialog).toBeVisible()
    }
    await checkAccessibility(page)
    const challengeName = `Browser journey ${testInfo.project.name} ${Date.now()}`
    await createDialog.getByLabel('Challenge name').fill(challengeName)
    await createDialog.getByLabel('Starting season').fill('2025')
    await createDialog.getByRole('button', { name: 'Create challenge' }).click()
    await expect(page.getByRole('heading', { name: challengeName })).toBeVisible()
    await expect(createDialog).toBeHidden()
    await checkAccessibility(page)
    await expect(page.getByRole('navigation', { name: 'Challenge sections' }).getByRole('button', { name: /^Achievements/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Seasons', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Update season', exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Invite your rival' }).click()
    const invitationLink = page.getByLabel('Invitation link', { exact: true })
    await expect(invitationLink).toBeVisible()
    await checkAccessibility(page)
    const token = new URL(await invitationLink.inputValue()).searchParams.get('invite')
    expect(token).toBeTruthy()

    await rival.goto(`/dashboard?invite=${encodeURIComponent(token!)}`)
    await rival.getByRole('button', { name: 'Join challenge' }).click()
    await expect(rival.getByRole('status').filter({ hasText: 'Invitation accepted.' })).toBeVisible()
    await rival.getByRole('button', { name: 'Open joined challenge' }).click()
    await expect(rival.getByRole('heading', { name: challengeName })).toBeVisible()
    await expect(page.locator('.challenge-topbar .connection-indicator')).toHaveText('Live updates on')
    await expect(rival.locator('.challenge-topbar .connection-indicator')).toHaveText('Live updates on')
    await expect(page.getByText('2 of 2 managers')).toBeVisible()

    await page.locator('summary').filter({ hasText: 'More ·' }).click()
    await page.getByRole('button', { name: 'Rules', exact: true }).click()
    await page.locator('summary').filter({ hasText: 'Scoring rules ·' }).click()
    const ruleForm = page.getByLabel('Scoring rule').locator('xpath=ancestor::form')
    await ruleForm.getByLabel('Scoring rule').selectOption('G008')
    await ruleForm.getByRole('combobox', { name: 'Frequency', exact: true }).selectOption('PerClub')
    await ruleForm.getByLabel('Minimum cup matches managed').fill('3')
    await checkAccessibility(page)
    await ruleForm.getByRole('button', { name: 'Preview impact' }).click()
    await expect(ruleForm.getByText(/Preview: version/)).toBeVisible()
    blockSignalRReconnects = true
    rivalSignalRSocket?.close()
    await expect(rival.locator('.challenge-topbar .connection-indicator')).toHaveText('Reconnecting')
    page.once('dialog', dialog => dialog.accept())
    await ruleForm.getByRole('button', { name: 'Apply rule version' }).click()
    await expect(ruleForm.getByText(/Preview: version/)).toBeHidden()
    blockSignalRReconnects = false
    await expect(rival.locator('.challenge-topbar .connection-indicator')).toHaveText('Live updates on', { timeout: 30_000 })
    await rival.getByRole('navigation', { name: 'Challenge sections' }).getByRole('button', { name: 'Career', exact: true }).click()
    await rival.getByRole('button', { name: 'Set career start' }).click()
    const rivalStart = rival.getByRole('dialog', { name: 'Career start' })
    await rivalStart.getByRole('button', { name: 'Save career start' }).click()
    await expect(rivalStart).toBeHidden()
    await rival.getByRole('navigation', { name: 'Challenge sections' }).getByRole('button', { name: 'Achievements' }).click()
    await rival.getByLabel('Search achievements').fill('G008')
    await expect(rival.locator('.achievement-card')).toContainText('per club')

    await page.getByRole('navigation', { name: 'Challenge sections' }).getByRole('button', { name: 'Career', exact: true }).click()
    await expect(page.getByRole('navigation', { name: 'Challenge sections' }).getByRole('button', { name: 'Career', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Set career start' }).click()
    const startDialog = page.getByRole('dialog', { name: 'Career start' })
    await checkAccessibility(page)
    await startDialog.getByLabel('Starting situation').selectOption('Unemployed')
    await startDialog.getByRole('button', { name: 'Save career start' }).click()
    await expect(startDialog).toBeHidden()
    await expect(page.getByText('Started unemployed.')).toBeVisible()
    await page.getByRole('navigation', { name: 'Challenge sections' }).getByRole('button', { name: 'Achievements' }).click()
    await expect(page.getByLabel('Search achievements')).toBeVisible()
    await checkAccessibility(page)
    await page.getByLabel('Search achievements').fill('G038')
    await expect(page.locator('.achievement-card')).toHaveCount(1)
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await page.getByRole('navigation', { name: 'Challenge sections' }).getByRole('button', { name: 'Career', exact: true }).click()

    const clubName = `Browser Club ${testInfo.project.name} ${Date.now()}`
    const careerUrl = `/api/challenges/${new URL(page.url()).pathname.split('/').at(-1)}/career`
    await page.getByRole('button', { name: 'Add a club', exact: true }).click()
    let clubDialog = page.getByRole('dialog', { name: 'Add a club to your career' })
    await checkAccessibility(page)
    await clubDialog.getByLabel('Club name', { exact: true }).fill(clubName)
    await clubDialog.getByLabel('Choose a country from the catalog').selectOption('PT')
    await clubDialog.getByLabel('Official matches managed').fill('12')
    await clubDialog.getByRole('button', { name: 'Save club' }).click()
    await expect(clubDialog).toBeHidden()

    await page.getByRole('button', { name: 'Add a club', exact: true }).click()
    clubDialog = page.getByRole('dialog', { name: 'Add a club to your career' })
    await clubDialog.getByLabel('Club name', { exact: true }).fill(clubName)
    await clubDialog.getByLabel('Choose a country from the catalog').selectOption('PT')
    await clubDialog.getByRole('button', { name: 'Add entered club to catalog' }).click()
    await expect(clubDialog.getByText(`Catalog club selected: ${clubName} · Portugal.`)).toBeVisible()
    await clubDialog.getByLabel('Official matches managed').fill('8')
    await clubDialog.getByLabel('Season the club reached 20 matches (optional)').selectOption('0')
    await clubDialog.getByRole('button', { name: 'Save club' }).click()
    await expect(clubDialog).toBeHidden()

    const readCareer = async () => {
      const response = await page.request.get(careerUrl)
      expect(response.ok()).toBeTruthy()
      return await response.json() as { clubs: Array<{
        id: string; clubId: string | null; clubName: string; identityLabel: string
        officialMatches: number; clubOfficialMatches: number; clubEligibleSeasonIndex: number | null
      }> }
    }
    const beforeDuplicate = (await readCareer()).clubs.filter(club => club.clubName === clubName)
    expect(beforeDuplicate).toHaveLength(2)
    expect(beforeDuplicate.every(club => club.clubOfficialMatches === 20 && club.clubEligibleSeasonIndex === 0)).toBeTruthy()
    expect(beforeDuplicate.filter(club => club.clubId === null)).toHaveLength(1)

    await page.getByRole('button', { name: 'Add a club', exact: true }).click()
    clubDialog = page.getByRole('dialog', { name: 'Add a club to your career' })
    await clubDialog.getByLabel('Club name', { exact: true }).fill(clubName)
    await clubDialog.getByLabel('Identity label (optional)').fill('Reserves')
    await clubDialog.getByLabel('Choose a country from the catalog').selectOption('PT')
    await clubDialog.getByRole('button', { name: 'Add entered club to catalog' }).click()
    await expect(clubDialog.getByText(`Catalog club selected: ${clubName} · Reserves · Portugal.`)).toBeVisible()
    await checkAccessibility(page)
    await clubDialog.getByRole('button', { name: 'Cancel' }).click()
    const afterDuplicate = (await readCareer()).clubs.filter(club => club.clubName === clubName)
    expect(afterDuplicate).toEqual(beforeDuplicate)
    await expect(page.locator('.manager-score:not(.rival-score) .manager-points strong')).toHaveText('0')

    await page.getByRole('button', { name: 'Add a club', exact: true }).click()
    clubDialog = page.getByRole('dialog', { name: 'Add a club to your career' })
    await clubDialog.getByLabel('Search club catalog').fill(clubName)
    await clubDialog.getByLabel('Choose a catalog club').selectOption({ label: `${clubName} · Reserves · Portugal` })
    await clubDialog.getByLabel('Official matches managed').fill('0')
    await clubDialog.getByRole('button', { name: 'Save club' }).click()
    await expect(clubDialog.locator('.form-error')).toContainText('Link existing text-only stints')
    await clubDialog.getByRole('button', { name: 'Cancel' }).click()
    expect((await readCareer()).clubs.filter(club => club.clubName === clubName)).toEqual(beforeDuplicate)

    await page.locator('.timeline-club-card').filter({ hasText: '12 matches in this stint' })
      .getByRole('button', { name: `Edit ${clubName}`, exact: true }).click()
    const editClubDialog = page.getByRole('dialog', { name: 'Edit club stint' })
    await editClubDialog.getByLabel('Search club catalog').fill(clubName)
    await expect(editClubDialog.getByLabel('Choose a catalog club')).toContainText(`${clubName} · Portugal`)
    await editClubDialog.getByLabel('Choose a catalog club').selectOption({ label: `${clubName} · Portugal` })
    await editClubDialog.getByRole('button', { name: 'Save club' }).click()
    await expect(editClubDialog).toBeHidden()

    await page.getByRole('button', { name: 'Add a club', exact: true }).click()
    clubDialog = page.getByRole('dialog', { name: 'Add a club to your career' })
    await clubDialog.getByLabel('Search club catalog').fill(clubName)
    await expect(clubDialog.getByLabel('Choose a catalog club')).toContainText(`${clubName} · Reserves · Portugal`)
    await clubDialog.getByLabel('Choose a catalog club').selectOption({ label: `${clubName} · Reserves · Portugal` })
    await clubDialog.getByRole('button', { name: 'Save club' }).click()
    await expect(clubDialog).toBeHidden()
    await expect(page.getByRole('button', { name: `Edit ${clubName} · Reserves` })).toBeVisible()
    const linkedClubs = (await readCareer()).clubs.filter(club => club.clubName === clubName)
    expect(linkedClubs).toHaveLength(3)
    expect(linkedClubs.every(club => club.clubId !== null)).toBeTruthy()
    expect(linkedClubs.filter(club => club.identityLabel !== 'Reserves')
      .every(club => club.clubOfficialMatches === 20)).toBeTruthy()

    await page.locator('summary').filter({ hasText: 'International career and optional milestone evidence' }).click()
    await page.getByRole('button', { name: 'Add national team' }).click()
    const teamDialog = page.getByRole('dialog', { name: 'National team stint' })
    await checkAccessibility(page)
    await teamDialog.getByLabel('National team', { exact: true }).fill('Portugal')
    await teamDialog.getByLabel('Team country (optional)').selectOption('PT')
    await teamDialog.getByLabel('Official matches', { exact: true }).fill('20')
    await teamDialog.getByRole('button', { name: 'Add season allocation' }).click()
    await teamDialog.getByLabel('Matches in season').fill('20')
    await teamDialog.getByRole('button', { name: 'Save national team' }).click()
    await expect(teamDialog).toBeHidden()
    await expect(page.getByText('20 national team matches: 2025/26.', { exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Portugal', exact: true })).toBeVisible()
    await page.locator('summary').filter({ hasText: 'International career and optional milestone evidence' }).click()
    await expect(page.getByRole('cell', { name: 'Portugal', exact: true })).toBeHidden()
    await expect(page.getByText('20 national team matches: 2025/26.', { exact: true })).toBeVisible()
    await page.locator('summary').filter({ hasText: 'International career and optional milestone evidence' }).click()
    await expect(page.getByRole('cell', { name: 'Portugal', exact: true })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'Career', exact: true }).click()
    await page.locator('summary').filter({ hasText: 'International career and optional milestone evidence' }).click()
    await expect(page.getByText('20 national team matches: 2025/26.', { exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Portugal', exact: true })).toBeVisible()
    await expect(page.locator('.manager-score:not(.rival-score) .manager-points strong')).toHaveText('8')
    await expect(rival.locator('.rival-score .manager-points strong')).toHaveText('8')

    await page.getByRole('button', { name: 'Seasons', exact: true }).click()
    await page.getByRole('button', { name: 'Update season', exact: true }).click()
    const detailedSeason = page.getByRole('dialog', { name: 'Update season' })
    await detailedSeason.getByLabel('Use per-club season statistics').check()
    await detailedSeason.getByRole('button', { name: 'Add club statistics' }).click()
    const allocatedStint = (await readCareer()).clubs.find(club => club.officialMatches === 12)!
    await detailedSeason.getByLabel('Career stint', { exact: true }).selectOption(allocatedStint.id)
    await detailedSeason.getByLabel('Official matches', { exact: true }).fill('12')
    await detailedSeason.getByLabel('League matches', { exact: true }).fill('10')
    await detailedSeason.getByLabel('Wins', { exact: true }).fill('3')
    await detailedSeason.getByLabel('Draws', { exact: true }).fill('2')
    await detailedSeason.getByLabel('Losses', { exact: true }).fill('5')
    await detailedSeason.getByLabel('League points', { exact: true }).fill('11')
    await detailedSeason.getByLabel('Goals for', { exact: true }).fill('20')
    await detailedSeason.getByLabel('Goals against', { exact: true }).fill('10')
    await detailedSeason.getByLabel('Use per-club season statistics').uncheck()
    await detailedSeason.getByLabel('Use per-club season statistics').check()
    await expect(detailedSeason.getByLabel('Official matches', { exact: true })).toHaveValue('12')
    page.once('dialog', dialog => dialog.accept())
    await detailedSeason.getByRole('button', { name: 'Save season' }).click()
    await expect(detailedSeason).toBeHidden()
    await page.reload()
    await page.getByRole('button', { name: 'Seasons', exact: true }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
    await page.getByRole('button', { name: 'Edit 2025/26', exact: true }).click()
    await expect(detailedSeason.getByLabel('Use per-club season statistics')).toBeChecked()
    await expect(detailedSeason.getByLabel('Official matches', { exact: true })).toHaveValue('12')
    expect(await detailedSeason.evaluate(dialog => {
      const bounds = dialog.getBoundingClientRect()
      return bounds.left >= 0 && bounds.right <= window.innerWidth
    })).toBe(true)
    await detailedSeason.getByRole('button', { name: 'Cancel', exact: true }).click()

    await completeSeason(page, 11, 20)
    const savedSeasonsResponse = await page.request.get(careerUrl.replace(/career$/, 'seasons'))
    expect(savedSeasonsResponse.ok()).toBeTruthy()
    const savedSeasons = await savedSeasonsResponse.json() as Array<{ seasonIndex: number; usesClubBreakdown: boolean; clubSeasons: Array<{ officialMatches: number }> }>
    expect(savedSeasons.find(season => season.seasonIndex === 0)).toMatchObject({
      usesClubBreakdown: false, clubSeasons: [{ officialMatches: 12 }],
    })
    await page.getByRole('button', { name: 'View transfers', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Deals on the record.' })).toBeVisible()
    await page.getByRole('button', { name: 'Record transfer', exact: true }).click()
    const transfer = page.getByRole('dialog', { name: 'Transfer details' })
    await expect(transfer.getByLabel('FM season', { exact: true })).toContainText('2025/26 — Season 1')
    await expect(transfer.getByText('Enter the guaranteed transfer fee; add-ons are not included.')).toBeVisible()
    await transfer.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(rival.locator('.rival-score .manager-points strong')).toHaveText('8')
    await completeSeason(rival, 8, 10)
    await expect(page.locator('.manager-score:not(.rival-score) .manager-points strong')).toHaveText('15')
    await expect(rival.locator('.rival-score .manager-points strong')).toHaveText('15')
  } finally {
    await rivalContext.close()
  }
})
