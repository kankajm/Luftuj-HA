import { useCallback, useMemo, useState } from 'react'
import {
  Button,
  Card,
  FileButton,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Title,
  useMantineColorScheme,
  useComputedColorScheme,
} from '@mantine/core'
import { IconDownload, IconUpload } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { useTranslation } from 'react-i18next'

import { resolveApiUrl } from '../utils/api'
import { logger } from '../utils/logger'
import { setLanguage } from '../i18n'

export const SettingsPage = () => {
  const [uploading, setUploading] = useState(false)
  const [savingTheme, setSavingTheme] = useState(false)
  const [savingLanguage, setSavingLanguage] = useState(false)
  const { setColorScheme } = useMantineColorScheme()
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: false })
  const { t, i18n } = useTranslation()

  const themeOptions = useMemo(
    () => [
      { label: t('settings.theme.light'), value: 'light' },
      { label: t('settings.theme.dark'), value: 'dark' },
    ],
    [t],
  )

  const languageOptions = useMemo(
    () => [
      { label: t('settings.language.options.en'), value: 'en' },
      { label: t('settings.language.options.cs'), value: 'cs' },
    ],
    [t],
  )

  const currentLanguage = useMemo(() => {
    const lang = i18n.language ?? 'en'
    const short = lang.split('-')[0]
    return languageOptions.some((option) => option.value === short) ? short : 'en'
  }, [i18n.language, languageOptions])

  const persistThemePreference = useCallback(
    async (value: 'light' | 'dark') => {
      setSavingTheme(true)
      try {
        const response = await fetch(resolveApiUrl('/api/settings/theme'), {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ theme: value }),
        })
        if (!response.ok) {
          const detail = await response.text()
          const message = detail || 'Failed to save theme preference'
          notifications.show({
            title: t('settings.theme.notifications.failedTitle'),
            message: t('settings.theme.notifications.failedMessage', {
              message: message || t('settings.theme.notifications.unknown'),
            }),
            color: 'red',
          })
          return
        }
        notifications.show({
          title: t('settings.theme.notifications.updatedTitle'),
          message: t('settings.theme.notifications.updatedMessage', {
            theme: value === 'dark' ? t('settings.theme.dark') : t('settings.theme.light'),
          }),
          color: value === 'dark' ? 'violet' : 'blue',
        })
      } catch (persistError) {
        notifications.show({
          title: t('settings.theme.notifications.failedTitle'),
          message: t('settings.theme.notifications.failedMessage', {
            message:
              persistError instanceof Error
                ? persistError.message
                : t('settings.theme.notifications.unknown'),
          }),
          color: 'red',
        })
      } finally {
        setSavingTheme(false)
      }
    },
    [t],
  )

  const handleThemeChange = useCallback(
    (value: string) => {
      const scheme = value === 'dark' ? 'dark' : 'light'
      setColorScheme(scheme)
      void persistThemePreference(scheme)
    },
    [persistThemePreference, setColorScheme],
  )

  const persistLanguagePreference = useCallback(
    async (value: string) => {
      const previousLanguage = i18n.language
      setSavingLanguage(true)
      try {
        await setLanguage(value)

        const response = await fetch(resolveApiUrl('/api/settings/language'), {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ language: value }),
        })

        if (!response.ok) {
          const detail = await response.text()
          const message = detail?.trim().length ? detail : t('settings.language.notifications.unknown')
          await setLanguage(previousLanguage.split('-')[0])
          notifications.show({
            title: t('settings.language.notifications.failedTitle'),
            message: t('settings.language.notifications.failedMessage', { message }),
            color: 'red',
          })
          return
        }

        const label = languageOptions.find((option) => option.value === value)?.label ?? value
        notifications.show({
          title: t('settings.language.notifications.updatedTitle'),
          message: t('settings.language.notifications.updatedMessage', { language: label }),
          color: 'green',
        })
      } catch (persistError) {
        await setLanguage(previousLanguage)
        notifications.show({
          title: t('settings.language.notifications.failedTitle'),
          message: t('settings.language.notifications.failedMessage', {
            message:
              persistError instanceof Error
                ? persistError.message
                : t('settings.language.notifications.unknown'),
          }),
          color: 'red',
        })
      } finally {
        setSavingLanguage(false)
      }
    },
    [i18n.language, languageOptions, setLanguage, t],
  )

  const handleLanguageChange = useCallback(
    (value: string) => {
      void persistLanguagePreference(value)
    },
    [persistLanguagePreference],
  )

  const handleExport = async () => {
    try {
      logger.info('Exporting database via frontend action')
      const exportUrl = resolveApiUrl('/api/database/export')
      const response = await logger.timeAsync('settings.exportDatabase', async () => fetch(exportUrl))
      if (!response.ok) {
        logger.error('Database export failed', {
          status: response.status,
        })
        notifications.show({
          title: t('settings.database.notifications.exportFailedTitle'),
          message: t('settings.database.notifications.exportFailedMessage', {
            message: response.statusText || t('settings.database.notifications.unknown'),
          }),
          color: 'red',
        })
        return
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'luftator.db'
      link.click()
      URL.revokeObjectURL(url)
      notifications.show({
        title: t('settings.database.notifications.exportSuccessTitle'),
        message: t('settings.database.notifications.exportSuccessMessage'),
        color: 'green',
      })
      logger.info('Database export completed successfully')
    } catch (exportError) {
      logger.error('Database export failed', { error: exportError })
      notifications.show({
        title: t('settings.database.notifications.exportFailedTitle'),
        message: t('settings.database.notifications.exportFailedMessage', {
          message:
            exportError instanceof Error
              ? exportError.message
              : t('settings.database.notifications.unknown'),
        }),
        color: 'red',
      })
    }
  }

  const handleImport = async (file: File | null) => {
    if (!file) {
      logger.debug('Import aborted: no file selected')
      return
    }
    setUploading(true)
    try {
      const buffer = await file.arrayBuffer()
      logger.info('Importing database via frontend action', { size: buffer.byteLength })
      const importUrl = resolveApiUrl('/api/database/import')
      const response = await logger.timeAsync('settings.importDatabase', async () =>
        fetch(importUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
          },
          body: buffer,
        }),
      )

      if (!response.ok) {
        const text = await response.text()
        const detail = text || 'Import failed'
        logger.error('Database import failed with non-OK response', {
          status: response.status,
          statusText: response.statusText,
          detail,
        })
        notifications.show({
          title: t('settings.database.notifications.importFailedTitle'),
          message: t('settings.database.notifications.importFailedMessage', {
            message: detail || t('settings.database.notifications.unknown'),
          }),
          color: 'red',
        })
        return
      }

      notifications.show({
        title: t('settings.database.notifications.importSuccessTitle'),
        message: t('settings.database.notifications.importSuccessMessage'),
        color: 'green',
      })
      logger.info('Database import completed successfully')
    } catch (importError) {
      logger.error('Database import failed', { error: importError })
      notifications.show({
        title: t('settings.database.notifications.importFailedTitle'),
        message: t('settings.database.notifications.importFailedMessage', {
          message:
            importError instanceof Error
              ? importError.message
              : t('settings.database.notifications.unknown'),
        }),
        color: 'red',
      })
    } finally {
      setUploading(false)
      logger.debug('Database import request finished', { uploading: false })
    }
  }

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Title order={2}>{t('settings.title')}</Title>
        <Text c="dimmed">{t('settings.description')}</Text>
      </Stack>

      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Title order={4}>{t('settings.language.title')}</Title>
          <Text size="sm" c="dimmed">
            {t('settings.language.description')}
          </Text>
          <SegmentedControl
            fullWidth
            value={currentLanguage}
            data={languageOptions}
            onChange={handleLanguageChange}
            disabled={savingLanguage}
          />
        </Stack>
      </Card>

      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Title order={4}>{t('settings.theme.title')}</Title>
          <Text size="sm" c="dimmed">
            {t('settings.theme.description')}
          </Text>
          <SegmentedControl
            fullWidth
            value={computedColorScheme}
            data={themeOptions}
            onChange={handleThemeChange}
            disabled={savingTheme}
          />
        </Stack>
      </Card>

      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Title order={4}>{t('settings.database.title')}</Title>
          <Text size="sm" c="dimmed">
            {t('settings.database.description')}
          </Text>
          <Group gap="sm">
            <Button leftSection={<IconDownload size={16} />} onClick={handleExport} variant="light">
              {t('settings.database.export')}
            </Button>
            <FileButton onChange={handleImport} accept=".db" disabled={uploading}>
              {(props) => (
                <Button
                  {...props}
                  leftSection={uploading ? undefined : <IconUpload size={16} />}
                  loading={uploading}
                  variant="filled"
                  color="blue"
                >
                  {uploading ? t('settings.database.importing') : t('settings.database.import')}
                </Button>
              )}
            </FileButton>
          </Group>
        </Stack>
      </Card>
    </Stack>
  )
}
