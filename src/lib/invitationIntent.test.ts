import { afterEach, describe, expect, it, vi } from 'vitest'
import { rememberInvitation, takeInvitation } from './invitationIntent'

afterEach(() => {
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
  vi.restoreAllMocks()
})

describe('invitation intent across Google sign-in', () => {
  it('restores the invitation once after the provider returns without a query', () => {
    window.history.replaceState({}, '', '/dashboard?invite=waiting-rival')
    rememberInvitation()
    window.history.replaceState({}, '', '/dashboard')
    expect(takeInvitation()).toBe('waiting-rival')
    expect(takeInvitation()).toBeNull()
  })

  it('does not restore stale or malformed invitations', () => {
    sessionStorage.setItem('fmcc.pending-invitation', JSON.stringify({ token: 'old', createdAt: Date.now() - 3_600_000 }))
    expect(takeInvitation()).toBeNull()
    sessionStorage.setItem('fmcc.pending-invitation', '{invalid')
    expect(takeInvitation()).toBeNull()
  })

  it('keeps sign-in available when browser storage is disabled', () => {
    window.history.replaceState({}, '', '/dashboard?invite=waiting-rival')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Disabled') })
    expect(rememberInvitation).not.toThrow()
  })
})
