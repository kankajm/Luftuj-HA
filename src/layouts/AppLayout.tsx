import { Anchor, AppShell, Button, Drawer, Group, Image, Stack, Text, Title, Burger, rem } from '@mantine/core'
import { IconAt, IconPhone, IconTopologyStar3 } from '@tabler/icons-react'
import { Link, Outlet } from '@tanstack/react-router'
import { useDisclosure } from '@mantine/hooks'
import logoFull from '../assets/logo-big-with-text.png'

export const AppLayout = () => {
  const [mobileNavOpened, { toggle, close }] = useDisclosure(false)

  const footerLink = import.meta.env.VITE_FOOTER_LINK ?? 'https://www.luftuj.cz/'

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
      footer={{ height: 64 }}
      padding={{ base: 'sm', sm: 'md' }}
      withBorder={false}
      styles={{
        main: {
          backgroundColor: 'var(--mantine-color-body)',
          color: 'var(--mantine-color-text)',
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

      <AppShell.Footer
        mih={90}
        px="md"
        pt="md"
        pb="xl"
        style={{ paddingBottom: 'calc(var(--mantine-spacing-xl) + 12px)' }}
      >
        <Stack gap="sm" justify="space-between" h="100%">
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg">
            <Anchor href={footerLink} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Image src={logoFull} alt="Luftuj" h={32} fit="contain" />
              <Text size="sm" fw={600} c="var(--mantine-color-text)">
                Luftuj s.r.o.
              </Text>
            </Anchor>

            <Group gap="md" align="flex-start" wrap="wrap">
              <Stack gap={2}>
                <Text size="xs" c="dimmed">
                  T. G. Masaryka 102
                </Text>
                <Text size="xs" c="dimmed">
                  538 21 Slatiňany
                </Text>
              </Stack>

              <Stack gap={4}>
                <Group gap={6} wrap="nowrap">
                  <IconPhone size={14} stroke={1.8} color="#228be6" />
                  <Anchor href="tel:+420735774074" size="xs" c="blue.5">
                    +420 735 774 074
                  </Anchor>
                </Group>
                <Group gap={6} wrap="nowrap">
                  <IconAt size={14} stroke={1.8} color="#228be6" />
                  <Anchor href="mailto:info@luftuj.cz" size="xs" c="blue.5">
                    info@luftuj.cz
                  </Anchor>
                </Group>
              </Stack>
            </Group>
          </Group>
        </Stack>
      </AppShell.Footer>
    </AppShell>
  )
}
