import { Modal, Stack, TextInput, Select, Divider, Group, Button } from "@mantine/core";
import type { TFunction } from "i18next";
import type { TimelineEvent } from "../../types/timeline";

interface TimelineEventModalProps {
  opened: boolean;
  event: TimelineEvent | null;
  modeOptions: { value: string; label: string }[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onChange: (event: TimelineEvent) => void;
  t: TFunction;
  hruCapabilities?: {
    supportsModeWrite?: boolean;
  };
}

const TIME_REGEX = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

export function TimelineEventModal({
  opened,
  event,
  modeOptions,
  saving,
  onClose,
  onSave,
  onChange,
  t,
  hruCapabilities,
}: TimelineEventModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={t("settings.timeline.modal.title")} size="md">
      {event && (
        <Stack gap="md">
          <Group grow>
            <TextInput
              label={t("settings.timeline.form.startTime")}
              placeholder="08:00"
              value={event.startTime}
              onChange={(e) => onChange({ ...event, startTime: e.target.value })}
              pattern={TIME_REGEX.source}
              required
            />
            <TextInput
              label={t("settings.timeline.form.endTime")}
              placeholder="08:30"
              value={event.endTime}
              onChange={(e) => onChange({ ...event, endTime: e.target.value })}
              pattern={TIME_REGEX.source}
              required
            />
          </Group>

          {hruCapabilities?.supportsModeWrite !== false && (
            <Select
              label={t("schedule.modeSelect", { defaultValue: "Select mode" })}
              data={modeOptions}
              value={event.hruConfig?.mode?.toString() ?? ""}
              onChange={(value) =>
                onChange({
                  ...event,
                  hruConfig: { ...(event.hruConfig ?? {}), mode: value ?? undefined },
                })
              }
              searchable
              required
            />
          )}

          <Divider />

          <Group justify="flex-end" gap="sm">
            <Button variant="light" onClick={onClose}>
              {t("settings.timeline.modal.cancel")}
            </Button>
            <Button onClick={onSave} loading={saving}>
              {t("settings.timeline.modal.save")}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
