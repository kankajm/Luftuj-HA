import { Button, Card, Group, Stack, Text, Title, ActionIcon } from "@mantine/core";
import { IconPlus, IconEdit, IconTrash } from "@tabler/icons-react";
import type { TFunction } from "i18next";
import type { Mode } from "../../types/timeline";

interface TimelineModeListProps {
  modes: Mode[];
  onAdd: () => void;
  onEdit: (mode: Mode) => void;
  onDelete: (id: number) => void;
  t: TFunction;
  powerUnit?: string;
  temperatureUnit?: string;
}

export function TimelineModeList({
  modes,
  onAdd,
  onEdit,
  onDelete,
  t,
  powerUnit = "%",
  temperatureUnit = "°C",
}: TimelineModeListProps) {
  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={4}>{t("settings.timeline.modesTitle", { defaultValue: "Modes" })}</Title>
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={onAdd}>
            {t("settings.timeline.addMode", { defaultValue: "Add mode" })}
          </Button>
        </Group>
        {modes.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t("settings.timeline.noModes", { defaultValue: "No modes yet." })}
          </Text>
        ) : (
          <Group gap="xs">
            {modes.map((m) => (
              <Card key={m.id} withBorder padding="xs" radius="sm">
                <Stack gap={4}>
                  <Group justify="space-between" align="center">
                    <Text size="sm" fw={600}>
                      {m.name}
                    </Text>
                    <Group gap={4}>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        aria-label="Edit mode"
                        onClick={() => onEdit(m)}
                      >
                        <IconEdit size={14} />
                      </ActionIcon>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="red"
                        aria-label="Delete mode"
                        onClick={() => onDelete(m.id)}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {t("settings.timeline.hru")}: {m.power ?? "-"}
                    {powerUnit}{" "}
                    {m.temperature !== undefined ? ` | ${m.temperature}${temperatureUnit}` : ""}
                  </Text>
                </Stack>
              </Card>
            ))}
          </Group>
        )}
      </Stack>
    </Card>
  );
}
