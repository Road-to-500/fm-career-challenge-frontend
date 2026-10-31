import { ref } from 'vue'

export type Theme = 'dark' | 'light'

const storageKey = 'fm-career-challenge-theme'
export const theme = ref<Theme>('dark')
export const themeStorageError = ref('')

function applyTheme(value: Theme) {
  theme.value = value
  document.documentElement.classList.toggle('dark', value === 'dark')
  document.documentElement.style.colorScheme = value
}

export function initializeTheme() {
  try {
    const saved = window.localStorage.getItem(storageKey)
    applyTheme(saved === 'light' ? 'light' : 'dark')
    themeStorageError.value = ''
  } catch {
    applyTheme('dark')
    themeStorageError.value = 'Theme preference could not be loaded; dark theme is active for this session.'
  }
}

export function toggleTheme() {
  const next: Theme = theme.value === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  try {
    window.localStorage.setItem(storageKey, next)
    themeStorageError.value = ''
  } catch {
    themeStorageError.value = 'Theme preference could not be saved and may reset when you return.'
  }
}

export function syncTheme(event: StorageEvent) {
  if (event.storageArea && event.storageArea !== window.localStorage) return
  if (event.key === storageKey || event.key === null) {
    applyTheme(event.newValue === 'light' ? 'light' : 'dark')
    themeStorageError.value = ''
  }
}
