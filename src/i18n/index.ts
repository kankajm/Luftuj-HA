import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { notifications } from '@mantine/notifications'

import enCommon from './locales/en/common.json'
import csCommon from './locales/cs/common.json'
import { logger } from '../utils/logger'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
  }
}

const resources = {
  en: {
    common: enCommon,
  },
  cs: {
    common: csCommon,
  },
} as const

export type SupportedLanguage = keyof typeof resources

export const isSupportedLanguage = (language: string): language is SupportedLanguage =>
  Object.prototype.hasOwnProperty.call(resources, language)

export const i18nReady = i18n
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
  })
  .catch((error) => {
    logger.error('Failed to initialise i18n', { error })
    if (typeof window !== 'undefined') {
      notifications.show({
        title: i18n.t('errors.i18n.title'),
        message: i18n.t('errors.i18n.message'),
        color: 'red',
      })
    }
  })

export const setLanguage = async (language: string) => {
  const target = isSupportedLanguage(language) ? language : 'en'
  await i18n.changeLanguage(target)
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('luftujha-language', target)
    }
  } catch {
    // ignore storage errors
  }
}

export const getInitialLanguage = () => {
  if (typeof window === 'undefined') {
    return 'en'
  }
  const stored = window.localStorage.getItem('luftujha-language')
  if (stored && isSupportedLanguage(stored)) {
    return stored
  }
  const browser = (navigator.language ?? 'en').split('-')[0]
  return isSupportedLanguage(browser) ? browser : 'en'
}

export default i18n
