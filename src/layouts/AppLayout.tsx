import { AppShell, Button, Group, Title } from '@mantine/core'
import { IconTopologyStar3 } from '@tabler/icons-react'
import { Link, Outlet } from '@tanstack/react-router'

export const AppLayout = () => (
  <AppShell
    header={{ height: 60 }}
    padding="md"
    withBorder={false}
    styles={{
      main: {
        backgroundColor: '#f0f4f8',
      },
    }}
  >
    <AppShell.Header>
      <Group h="100%" px="md" justify="space-between">
        <Group gap="sm" align="center">
          <IconTopologyStar3 size={24} stroke={1.5} />
          <Title order={3}>Luftator Control</Title>
        </Group>
        <Group gap="sm">
          <Button component={Link} to="/" variant="subtle">
            Dashboard
          </Button>
          <Button component={Link} to="/valves" variant="subtle">
            Valves
          </Button>
          <Button component={Link} to="/settings" variant="subtle">
            Settings
          </Button>
        </Group>
      </Group>
    </AppShell.Header>

    <AppShell.Main>
      <Outlet />
    </AppShell.Main>
  </AppShell>
)
