import { Badge, Card, Group, Stack, Text, Title, RingProgress, ThemeIcon } from "@mantine/core";
import { IconFlame, IconThermometer, IconMoodSmileBeam } from "@tabler/icons-react";
import type { HruState } from "../../hooks/useDashboardStatus";
import type { TFunction } from "i18next";

interface HruStatusCardProps {
  status: HruState;
  t: TFunction;
}

export function HruStatusCard({ status, t }: HruStatusCardProps) {
  if (status === null) {
    return (
      <Card shadow="sm" padding="lg" withBorder>
        <Group justify="space-between" align="center">
          <Title order={4}>
            {t("dashboard.hruStatusTitle", { defaultValue: "HRU live values" })}
          </Title>
          <Badge color="gray" variant="light" size="lg">
            {t("dashboard.haStatus.loading")}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          {t("dashboard.haStatus.loading")}
        </Text>
      </Card>
    );
  }

  if ("error" in status) {
    return (
      <Card shadow="sm" padding="lg" withBorder>
        <Group justify="space-between" align="center">
          <Title order={4}>
            {t("dashboard.hruStatusTitle", { defaultValue: "HRU live values" })}
          </Title>
          <Badge color="red" variant="light" size="lg">
            {t("dashboard.hruStatusError", { defaultValue: "Error" })}
          </Badge>
        </Group>
        <Text size="sm" c="red">
          {status.error}
        </Text>
      </Card>
    );
  }

  return (
    <Card shadow="sm" padding="lg" withBorder>
      <Group justify="space-between" align="center">
        <Title order={4}>
          {t("dashboard.hruStatusTitle", { defaultValue: "HRU live values" })}
        </Title>
        <Badge color="green" variant="light" size="lg">
          {t("dashboard.hruStatusOk", { defaultValue: "OK" })}
        </Badge>
      </Group>
      <Group align="center" mt="sm" gap="lg">
        <RingProgress
          size={120}
          thickness={12}
          roundCaps
          sections={[
            { value: Math.max(0, Math.min(100, Math.round(status.power))), color: "teal" },
          ]}
          label={
            <Stack gap={2} align="center">
              <ThemeIcon color="teal" variant="light" radius="xl">
                <IconFlame size={20} />
              </ThemeIcon>
              <Text fw={600} size="sm">
                {Math.round(status.power)}%
              </Text>
              <Text size="xs" c="dimmed">
                {t("hru.power", { defaultValue: "Power" })}
              </Text>
            </Stack>
          }
        />
        <Stack gap={8} style={{ flex: 1 }}>
          <Group gap="xs" align="center">
            <ThemeIcon color="blue" variant="light" radius="xl">
              <IconThermometer size={18} />
            </ThemeIcon>
            <Text fw={600}>
              {t("hru.temperature", { defaultValue: "Temperature" })}: {status.temperature}°C
            </Text>
          </Group>
          <Group gap="xs" align="center">
            <ThemeIcon color="grape" variant="light" radius="xl">
              <IconMoodSmileBeam size={18} />
            </ThemeIcon>
            <Text fw={600}>
              {t("dashboard.hruMode", { defaultValue: "Mode" })}: {status.mode}
            </Text>
          </Group>
        </Stack>
      </Group>
      <Text size="sm" c="dimmed" mt="xs">
        {t("dashboard.hruStatusDescription", {
          defaultValue: "Reads HRU registers every 10 seconds",
        })}
      </Text>
    </Card>
  );
}
