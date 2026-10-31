import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTheme, syncTheme, theme } from '../lib/theme'
import ThemeToggle from './ThemeToggle.vue'

const key = 'fm-career-challenge-theme'

beforeEach(() => {
  window.localStorage.clear()
  initializeTheme()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
  initializeTheme()
})

describe('theme preference', () => {
  it('defaults to dark and persists the light choice on reload', async () => {
    const view = mount(ThemeToggle)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(view.get('button').text()).toBe('Light theme')
    await view.get('button').trigger('click')
    expect(window.localStorage.getItem(key)).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(view.get('button').text()).toBe('Dark theme')
    initializeTheme()
    expect(theme.value).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
    view.unmount()
  })

  it('synchronizes changes and clears from other tabs', () => {
    syncTheme(new StorageEvent('storage', { key, newValue: 'light', storageArea: window.localStorage }))
    expect(theme.value).toBe('light')
    syncTheme(new StorageEvent('storage', { key: null, storageArea: window.localStorage }))
    expect(theme.value).toBe('dark')
    syncTheme(new StorageEvent('storage', { key, newValue: 'light', storageArea: window.sessionStorage }))
    expect(theme.value).toBe('dark')
  })

  it('applies the chosen theme but reports a storage failure', async () => {
    const view = mount(ThemeToggle)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable') })
    await view.get('button').trigger('click')
    expect(theme.value).toBe('light')
    expect(view.get('[role="status"]').text()).toContain('could not be saved')
    view.unmount()
  })

  it('reports an unavailable stored preference and falls back to dark', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable') })
    initializeTheme()
    const view = mount(ThemeToggle)
    expect(theme.value).toBe('dark')
    expect(view.get('[role="status"]').text()).toContain('could not be loaded')
    view.unmount()
  })
})
