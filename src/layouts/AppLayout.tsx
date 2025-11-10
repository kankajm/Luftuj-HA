import {
  Anchor,
  AppShell,
  Button,
  Drawer,
  Group,
  Image,
  Stack,
  Text,
  Title,
  Burger,
  rem,
} from "@mantine/core";
import { IconAt, IconPhone } from "@tabler/icons-react";
import { Link, Outlet } from "@tanstack/react-router";
import { useDisclosure } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import logoFull from "../assets/logo-big-with-text.svg";
import logoMark from "../assets/logo.svg";

export function AppLayout() {
  const [mobileNavOpened, { toggle, close }] = useDisclosure(false);
  const { t } = useTranslation();

  const footerLink = import.meta.env.VITE_FOOTER_LINK ?? "https://www.luftuj.cz/";

  const navItems = useMemo(
    () => [
      { to: "/", label: t("app.nav.dashboard") },
      { to: "/valves", label: t("app.nav.valves") },
      { to: "/settings", label: t("app.nav.settings") },
    ],
    [t],
  );

  function DesktopNav() {
    return (
      <Group gap="sm">
        {navItems.map((item) => (
          <Button key={item.to} component={Link} to={item.to} variant="subtle" size="sm">
            {item.label}
          </Button>
        ))}
      </Group>
    );
  }

  function MobileNav({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <Stack gap="xs">
        {navItems.map((item) => (
          <Button key={item.to} component={Link} to={item.to} variant="subtle" onClick={onNavigate}>
            {item.label}
          </Button>
        ))}
      </Stack>
    );
  }

  return (
    <AppShell
      header={{ height: 60 }}
      footer={{ height: 64 }}
      padding={{ base: "sm", sm: "md" }}
      withBorder={false}
      styles={{
        main: {
          backgroundColor: "var(--mantine-color-body)",
          color: "var(--mantine-color-text)",
          minHeight: "100dvh",
        },
      }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs" align="center" wrap="nowrap">
            <Image src={logoMark} alt={t("app.title")} h={28} w={28} fit="contain" />
            <Title order={3} fw={600} ff="inherit" size={rem(20)}>
              {t("app.title")}
            </Title>
          </Group>

          <Group gap="sm" visibleFrom="sm">
            <DesktopNav />
          </Group>

          <Burger
            hiddenFrom="sm"
            opened={mobileNavOpened}
            onClick={toggle}
            aria-label="Toggle navigation"
          />
        </Group>
      </AppShell.Header>

      <Drawer
        opened={mobileNavOpened}
        onClose={close}
        padding="md"
        title={t("app.nav.navigate")}
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
        style={{ paddingBottom: "calc(var(--mantine-spacing-xl) + 12px)" }}
      >
        <Stack gap="sm" justify="space-between" h="100%">
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg">
            <Anchor
              href={footerLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <Image src={logoFull} alt={t("app.footer.company")} h={32} fit="contain" />
              <Text size="sm" fw={600} c="var(--mantine-color-text)">
                {t("app.footer.company")}
              </Text>
            </Anchor>

            <Group gap="md" align="flex-start" wrap="wrap">
              <Stack gap={2}>
                <Text size="xs" c="dimmed">
                  {t("app.footer.addressLine1")}
                </Text>
                <Text size="xs" c="dimmed">
                  {t("app.footer.addressLine2")}
                </Text>
              </Stack>

              <Stack gap={4}>
                <Group gap={6} wrap="nowrap">
                  <IconPhone size={14} stroke={1.8} color="#228be6" />
                  <Anchor href={t("app.footer.phoneLink")} size="xs" c="blue.5">
                    {t("app.footer.phone")}
                  </Anchor>
                </Group>
                <Group gap={6} wrap="nowrap">
                  <IconAt size={14} stroke={1.8} color="#228be6" />
                  <Anchor href={t("app.footer.emailLink")} size="xs" c="blue.5">
                    {t("app.footer.email")}
                  </Anchor>
                </Group>
              </Stack>
            </Group>
          </Group>
        </Stack>
      </AppShell.Footer>
    </AppShell>
  );
}
