const storageKey = 'fmcc.pending-invitation'
const maxAge = 60 * 60 * 1000

export function rememberInvitation(): void {
  const token = new URL(window.location.href).searchParams.get('invite')
  if (!token) return
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ token, createdAt: Date.now() }))
  } catch {
    // Browser storage may be disabled; sign-in must still be available.
  }
}

export function takeInvitation(): string | null {
  try {
    const value = sessionStorage.getItem(storageKey)
    sessionStorage.removeItem(storageKey)
    if (!value) return null
    const pending = JSON.parse(value) as { token?: unknown; createdAt?: unknown }
    return typeof pending.token === 'string' && typeof pending.createdAt === 'number'
      && Date.now() - pending.createdAt >= 0 && Date.now() - pending.createdAt < maxAge
      ? pending.token : null
  } catch {
    return null
  }
}
