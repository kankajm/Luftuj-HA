import {
  Anchor,
  AppShell,
  Box,
  Button,
  Drawer,
  Group,
  Image,
  Stack,
  Text,
  Title,
  Burger,
  UnstyledButton,
  rem,
  Paper,
} from "@mantine/core";
import {
  IconAt,
  IconPhone,
  IconLayoutDashboard,
  IconDeviceFloppy,
  IconTimeline,
  IconSettings,
} from "@tabler/icons-react";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { useDisclosure } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import logoFull from "../assets/logo-big-with-text.svg";
import logoMark from "../assets/logo.svg";

export function AppLayout() {
  const [mobileNavOpened, { toggle, close }] = useDisclosure(false);
  const { t } = useTranslation();
  const location = useLocation();
  const footerLink = import.meta.env.VITE_FOOTER_LINK ?? "https://www.luftuj.cz/";

  const navItems = useMemo(
    () => [
      { to: "/", label: t("app.nav.dashboard"), icon: IconLayoutDashboard },
      { to: "/valves", label: t("app.nav.valves"), icon: IconDeviceFloppy },
      { to: "/timeline", label: t("app.nav.timeline"), icon: IconTimeline },
      { to: "/settings", label: t("app.nav.settings"), icon: IconSettings },
    ],
    [t],
  );

  const isActive = (to: string) => {
    return location.pathname === to;
  };

  function DesktopNav() {
    return (
      <Paper
        px="xs"
        py={4}
        radius="lg"
        style={{
          backgroundColor: "var(--mantine-color-default-hover)",
          border: "1px solid var(--mantine-color-default-border)",
        }}
      >
        <Group gap={0}>
          {navItems.map((item) => {
            const active = isActive(item.to);
            const IconComponent = item.icon;
            return (
              <Button
                key={item.to}
                component={Link}
                to={item.to}
                variant={active ? "light" : "subtle"}
                color={active ? "primary" : "gray"}
                size="sm"
                radius="md"
                leftSection={<IconComponent size={18} />}
                styles={{
                  root: {
                    fontWeight: active ? 600 : 400,
                    transition: "all 0.2s ease",
                    "&:hover": {
                      backgroundColor: active
                        ? "var(--mantine-color-primary-hover)"
                        : "var(--mantine-color-default-hover)",
                    },
                  },
                }}
              >
                {item.label}
              </Button>
            );
          })}
        </Group>
      </Paper>
    );
  }

  function MobileNav({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <Stack gap="sm">
        {navItems.map((item) => {
          const active = isActive(item.to);
          const IconComponent = item.icon;
          return (
            <UnstyledButton
              key={item.to}
              component={Link}
              to={item.to}
              onClick={onNavigate}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                padding: "1rem 1.25rem",
                borderRadius: "12px",
                backgroundColor: active
                  ? "var(--mantine-color-primary-light)"
                  : "var(--mantine-color-default-hover)",
                color: active ? "var(--mantine-color-primary-filled)" : "var(--mantine-color-text)",
                fontWeight: active ? 600 : 400,
                transition: "all 0.2s ease",
                border: active
                  ? "2px solid var(--mantine-color-primary-filled)"
                  : "1px solid var(--mantine-color-default-border)",
              }}
              onTouchStart={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = "var(--mantine-color-default-hover)";
                  e.currentTarget.style.transform = "scale(0.98)";
                }
              }}
              onTouchEnd={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = "var(--mantine-color-default-hover)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = "var(--mantine-color-body)";
                }
              }}
            >
              <IconComponent size={24} style={{ flexShrink: 0 }} />
              <Text size="lg">{item.label}</Text>
              {active && (
                <div
                  style={{
                    marginLeft: "auto",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: "var(--mantine-color-primary-filled)",
                  }}
                />
              )}
            </UnstyledButton>
          );
        })}
      </Stack>
    );
  }

  return (
    <AppShell
      header={{ height: 70 }}
      padding={{ base: "sm", sm: "md" }}
      withBorder={true}
      styles={{
        header: {
          backgroundColor: "var(--mantine-color-body)",
          borderBottom: "1px solid var(--mantine-color-default-border)",
        },
        main: {
          backgroundColor: "var(--mantine-color-body)",
          color: "var(--mantine-color-text)",
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <AppShell.Header>
        <Group h="100%" px="lg" justify="space-between">
          <UnstyledButton
            component={Link}
            to="/"
            p={0}
            h="100%"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
            }}
          >
            <Group gap="sm" align="center" wrap="nowrap">
              <Image src={logoMark} alt={t("app.title")} h={32} w={32} fit="contain" />
              <Title order={2} fw={700} ff="inherit" size={rem(22)} c="var(--mantine-color-text)">
                {t("app.title")}
              </Title>
            </Group>
          </UnstyledButton>

          <Group gap="sm" visibleFrom="sm">
            <DesktopNav />
          </Group>

          <Paper
            p={10}
            radius="md"
            style={{
              backgroundColor: "var(--mantine-color-default-hover)",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onTouchStart={(e) => {
              e.currentTarget.style.backgroundColor = "var(--mantine-color-default-hover)";
              e.currentTarget.style.transform = "scale(0.95)";
            }}
            onTouchEnd={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--mantine-color-default-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--mantine-color-body)";
            }}
            onClick={toggle}
            hiddenFrom="sm"
          >
            <Burger opened={mobileNavOpened} aria-label="Toggle navigation" size="md" />
          </Paper>
        </Group>
      </AppShell.Header>

      <Drawer
        opened={mobileNavOpened}
        onClose={close}
        padding="xl"
        title={
          <Group gap="xs" align="center">
            <Image src={logoMark} alt={t("app.title")} h={28} w={28} fit="contain" />
            <Title order={4} fw={600} ff="inherit" size={rem(18)} c="var(--mantine-color-text)">
              {t("app.nav.navigate")}
            </Title>
          </Group>
        }
        size="100%"
        hiddenFrom="sm"
        styles={{
          content: {
            backgroundColor: "var(--mantine-color-body)",
          },
          header: {
            borderBottom: "1px solid var(--mantine-color-default-border)",
            paddingBottom: "1rem",
          },
          body: {
            paddingTop: "1.5rem",
          },
        }}
        overlayProps={{
          opacity: 0.5,
          blur: 2,
        }}
      >
        <MobileNav onNavigate={close} />
      </Drawer>

      <AppShell.Main>
        <Box style={{ flex: 1, paddingBottom: "100px" }}>
          <Outlet />
        </Box>
      </AppShell.Main>

      <AppShell.Footer
        mih={90}
        px="lg"
        pt="lg"
        pb="xl"
        withBorder
        style={{ paddingBottom: "calc(var(--mantine-spacing-xl) + 12px)" }}
      >
        <Stack gap="sm" justify="space-between" h="100%">
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="xl">
            <Anchor
              href={footerLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                transition: "opacity 0.2s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              <Image src={logoFull} alt={t("app.footer.company")} h={36} fit="contain" />
              <Text size="md" fw={700} c="var(--mantine-color-text)" lh={1.2}>
                {t("app.footer.company")}
              </Text>
            </Anchor>

            <Group gap="xl" align="flex-start" wrap="wrap">
              <Stack gap={4}>
                <Text size="sm" c="dimmed" fw={500}>
                  {t("app.footer.addressLine1")}
                </Text>
                <Text size="sm" c="dimmed">
                  {t("app.footer.addressLine2")}
                </Text>
              </Stack>

              <Stack gap={6}>
                <Group gap={8} wrap="nowrap">
                  <IconPhone size={16} stroke={1.8} color="var(--mantine-primary-color-5)" />
                  <Anchor
                    href={t("app.footer.phoneLink")}
                    size="sm"
                    c="blue"
                    fw={500}
                    style={{ transition: "color 0.2s ease" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "var(--mantine-primary-color-6)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "var(--mantine-primary-color-5)")
                    }
                  >
                    {t("app.footer.phone")}
                  </Anchor>
                </Group>
                <Group gap={8} wrap="nowrap">
                  <IconAt size={16} stroke={1.8} color="var(--mantine-primary-color-5)" />
                  <Anchor
                    href={t("app.footer.emailLink")}
                    size="sm"
                    c="blue"
                    fw={500}
                    style={{ transition: "color 0.2s ease" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "var(--mantine-primary-color-6)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "var(--mantine-primary-color-5)")
                    }
                  >
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
