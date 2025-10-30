import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'

import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { ValvesPage } from './pages/ValvesPage'
import { SettingsPage } from './pages/SettingsPage'

const rootRoute = createRootRoute({
  component: AppLayout,
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
})

const valvesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/valves',
  component: ValvesPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})

const routeTree = rootRoute.addChildren([dashboardRoute, valvesRoute, settingsRoute])

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export { router }
