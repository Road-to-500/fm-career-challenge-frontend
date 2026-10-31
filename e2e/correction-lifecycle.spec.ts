import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function requestApi(page: Page, path: string, method: string, expectedStatus: number, body?: object) {
  const result = await page.evaluate(async ({ path, method, body }) => {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (method !== 'GET') {
      const response = await fetch('/api/auth/csrf')
      if (!response.ok) throw new Error(`Could not obtain a CSRF token: ${response.status}`)
      const token = await response.json() as { requestToken: string }
      headers['X-CSRF-TOKEN'] = token.requestToken
      headers['Content-Type'] = 'application/json'
    }
    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, text: await response.text() }
  }, { path, method, body })
  expect(result.status, `${method} ${path}: ${result.text}`).toBe(expectedStatus)
  return result.text
}

test('a pending victory can be reopened and corrected before the result is finalised', async ({ browser, page, request }, testInfo) => {
  const identitiesResponse = await request.post('/api/_e2e/identities')
  expect(identitiesResponse.ok()).toBeTruthy()
  const identities = await identitiesResponse.json() as { owner: string; rival: string }
  await page.context().addCookies([{ name: 'fmcc.e2e', value: identities.owner, url: 'http://127.0.0.1:5176' }])
  const rivalContext = await browser.newContext({ ...testInfo.project.use })
  await rivalContext.addCookies([{ name: 'fmcc.e2e', value: identities.rival, url: 'http://127.0.0.1:5176' }])
  const rival = await rivalContext.newPage()

  try {
    if (testInfo.project.name.endsWith('-light')) {
      await page.addInitScript(() => localStorage.setItem('fm-career-challenge-theme', 'light'))
      await rival.addInitScript(() => localStorage.setItem('fm-career-challenge-theme', 'light'))
    }

    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'Create challenge', exact: true }).click()
    const createDialog = page.getByRole('dialog', { name: 'Start a new challenge' })
    const challengeName = `Correction journey ${testInfo.project.name} ${Date.now()}`
    await createDialog.getByLabel('Challenge name').fill(challengeName)
    await createDialog.getByLabel('Starting season').fill('2025')
    await createDialog.getByRole('button', { name: 'Create challenge' }).click()
    await expect(page.getByRole('navigation', { name: 'Challenge sections' })).toBeVisible()
    const challengeId = new URL(page.url()).pathname.split('/').at(-1)!
    expect(challengeId).toMatch(/^[0-9a-f-]{36}$/i)
    const root = `/api/challenges/${challengeId}`

    await page.getByRole('button', { name: 'Invite your rival' }).click()
    const invitationLink = page.getByLabel('Invitation link', { exact: true })
    await expect(invitationLink).toBeVisible()
    const inviteToken = new URL(await invitationLink.inputValue()).searchParams.get('invite')
    expect(inviteToken).toBeTruthy()
    await rival.goto(`/dashboard?invite=${encodeURIComponent(inviteToken!)}`)
    await rival.getByRole('button', { name: 'Join challenge' }).click()
    await rival.locator('article').filter({ hasText: challengeName })
      .getByRole('button', { name: 'Open challenge' }).click()
    await expect(rival.getByRole('heading', { name: challengeName })).toBeVisible()
    await expect(page.getByText('2 of 2 managers')).toBeVisible()

    const ruleBook = JSON.parse(await requestApi(page, `${root}/rules`, 'GET', 200)) as {
      version: number; challengeVersion: number
    }
    await requestApi(page, `${root}/rules`, 'POST', 200, {
      code: 'G008', points: 500, isEnabled: true, policy: 'Retroactive', effectiveSeasonIndex: 0,
      expectedVersion: ruleBook.version, expectedChallengeVersion: ruleBook.challengeVersion,
      confirm: true, reason: 'Exercise the victory and correction journey',
    })
    for (const manager of [page, rival]) {
      await requestApi(manager, `${root}/career/start`, 'PUT', 200, {
        status: 'Unemployed', stintId: null, version: 0,
      })
    }
    for (let index = 1; index <= 3; index++) {
      await requestApi(page, `${root}/career/stints`, 'POST', 201, {
        clubName: `Correction Club ${index}`, countryCode: 'PT', countryName: 'Portugal',
        startSeasonIndex: 0, endSeasonIndex: 0, initialDivisionLevel: 2,
        officialMatches: 20, eligibleSeasonIndex: 0,
      })
    }
    await requestApi(page, `${root}/achievement-claims`, 'POST', 201, {
      code: 'G008', seasonIndex: 0, clubName: 'Correction Club 1', countryCode: 'PT',
      managedCompetitionMatches: 2, managedDecidingMatch: true,
    })
    const season = {
      leagueMatches: 1, leagueWins: 1, leagueDraws: 0, leagueLosses: 0, leaguePoints: 3,
      goalsFor: 2, goalsAgainst: 0, leaguePosition: 1, largestOutgoingTransfer: 0,
      currency: 'EUR', notes: '', isCompleted: true, version: null,
    }
    await requestApi(page, `${root}/seasons/0`, 'PUT', 200, season)
    const pending = JSON.parse(await requestApi(page, `${root}/scores`, 'GET', 200)) as {
      victoryPending: boolean; pendingVictorySeasonIndex: number | null
    }
    expect(pending.victoryPending).toBe(true)
    expect(pending.pendingVictorySeasonIndex).toBe(0)
    await expect(page.getByText('Victory is pending', { exact: false })).toBeVisible()

    await requestApi(rival, `${root}/seasons/0`, 'PUT', 200, {
      ...season, leagueWins: 0, leagueLosses: 1, leaguePoints: 0,
      goalsFor: 0, goalsAgainst: 2, leaguePosition: 2,
    })
    await expect(page.getByText('Challenge complete.', { exact: true })).toBeVisible()
    await expect(rival.getByText('Challenge complete.', { exact: true })).toBeVisible()
    await expect(rival.getByRole('button', { name: 'Reopen for corrections' })).toHaveCount(0)
    await requestApi(rival, `${root}/reopen`, 'POST', 403, { confirm: true })

    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Reopen for corrections' }).click()
    await expect(page.getByText('Correction mode.', { exact: true })).toBeVisible()
    await expect(rival.getByText('Correction mode.', { exact: true })).toBeVisible()
    await page.getByRole('navigation', { name: 'Challenge sections' })
      .getByRole('button', { name: 'Achievements' }).click()
    await page.getByLabel('Search achievements').fill('G008')
    const cup = page.locator('.achievement-card').filter({ hasText: 'G008' })
    await expect(cup).toContainText('1 recorded')
    page.once('dialog', dialog => dialog.accept())
    await cup.getByRole('button', { name: /^Remove / }).click()
    await expect(cup.getByRole('button', { name: /^Remove / })).toHaveCount(0)

    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Finish corrections' }).click()
    await expect(page.getByText('Correction mode.', { exact: true })).toHaveCount(0)
    await expect(page.locator('.hero-kicker')).toContainText('ACTIVE')
    await expect(rival.locator('.hero-kicker')).toContainText('ACTIVE')
    const dashboard = JSON.parse(await requestApi(page, `${root}/dashboard`, 'GET', 200)) as {
      challenge: { status: string; isCorrectionMode: boolean; winningParticipantId: string | null }
    }
    expect(dashboard.challenge.status).toBe('Active')
    expect(dashboard.challenge.isCorrectionMode).toBe(false)
    expect(dashboard.challenge.winningParticipantId).toBeNull()
    await expect.poll(async () => Number(await page.locator('.manager-score:not(.rival-score) .manager-points strong').textContent()))
      .toBeLessThan(500)
  } finally {
    await rivalContext.close()
  }
})
