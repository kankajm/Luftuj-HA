import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Group, Stack, Text, Title, Button } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";

import { useTimelineModes } from "../hooks/useTimelineModes";
import { useTimelineEvents } from "../hooks/useTimelineEvents";
import { TimelineModeList } from "../components/timeline/TimelineModeList";
import { TimelineDayCard } from "../components/timeline/TimelineDayCard";
import { TimelineEventModal } from "../components/timeline/TimelineEventModal";
import { TimelineModeModal } from "../components/timeline/TimelineModeModal";

import * as hruApi from "../api/hru";
import * as valveApi from "../api/valves";
import type { TimelineEvent } from "../types/timeline";
import type { Valve } from "../types/valve";

function pad(num: number) {
  return num.toString().padStart(2, "0");
}

function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${pad(hh)}:${pad(mm)}`;
}

export function TimelinePage() {
  const { t } = useTranslation();

  // -- Data Hooks --
  const { modes, loadModes, saveMode, deleteMode, savingMode } = useTimelineModes(t);
  const {
    // events, // unused
    eventsByDay,
    loadEvents,
    saveEvent,
    deleteEvent,
    saving: savingEvent,
  } = useTimelineEvents(modes, t);

  // -- Local State --
  const [loading, setLoading] = useState(false);

  // Event Modal State
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);

  // Copy/Paste State

  const [copyDay, setCopyDay] = useState<number | null>(null);

  // Mode Modal State
  const [modeModalOpen, setModeModalOpen] = useState(false);
  const [editingMode, setEditingMode] = useState<import("../types/timeline").Mode | null>(null); // Null for create

  // Auxiliary Data
  const [valves, setValves] = useState<Valve[]>([]);
  const [hruModes, setHruModes] = useState<string[]>([]);
  const [hruCapabilities, setHruCapabilities] = useState<
    Pick<hruApi.HruUnit, "capabilities">["capabilities"]
  >({});
  const [powerUnit, setPowerUnit] = useState<string>("%");
  const [temperatureUnit, setTemperatureUnit] = useState<string>("°C");

  // -- Effects --
  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([loadModes(), loadEvents()]);

      try {
        const v = await valveApi.fetchValves().catch(() => []);
        setValves(v);

        const units = await hruApi.fetchHruUnits().catch(() => []);
        const first = units[0];
        const values = first?.registers?.read?.mode?.values;
        if (values) {
          const modeList = Object.values(values);
          if (modeList.length > 0) {
            setHruModes(modeList);
          }
        }
        if (first?.capabilities) {
          setHruCapabilities(first.capabilities);
        }
        if (first?.registers?.read?.power?.unit) {
          setPowerUnit(first.registers.read.power.unit);
        }
        if (first?.registers?.read?.temperature?.unit) {
          setTemperatureUnit(first.registers.read.temperature.unit);
        }
      } catch {
        // ignore aux load errors
      } finally {
        setLoading(false);
      }
    }
    void init();
  }, [loadModes, loadEvents]);

  // -- Memoized Options --
  const dayLabels = useMemo(
    () => [
      t("settings.timeline.monday"),
      t("settings.timeline.tuesday"),
      t("settings.timeline.wednesday"),
      t("settings.timeline.thursday"),
      t("settings.timeline.friday"),
      t("settings.timeline.saturday"),
      t("settings.timeline.sunday"),
    ],
    [t],
  );

  const dayOrder = useMemo(() => [0, 1, 2, 3, 4, 5, 6], []);

  const modeOptions = useMemo(() => {
    const userModes = modes.map((m) => ({ value: m.id.toString(), label: m.name }));
    const builtinHruModes = hruModes.map((name) => ({ value: name, label: name }));
    const combined = [...userModes, ...builtinHruModes];
    const seen = new Set<string>();
    return combined.filter((opt) => {
      if (seen.has(opt.value)) return false;
      seen.add(opt.value);
      return true;
    });
  }, [modes, hruModes]);

  // -- Handlers --

  // Events
  const handleAddEvent = useCallback(
    (day: number) => {
      // setSelectedDay(day); // removed unused state
      const startTime = "08:00";

      setEditingEvent({
        startTime,
        endTime: addMinutes(startTime, 30),
        dayOfWeek: day,
        hruConfig: { mode: modes[0]?.id?.toString() ?? hruModes[0] },
        enabled: true,
      });
      setEventModalOpen(true);
    },
    [modes, hruModes],
  );

  const handleEditEvent = useCallback((event: TimelineEvent) => {
    setEditingEvent(event);
    setEventModalOpen(true);
  }, []);

  const handleSaveEvent = useCallback(async () => {
    if (editingEvent) {
      // If we are creating (no ID), ensure dayOfWeek is set from context if needed
      // But editingEvent should already have dayOfWeek set by handleAddEvent or handleEditEvent
      const success = await saveEvent(editingEvent);
      if (success) {
        setEventModalOpen(false);
        setEditingEvent(null);
      }
    }
  }, [editingEvent, saveEvent]);

  const handleToggleEvent = useCallback(
    (event: TimelineEvent, enabled: boolean) => {
      void saveEvent({ ...event, enabled });
    },
    [saveEvent],
  );

  // Copy/Paste
  const handlePasteDay = useCallback(
    async (targetDay: number) => {
      if (copyDay === null) return;
      const source = eventsByDay.get(copyDay) ?? [];
      for (const ev of source) {
        // Create new event based on source
        await saveEvent({
          startTime: ev.startTime,
          endTime: ev.endTime,
          dayOfWeek: targetDay,
          hruConfig: ev.hruConfig,
          luftatorConfig: ev.luftatorConfig,
          enabled: ev.enabled,
        });
      }
      setCopyDay(null);
      notifications.show({
        title: t("settings.timeline.notifications.saveSuccessTitle"), // reusing generic success
        message: t("settings.timeline.pasteDay", { defaultValue: "Events pasted" }),
        color: "green",
      });
    },
    [copyDay, eventsByDay, saveEvent, t],
  );

  // Modes
  const handleAddMode = useCallback(() => {
    setEditingMode(null);
    setModeModalOpen(true);
  }, []);

  const handleEditMode = useCallback((mode: import("../types/timeline").Mode) => {
    setEditingMode(mode);
    setModeModalOpen(true);
  }, []);

  const handleSaveMode = useCallback(
    async (modeData: Partial<import("../types/timeline").Mode>) => {
      const success = await saveMode(modeData);
      if (success) {
        setModeModalOpen(false);
        setEditingMode(null);
      }
    },
    [saveMode],
  );

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Title order={2}>{t("settings.timeline.title")}</Title>
        <Text c="dimmed">{t("settings.timeline.description")}</Text>
      </Stack>

      {/* Modes Section */}
      <TimelineModeList
        modes={modes}
        onAdd={handleAddMode}
        onEdit={handleEditMode}
        onDelete={deleteMode}
        t={t}
        powerUnit={powerUnit}
        temperatureUnit={temperatureUnit}
      />

      {/* Copy/Paste Hint */}
      <Card withBorder padding="md" radius="md">
        <Group gap="sm" wrap="wrap">
          <Text size="sm" c="dimmed">
            {t("settings.timeline.copyHint", { defaultValue: "Copy a day and paste to another." })}
          </Text>
          {copyDay !== null && (
            <Group gap="xs">
              <Text size="sm">
                {t("settings.timeline.copying", {
                  defaultValue: "Copying",
                  day: dayLabels[copyDay],
                })}
              </Text>
              <Button size="xs" variant="light" onClick={() => setCopyDay(null)}>
                {t("settings.timeline.modal.cancel")}
              </Button>
            </Group>
          )}
        </Group>
      </Card>

      {/* Days Grid */}
      <Stack gap="md">
        {dayOrder.map((dayIdx) => (
          <TimelineDayCard
            key={dayIdx}
            dayIdx={dayIdx}
            label={dayLabels[dayIdx]}
            events={eventsByDay.get(dayIdx) ?? []}
            modes={modes}
            copyDay={copyDay}
            loading={loading}
            onCopy={setCopyDay}
            onPaste={handlePasteDay}
            onCancelCopy={() => setCopyDay(null)}
            onAdd={handleAddEvent}
            onEdit={handleEditEvent}
            onDelete={deleteEvent}
            onToggle={handleToggleEvent}
            t={t}
          />
        ))}
      </Stack>

      {/* Modals */}
      <TimelineEventModal
        opened={eventModalOpen}
        event={editingEvent}
        modeOptions={modeOptions}
        saving={savingEvent}
        onClose={() => {
          setEventModalOpen(false);
          setEditingEvent(null);
        }}
        onSave={handleSaveEvent}
        onChange={setEditingEvent}
        t={t}
        hruCapabilities={hruCapabilities}
      />

      <TimelineModeModal
        opened={modeModalOpen}
        mode={editingMode}
        valves={valves}
        saving={savingMode}
        onClose={() => setModeModalOpen(false)}
        onSave={handleSaveMode}
        t={t}
        hruCapabilities={hruCapabilities}
        powerUnit={powerUnit}
        temperatureUnit={temperatureUnit}
      />
    </Stack>
  );
}
