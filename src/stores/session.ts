import { defineStore } from 'pinia'

export type SessionProfile = {
  id: string
  displayName: string
  email: string
  avatarUrl?: string
  hasCompletedOnboarding: boolean
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    profile: null as SessionProfile | null,
  }),
  actions: {
    setProfile(profile: SessionProfile) {
      this.profile = profile
    },
    clearProfile() {
      this.profile = null
    },
  },
})
