import { MantineProvider, createTheme, localStorageColorSchemeManager, useMantineColorScheme } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { RouterProvider } from '@tanstack/react-router'
import { useEffect } from 'react'
import '@mantine/notifications/styles.css'

import './App.css'
import { router } from './router'

const theme = createTheme({
  primaryColor: 'blue',
  colors: {
    blue: [
      '#e7f5ff',
      '#d0ebff',
      '#a5d8ff',
      '#74c0fc',
      '#4dabf7',
      '#339af0',
      '#228be6',
      '#1c7ed6',
      '#1971c2',
      '#1864ab',
    ],
  },
})

const colorSchemeManager = localStorageColorSchemeManager({ key: 'luftujha-color-scheme' })

const ThemeInitializer = () => {
  const { setColorScheme } = useMantineColorScheme()

  useEffect(() => {
    let active = true

    const synchroniseTheme = async () => {
      try {
        const response = await fetch('/api/settings/theme')
        if (!response.ok) {
          return
        }
        const data = (await response.json()) as { theme?: string }
        if (!active) {
          return
        }
        if (data.theme === 'dark' || data.theme === 'light') {
          setColorScheme(data.theme)
        }
      } catch (error) {
        console.error('Failed to load persisted theme', error)
      }
    }

    void synchroniseTheme()

    return () => {
      active = false
    }
  }, [setColorScheme])

  return null
}

export default function App() {
  return (
    <MantineProvider theme={theme} withCssVariables colorSchemeManager={colorSchemeManager} defaultColorScheme="auto">
      <ThemeInitializer />
      <Notifications position="bottom-right" limit={3} zIndex={4000} />
      <RouterProvider router={router} />
    </MantineProvider>
  )
}
