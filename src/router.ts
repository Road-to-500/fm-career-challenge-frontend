import { createRouter, createWebHistory } from 'vue-router'
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', component: () => import('./views/DashboardView.vue') },
    { path: '/challenges/:id', component: () => import('./views/ChallengeView.vue') },
  ],
})

export default router
