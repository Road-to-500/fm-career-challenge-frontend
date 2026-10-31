import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const skipAccessibility = process.env.FMCC_SKIP_ACCESSIBILITY === 'true'

async function checkAccessibility(page: Page) {
  if (skipAccessibility) return

  await page.evaluate(async () => {
    await Promise.all(document.getAnimations()
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => undefined)))
  })
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(results.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([])
}

test('persists offline invitation notifications and restricts challenge lifecycle actions', async ({ browser, page }, testInfo) => {
  const identitiesResponse = await page.request.post('/api/_e2e/identities')
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
    const challengeName = `Lifecycle ${testInfo.project.name} ${Date.now()}`
    await createDialog.getByLabel('Challenge name').fill(challengeName)
    await createDialog.getByLabel('Starting season').fill('2025')
    await createDialog.getByRole('button', { name: 'Create challenge' }).click()
    await expect(page.getByRole('heading', { name: challengeName })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Challenge sections' })).toBeVisible()
    const challengeId = new URL(page.url()).pathname.split('/').at(-1)!
    expect(challengeId).toMatch(/^[0-9a-f-]{36}$/i)

    await page.getByRole('button', { name: 'Invite your rival' }).click()
    const invitationLink = page.getByLabel('Invitation link', { exact: true })
    await expect(invitationLink).toBeVisible()
    const inviteToken = new URL(await invitationLink.inputValue()).searchParams.get('invite')
    expect(inviteToken).toBeTruthy()
    await page.close()

    await rival.goto(`/dashboard?invite=${encodeURIComponent(inviteToken!)}`)
    await rival.getByRole('button', { name: 'Join challenge' }).click()
    await expect(rival.getByText(challengeName)).toBeVisible()
    await rival.locator('article').filter({ hasText: challengeName })
      .getByRole('button', { name: 'Open challenge' }).click()
    await expect(rival.getByRole('heading', { name: challengeName })).toBeVisible()

    const owner = await page.context().newPage()
    await owner.goto('/dashboard')
    const unreadNotifications = owner.getByRole('button', { name: 'Notifications, 1 unread' })
    await expect(unreadNotifications).toBeVisible()
    await unreadNotifications.click()
    const acceptedNotification = owner.getByRole('article').filter({ hasText: 'Your invitation was accepted' })
    await expect(acceptedNotification).toBeVisible()
    await checkAccessibility(owner)
    await acceptedNotification.getByRole('button', { name: 'Mark as read' }).click()
    await expect(acceptedNotification.getByRole('button', { name: 'Mark as read' })).toHaveCount(0)
    await owner.reload()
    await owner.getByRole('button', { name: 'Notifications, 0 unread' }).click()
    await expect(owner.getByText('Your invitation was accepted')).toBeVisible()
    await expect(owner.getByRole('button', { name: 'Mark as read' })).toHaveCount(0)

    await owner.goto(`/challenges/${challengeId}`)
    await expect(owner.getByRole('heading', { name: challengeName })).toBeVisible()
    await expect(rival.getByRole('button', { name: 'Archive challenge', exact: true })).toHaveCount(0)
    const forbiddenArchiveStatus = await rival.evaluate(async id => {
      const { requestToken } = await fetch('/api/auth/csrf').then(response => response.json()) as { requestToken: string }
      return (await fetch(`/api/challenges/${id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': requestToken },
        body: JSON.stringify({ confirm: true }),
      })).status
    }, challengeId)
    expect(forbiddenArchiveStatus).toBe(403)

    owner.once('dialog', dialog => dialog.accept())
    await owner.getByRole('button', { name: 'Archive challenge', exact: true }).click()
    await expect(owner.locator('.hero-kicker')).toContainText('ARCHIVED')
    await expect(rival.locator('.hero-kicker')).toContainText('ARCHIVED')
    await expect(owner.getByText('READ ONLY')).toBeVisible()
    await checkAccessibility(owner)
    owner.once('dialog', dialog => dialog.accept())
    await owner.getByRole('button', { name: 'Restore challenge', exact: true }).click()
    await expect(owner.locator('.hero-kicker')).toContainText('ACTIVE')
    await expect(rival.locator('.hero-kicker')).toContainText('ACTIVE')
  } finally {
    await rivalContext.close()
  }
})
