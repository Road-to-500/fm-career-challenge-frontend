import { createI18n } from 'vue-i18n'

export default createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    en: {
      dashboard: {
        loading: 'Connecting to your career hub…',
        title: 'Build a career worth remembering.',
      },
      challenge: {
        loading: 'Loading challenge…',
        unavailable: 'Challenge unavailable',
      },
    },
  },
})
