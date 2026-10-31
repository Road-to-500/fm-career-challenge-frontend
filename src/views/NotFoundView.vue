<script setup lang="ts">
import { RouterLink } from 'vue-router'
import ThemeToggle from '../components/ThemeToggle.vue'
</script>

<template>
  <main class="recovery-page">
    <ThemeToggle />
    <h1>Page not found</h1>
    <p>This link does not match a page. Check the address, or return home to find your challenges and public guide.</p>
    <RouterLink class="primary-button" to="/dashboard">Return home</RouterLink>
  </main>
</template>
