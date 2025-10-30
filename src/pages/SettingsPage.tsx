import { useCallback, useState } from 'react'
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

import { resolveApiUrl } from '../utils/api'
import { logger } from '../utils/logger'

export const SettingsPage = () => {
  const [uploading, setUploading] = useState(false)
  const [savingTheme, setSavingTheme] = useState(false)
  const { setColorScheme } = useMantineColorScheme()
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: false })

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
            title: 'Failed to save theme',
            message,
            color: 'red',
          })
          return
        }
        notifications.show({
          title: 'Theme updated',
          message: `Theme preference set to ${value}.`,
          color: value === 'dark' ? 'violet' : 'blue',
        })
      } catch (persistError) {
        notifications.show({
          title: 'Failed to save theme',
          message: persistError instanceof Error ? persistError.message : 'Unknown error',
          color: 'red',
        })
      } finally {
        setSavingTheme(false)
      }
    },
    [],
  )

  const handleThemeChange = useCallback(
    (value: string) => {
      const scheme = value === 'dark' ? 'dark' : 'light'
      setColorScheme(scheme)
      void persistThemePreference(scheme)
    },
    [persistThemePreference, setColorScheme],
  )

  const handleExport = async () => {
    try {
      logger.info('Exporting database via frontend action')
      const exportUrl = resolveApiUrl('/api/database/export')
      const response = await logger.timeAsync('settings.exportDatabase', async () => fetch(exportUrl))
      if (!response.ok) {
        logger.error('Database export failed', {
          status: response.status,
          statusText: response.statusText,
        })
        notifications.show({
          title: 'Export failed',
          message: `Export failed: ${response.statusText}`,
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
      notifications.show({ title: 'Export complete', message: 'Database exported successfully.', color: 'green' })
      logger.info('Database export completed successfully')
    } catch (exportError) {
      logger.error('Database export failed', { error: exportError })
      notifications.show({
        title: 'Export failed',
        message: exportError instanceof Error ? exportError.message : 'Export failed',
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
        return
      }

      notifications.show({
        title: 'Import complete',
        message: 'Database imported successfully. Refresh to load new data.',
        color: 'green',
      })
      logger.info('Database import completed successfully')
    } catch (importError) {
      logger.error('Database import failed', { error: importError })
      notifications.show({
        title: 'Import failed',
        message: importError instanceof Error ? importError.message : 'Import failed',
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
        <Title order={2}>Settings</Title>
        <Text c="dimmed">Backup or restore Luftator data managed by this Home Assistant instance.</Text>
      </Stack>

      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Title order={4}>Theme</Title>
          <Text size="sm" c="dimmed">
            Switch between light and dark appearance. Your preference is saved in this browser.
          </Text>
          <SegmentedControl
            fullWidth
            value={computedColorScheme}
            data={[
              { label: 'Light', value: 'light' },
              { label: 'Dark', value: 'dark' },
            ]}
            onChange={handleThemeChange}
            disabled={savingTheme}
          />
        </Stack>
      </Card>

      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Title order={4}>Database tools</Title>
          <Text size="sm" c="dimmed">
            Export downloads the current SQLite database (`/data/luftator.db`). Import replaces the existing file after creating a backup.
          </Text>
          <Group gap="sm">
            <Button leftSection={<IconDownload size={16} />} onClick={handleExport} variant="light">
              Export database
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
                  {uploading ? 'Importing…' : 'Import database'}
                </Button>
              )}
            </FileButton>
          </Group>
        </Stack>
      </Card>
    </Stack>
  )
}
