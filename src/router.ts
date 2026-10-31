import { createRouter, createWebHistory } from 'vue-router'
const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (to, _from, savedPosition) => {
    if (savedPosition) return savedPosition
    if (['#active-challenges', '#invitations', '#about'].includes(to.hash)) return { top: 0 }
    return to.hash ? { el: to.hash, behavior: 'smooth' } : { top: 0 }
  },
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', component: () => import('./views/DashboardView.vue') },
    { path: '/challenges/:id', component: () => import('./views/ChallengeView.vue') },
    { path: '/:pathMatch(.*)*', component: () => import('./views/NotFoundView.vue') },
  ],
})

export default router
