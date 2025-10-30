import { MantineProvider, createTheme } from '@mantine/core'
import { RouterProvider } from '@tanstack/react-router'

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

export default function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <RouterProvider router={router} />
    </MantineProvider>
  )
}
