import { useState } from 'react'
import {
  Alert,
  Button,
  Card,
  FileButton,
  Group,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { IconDownload, IconUpload } from '@tabler/icons-react'

import { logger } from '../utils/logger'

export const SettingsPage = () => {
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async () => {
    setError(null)
    setMessage(null)
    try {
      logger.info('Exporting database via frontend action')
      const response = await logger.timeAsync('settings.exportDatabase', async () => fetch('/api/database/export'))
      if (!response.ok) {
        const message = `Export failed: ${response.statusText}`
        setError(message)
        logger.error('Database export failed', {
          status: response.status,
          statusText: response.statusText,
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
      setMessage('Database exported successfully.')
      logger.info('Database export completed successfully')
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Export failed')
      logger.error('Database export failed', { error: exportError })
    }
  }

  const handleImport = async (file: File | null) => {
    if (!file) {
      logger.debug('Import aborted: no file selected')
      return
    }
    setUploading(true)
    setError(null)
    setMessage(null)
    try {
      const buffer = await file.arrayBuffer()
      logger.info('Importing database via frontend action', { size: buffer.byteLength })
      const response = await logger.timeAsync('settings.importDatabase', async () =>
        fetch('/api/database/import', {
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
        setError(detail)
        logger.error('Database import failed with non-OK response', {
          status: response.status,
          statusText: response.statusText,
          detail,
        })
        return
      }

      setMessage('Database imported successfully. Refresh the page to load new data.')
      logger.info('Database import completed successfully')
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import failed')
      logger.error('Database import failed', { error: importError })
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

      {message && (
        <Alert color="green" title="Success">
          {message}
        </Alert>
      )}

      {error && (
        <Alert color="red" title="Error">
          {error}
        </Alert>
      )}

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
