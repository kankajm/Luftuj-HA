import { AppShell, Button, Drawer, Group, Stack, Title, Burger, rem } from '@mantine/core'
import { IconTopologyStar3 } from '@tabler/icons-react'
import { Link, Outlet } from '@tanstack/react-router'
import { useDisclosure } from '@mantine/hooks'

export const AppLayout = () => {
  const [mobileNavOpened, { toggle, close }] = useDisclosure(false)

  const navItems = [
    { to: '/', label: 'Dashboard' },
    { to: '/valves', label: 'Valves' },
    { to: '/settings', label: 'Settings' },
  ] as const

  const DesktopNav = () => (
    <Group gap="sm">
      {navItems.map((item) => (
        <Button key={item.to} component={Link} to={item.to} variant="subtle" size="sm">
          {item.label}
        </Button>
      ))}
    </Group>
  )

  const MobileNav = ({ onNavigate }: { onNavigate?: () => void }) => (
    <Stack gap="xs">
      {navItems.map((item) => (
        <Button key={item.to} component={Link} to={item.to} variant="subtle" onClick={onNavigate}>
          {item.label}
        </Button>
      ))}
    </Stack>
  )

  return (
    <AppShell
      header={{ height: 60 }}
      padding={{ base: 'sm', sm: 'md' }}
      withBorder={false}
      styles={{
        main: {
          backgroundColor: '#f0f4f8',
          minHeight: '100dvh',
        },
      }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm" align="center" wrap="nowrap">
            <IconTopologyStar3 size={24} stroke={1.5} />
            <Title order={3} fw={600} ff="inherit" size={rem(20)}>
              Luftator Control
            </Title>
          </Group>

          <Group gap="sm" visibleFrom="sm">
            <DesktopNav />
          </Group>

          <Burger hiddenFrom="sm" opened={mobileNavOpened} onClick={toggle} aria-label="Toggle navigation" />
        </Group>
      </AppShell.Header>

      <Drawer
        opened={mobileNavOpened}
        onClose={close}
        padding="md"
        title="Navigate"
        size="xs"
        hiddenFrom="sm"
      >
        <MobileNav onNavigate={close} />
      </Drawer>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
