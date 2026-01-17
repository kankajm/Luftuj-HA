import { Button, Card, Group, Stack, Text, Title, ActionIcon, Tooltip } from "@mantine/core";
import { IconPlus, IconEdit, IconTrash, IconCopy, IconClipboardCheck } from "@tabler/icons-react";
import type { TFunction } from "i18next";
import type { TimelineEvent, Mode } from "../../types/timeline";
import { Switch, ActionIcon as MantineActionIcon } from "@mantine/core";

interface TimelineDayCardProps {
  dayIdx: number;
  label: string;
  events: TimelineEvent[];
  modes: Mode[];
  copyDay: number | null;
  loading: boolean;
  onCopy: (day: number) => void;
  onPaste: (day: number) => void;
  onCancelCopy: () => void;
  onAdd: (day: number) => void;
  onEdit: (event: TimelineEvent) => void;
  onDelete: (id: number) => void;
  onToggle: (event: TimelineEvent, enabled: boolean) => void;
  t: TFunction;
}

export function TimelineDayCard({
  dayIdx,
  label,
  events,
  modes,
  copyDay,
  loading,
  onCopy,
  onPaste,
  onCancelCopy,
  onAdd,
  onEdit,
  onDelete,
  onToggle,
  t,
}: TimelineDayCardProps) {
  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" mb="xs">
        <Title order={4}>{label}</Title>
        <Group gap="xs">
          {copyDay === null ? (
            <Tooltip label={t("settings.timeline.copyDay", { defaultValue: "Copy day" })} withArrow>
              <ActionIcon variant="light" aria-label="Copy day" onClick={() => onCopy(dayIdx)}>
                <IconCopy size={16} />
              </ActionIcon>
            </Tooltip>
          ) : copyDay === dayIdx ? (
            <Tooltip label={t("settings.timeline.modal.cancel")} withArrow>
              <ActionIcon
                variant="light"
                color="red"
                aria-label="Cancel copy"
                onClick={onCancelCopy}
              >
                <IconClipboardCheck size={16} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <Tooltip
              label={t("settings.timeline.pasteDay", { defaultValue: "Paste day" })}
              withArrow
            >
              <ActionIcon variant="light" aria-label="Paste day" onClick={() => onPaste(dayIdx)}>
                <IconClipboardCheck size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Button
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={() => onAdd(dayIdx)}
            disabled={loading || modes.length === 0}
          >
            {t("settings.timeline.addEvent")}
          </Button>
        </Group>
      </Group>

      {events.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t("settings.timeline.noEvents")}
        </Text>
      ) : (
        <Stack gap="xs">
          {events.map((ev) => (
            <Card
              key={ev.id ?? `${ev.startTime}-${ev.hruConfig?.mode}`}
              withBorder
              padding="sm"
              radius="md"
            >
              <Group justify="space-between" align="center">
                <Stack gap={2} style={{ flex: 1 }}>
                  <Text fw={600}>
                    {ev.startTime} – {ev.endTime}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {t("settings.timeline.hru")}:{" "}
                    {modes.find((m) => m.id.toString() === ev.hruConfig?.mode?.toString())?.name ??
                      ev.hruConfig?.mode ??
                      "-"}
                  </Text>
                </Stack>
                <Group gap="xs">
                  <Switch
                    size="sm"
                    checked={ev.enabled}
                    onChange={(e) => onToggle(ev, e.currentTarget.checked)}
                  />
                  <MantineActionIcon variant="light" aria-label="Edit" onClick={() => onEdit(ev)}>
                    <IconEdit size={16} />
                  </MantineActionIcon>
                  <MantineActionIcon
                    variant="light"
                    color="red"
                    aria-label="Delete"
                    onClick={() => ev.id && onDelete(ev.id)}
                  >
                    <IconTrash size={16} />
                  </MantineActionIcon>
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Card>
  );
}
