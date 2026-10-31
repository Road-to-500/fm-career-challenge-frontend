<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue'
import { theme, themeStorageError, toggleTheme } from '../lib/theme'
</script>

<template>
  <div class="theme-control">
    <button class="theme-toggle" type="button" @click="toggleTheme">
      <Sun v-if="theme === 'dark'" :size="16" aria-hidden="true" />
      <Moon v-else :size="16" aria-hidden="true" />
      <span>{{ theme === 'dark' ? 'Light theme' : 'Dark theme' }}</span>
    </button>
    <span v-if="themeStorageError" class="theme-error" role="status">{{ themeStorageError }}</span>
  </div>
</template>
