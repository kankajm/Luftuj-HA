import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Button,
  Card,
  Divider,
  Group,
  Modal,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip,
  NumberInput,
} from "@mantine/core";
import { IconClipboardCheck, IconCopy, IconEdit, IconPlus, IconTrash } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";

import { resolveApiUrl } from "../utils/api";

const TIME_REGEX = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

interface TimelineEvent {
  id?: number;
  startTime: string;
  endTime: string;
  dayOfWeek: number; // 0-6
  hruConfig?: { mode?: string; power?: number; temperature?: number } | null;
  luftatorConfig?: Record<string, number> | null;
  enabled: boolean;
}

interface ApiTimelineEvent {
  id?: number;
  startTime?: string;
  start_time?: string;
  endTime?: string;
  end_time?: string;
  dayOfWeek?: number | null;
  day_of_week?: number | null;
  hruConfig?: TimelineEvent["hruConfig"];
  hru_config?: TimelineEvent["hruConfig"];
  luftatorConfig?: TimelineEvent["luftatorConfig"];
  luftator_config?: TimelineEvent["luftatorConfig"];
  enabled?: boolean;
}

interface Mode {
  id: number;
  name: string;
  color?: string;
  power?: number;
  temperature?: number;
  luftatorConfig?: Record<string, number>;
}

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
  const [modes, setModes] = useState<Mode[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [copyDay, setCopyDay] = useState<number | null>(null);
  const [modeModalOpen, setModeModalOpen] = useState(false);
  const [editingMode, setEditingMode] = useState<Mode | null>(null);
  const [newModeName, setNewModeName] = useState("");
  const [newModePower, setNewModePower] = useState<number | undefined>(undefined);
  const [newModeTemperature, setNewModeTemperature] = useState<number | undefined>(undefined);
  const [newModeColor, setNewModeColor] = useState<string>("");
  const [savingMode, setSavingMode] = useState(false);
  const [valves, setValves] = useState<{ entityId: string; name?: string }[]>([]);
  const [valveOpenings, setValveOpenings] = useState<Record<string, number | undefined>>({});
  const [hruModes, setHruModes] = useState<string[]>([]);

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

  const cleanedValveOpenings = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(valveOpenings).filter(
          ([, value]) => typeof value === "number" && !Number.isNaN(value) && value >= 0 && value <= 100,
        ),
      ),
    [valveOpenings],
  );

  const modeOptions = useMemo(() => {
    const userModes = modes.map((m) => ({ value: m.id.toString(), label: m.name }));
    const builtinHruModes = hruModes.map((name) => ({ value: name, label: name }));
    const combined = [...userModes, ...builtinHruModes];
    // Deduplicate by value to avoid duplicates if names overlap
    const seen = new Set<string>();
    return combined.filter((opt) => {
      if (seen.has(opt.value)) return false;
      seen.add(opt.value);
      return true;
    });
  }, [modes, hruModes]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [modesRes, eventsRes, valvesRes, hruUnitsRes] = await Promise.all([
          fetch(resolveApiUrl("/api/timeline/modes")),
          fetch(resolveApiUrl("/api/timeline/events")),
          fetch(resolveApiUrl("/api/valves")).catch(() => null),
          fetch(resolveApiUrl("/api/hru/units")).catch(() => null),
        ]);

        if (modesRes.ok) {
          const data = (await modesRes.json()) as { modes?: Mode[] };
          setModes(data.modes ?? []);
        } else {
          notifications.show({
            title: t("settings.timeline.notifications.loadFailedTitle"),
            message: t("settings.timeline.notifications.loadFailedModes", { defaultValue: "Failed to load modes" }),
            color: "red",
          });
        }

        if (eventsRes.ok) {
          const rawEvents = (await eventsRes.json()) as ApiTimelineEvent[];
          const normalized = rawEvents
            .map((e) => ({
              id: e.id,
              startTime: e.startTime ?? e.start_time ?? "08:00",
              endTime: e.endTime ?? e.end_time ?? "08:30",
              dayOfWeek: (e.dayOfWeek ?? e.day_of_week ?? 0) as number,
              hruConfig: e.hruConfig ?? e.hru_config ?? null,
              enabled: e.enabled ?? true,
            }))
            .filter((e) => e.dayOfWeek >= 0 && e.dayOfWeek <= 6);
          setEvents(normalized);
        } else {
          notifications.show({
            title: t("settings.timeline.notifications.loadFailedTitle"),
            message: t("settings.timeline.notifications.loadFailedMessage"),
            color: "red",
          });
        }

        if (valvesRes && valvesRes.ok) {
          const data = (await valvesRes.json()) as
            | { valves?: Array<{ entityId?: string; entity_id?: string; name?: string; attributes?: { friendly_name?: string } }> }
            | Array<{ entityId?: string; entity_id?: string; name?: string; attributes?: { friendly_name?: string } }>;
          const list = Array.isArray(data) ? data : data.valves ?? [];
          setValves(
            list
              .map((v) => {
                const id = (v.entityId ?? v.entity_id ?? "").toString();
                const friendly = v.attributes?.friendly_name ?? v.name ?? id;
                return id ? { entityId: id, name: friendly } : null;
              })
              .filter(Boolean) as { entityId: string; name?: string }[],
          );
        }

        if (hruUnitsRes && hruUnitsRes.ok) {
          const data = (await hruUnitsRes.json()) as Array<{
            id: string;
            name: string;
            registers?: { mode?: { values?: string[] } };
          }>;
          const first = data?.[0];
          const values = first?.registers?.mode?.values;
          if (Array.isArray(values) && values.length > 0) {
            setHruModes(values);
          }
        }
      } catch {
        notifications.show({
          title: t("settings.timeline.notifications.loadFailedTitle"),
          message: t("settings.timeline.notifications.loadFailedMessage"),
          color: "red",
        });
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [t]);

  const eventsByDay = useMemo(() => {
    const map = new Map<number, TimelineEvent[]>();
    for (let d = 0; d < 7; d += 1) {
      map.set(d, []);
    }
    for (const ev of events) {
      const list = map.get(ev.dayOfWeek) ?? [];
      list.push(ev);
      map.set(ev.dayOfWeek, list);
    }
    for (const [key, list] of map.entries()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime));
      map.set(key, list);
    }
    return map;
  }, [events]);

  const openNew = useCallback(
    (day: number) => {
      setSelectedDay(day);
      const startTime = "08:00";
      setEditingEvent({
        startTime,
        endTime: addMinutes(startTime, 30),
        dayOfWeek: day,
        hruConfig: { mode: modes[0]?.id?.toString() ?? hruModes[0] },
        enabled: true,
      });
      setModalOpen(true);
    },
    [modes, hruModes],
  );

  const saveEvent = useCallback(
    async (event: TimelineEvent) => {
      const selectedMode = modes.find((m) => m.id?.toString() === event.hruConfig?.mode?.toString()) ?? null;
      const mergedHruConfig = {
        ...(event.hruConfig ?? {}),
        ...(selectedMode?.power !== undefined ? { power: selectedMode.power } : {}),
        ...(selectedMode?.temperature !== undefined ? { temperature: selectedMode.temperature } : {}),
      };
      const mergedLuftatorConfig = selectedMode?.luftatorConfig ?? event.luftatorConfig ?? null;

      if (!TIME_REGEX.test(event.startTime) || !TIME_REGEX.test(event.endTime)) {
        notifications.show({
          title: t("settings.timeline.notifications.validationFailedTitle"),
          message: t("settings.timeline.notifications.invalidTimeFormat"),
          color: "red",
        });
        return;
      }
      const [sh, sm] = event.startTime.split(":").map(Number);
      const [eh, em] = event.endTime.split(":").map(Number);
      if (sh * 60 + sm >= eh * 60 + em) {
        notifications.show({
          title: t("settings.timeline.notifications.validationFailedTitle"),
          message: t("settings.timeline.notifications.startTimeBeforeEnd"),
          color: "red",
        });
        return;
      }

      setSaving(true);
      try {
        const response = await fetch(resolveApiUrl("/api/timeline/events"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: event.id,
            startTime: event.startTime,
            endTime: event.endTime,
            dayOfWeek: event.dayOfWeek,
            hruConfig: mergedHruConfig,
            luftatorConfig: mergedLuftatorConfig,
            enabled: event.enabled,
            priority: 0,
          }),
        });
        if (!response.ok) {
          const detail = await response.text();
          notifications.show({
            title: t("settings.timeline.notifications.saveFailedTitle"),
            message: detail || t("settings.timeline.notifications.saveFailedMessage", { message: detail }),
            color: "red",
          });
          return;
        }
        const saved = (await response.json()) as TimelineEvent;
        setEvents((prev) => {
          const idx = prev.findIndex((e) => e.id === saved.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...prev[idx], ...saved };
            return next;
          }
          return [...prev, saved];
        });
        setModalOpen(false);
        setEditingEvent(null);
        notifications.show({
          title: t("settings.timeline.notifications.saveSuccessTitle"),
          message: t("settings.timeline.notifications.saveSuccessMessage"),
          color: "green",
        });
      } catch {
        notifications.show({
          title: t("settings.timeline.notifications.saveFailedTitle"),
          message: t("settings.timeline.notifications.saveFailedMessage"),
          color: "red",
        });
      } finally {
        setSaving(false);
      }
    },
    [modes, t],
  );

  const deleteEvent = useCallback(
    async (id?: number) => {
      if (!id) return;
      try {
        const res = await fetch(resolveApiUrl(`/api/timeline/events/${id}`), { method: "DELETE" });
        if (!res.ok) {
          const detail = await res.text();
          notifications.show({
            title: t("settings.timeline.notifications.deleteFailedTitle"),
            message: detail || t("settings.timeline.notifications.deleteFailedMessage", { message: detail }),
            color: "red",
          });
          return;
        }
        setEvents((prev) => prev.filter((e) => e.id !== id));
      } catch {
        notifications.show({
          title: t("settings.timeline.notifications.deleteFailedTitle"),
          message: t("settings.timeline.notifications.deleteFailedMessage", { message: "" }),
          color: "red",
        });
      }
    },
    [t],
  );

  const copyDayEvents = useCallback((day: number) => setCopyDay(day), []);

  const pasteDayEvents = useCallback(
    async (targetDay: number) => {
      if (copyDay === null) return;
      const source = eventsByDay.get(copyDay) ?? [];
      for (const ev of source) {
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
    },
    [copyDay, eventsByDay, saveEvent],
  );

  const saveMode = useCallback(async () => {
    const trimmed = newModeName.trim();
    if (!trimmed) {
      notifications.show({
        title: t("settings.timeline.notifications.validationFailedTitle"),
        message: t("settings.timeline.notifications.modeNameRequired", { defaultValue: "Mode name is required" }),
        color: "red",
      });
      return;
    }
    if (newModePower !== undefined && (Number.isNaN(newModePower) || newModePower < 0 || newModePower > 100)) {
      notifications.show({
        title: t("settings.timeline.notifications.validationFailedTitle"),
        message: t("settings.timeline.notifications.invalidPower", { defaultValue: "Power must be between 0 and 100" }),
        color: "red",
      });
      return;
    }
    if (
      newModeTemperature !== undefined &&
      (Number.isNaN(newModeTemperature) || newModeTemperature < -50 || newModeTemperature > 100)
    ) {
      notifications.show({
        title: t("settings.timeline.notifications.validationFailedTitle"),
        message: t("settings.timeline.notifications.invalidTemperature", {
          defaultValue: "Temperature must be between -50 and 100",
        }),
        color: "red",
      });
      return;
    }
    setSavingMode(true);
    try {
      const payload = {
        name: trimmed,
        power: newModePower,
        temperature: newModeTemperature,
        color: newModeColor || undefined,
        luftatorConfig: Object.keys(cleanedValveOpenings).length ? cleanedValveOpenings : undefined,
      };
      const isEdit = Boolean(editingMode?.id);
      const res = await fetch(
        resolveApiUrl(isEdit ? `/api/timeline/modes/${editingMode?.id}` : "/api/timeline/modes"),
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const detail = await res.text();
        notifications.show({
          title: t("settings.timeline.notifications.saveFailedTitle"),
          message: detail || t("settings.timeline.notifications.saveFailedMessage"),
          color: "red",
        });
        return;
      }
      const saved = (await res.json()) as Mode;
      setModes((prev) => {
        if (isEdit) {
          return prev.map((m) => (m.id === saved.id ? saved : m));
        }
        return [...prev, saved];
      });
      setNewModeName("");
      setNewModePower(undefined);
      setNewModeTemperature(undefined);
      setNewModeColor("");
      setEditingMode(null);
      setModeModalOpen(false);
      setValveOpenings({});
      notifications.show({
        title: t("settings.timeline.notifications.saveSuccessTitle"),
        message: t(
          isEdit ? "settings.timeline.notifications.modeUpdated" : "settings.timeline.notifications.modeCreated",
          { defaultValue: isEdit ? "Mode updated" : "Mode created" },
        ),
        color: "green",
      });
    } catch {
      notifications.show({
        title: t("settings.timeline.notifications.saveFailedTitle"),
        message: t("settings.timeline.notifications.saveFailedMessage"),
        color: "red",
      });
    } finally {
      setSavingMode(false);
    }
  }, [newModeName, newModePower, newModeTemperature, newModeColor, cleanedValveOpenings, editingMode, t]);

  const deleteMode = useCallback(
    async (id: number) => {
      try {
        const res = await fetch(resolveApiUrl(`/api/timeline/modes/${id}`), { method: "DELETE" });
        if (!res.ok) {
          const detail = await res.text();
          notifications.show({
            title: t("settings.timeline.notifications.deleteFailedTitle"),
            message: detail || t("settings.timeline.notifications.deleteFailedMessage", { message: detail }),
            color: "red",
          });
          return;
        }
        setModes((prev) => prev.filter((m) => m.id !== id));
        notifications.show({
          title: t("settings.timeline.notifications.deleteSuccessTitle"),
          message: t("settings.timeline.notifications.deleteSuccessMessage", { defaultValue: "Mode deleted" }),
          color: "green",
        });
      } catch {
        notifications.show({
          title: t("settings.timeline.notifications.deleteFailedTitle"),
          message: t("settings.timeline.notifications.deleteFailedMessage", { message: "" }),
          color: "red",
        });
      }
    },
    [t],
  );

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Title order={2}>{t("settings.timeline.title")}</Title>
        <Text c="dimmed">{t("settings.timeline.description")}</Text>
      </Stack>

      <Card withBorder radius="md" padding="md">
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={4}>{t("settings.timeline.modesTitle", { defaultValue: "Modes" })}</Title>
            <Button
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() => {
                setEditingMode(null);
                setNewModeName("");
                setNewModePower(undefined);
                setNewModeTemperature(undefined);
                setNewModeColor("");
                setValveOpenings({});
                setModeModalOpen(true);
              }}
            >
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
                          onClick={() => {
                            setEditingMode(m);
                            setNewModeName(m.name);
                            setNewModePower(m.power);
                            setNewModeTemperature(m.temperature);
                            setNewModeColor(m.color ?? "");
                            setValveOpenings(m.luftatorConfig ?? {});
                            setModeModalOpen(true);
                          }}
                        >
                          <IconEdit size={14} />
                        </ActionIcon>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          aria-label="Delete mode"
                          onClick={() => void deleteMode(m.id)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {t("settings.timeline.hru")}: {m.power ?? "-"}% {m.temperature !== undefined ? ` | ${m.temperature}°C` : ""}
                    </Text>
                  </Stack>
                </Card>
              ))}
            </Group>
          )}
        </Stack>
      </Card>

      <Card withBorder padding="md" radius="md">
        <Group gap="sm" wrap="wrap">
          <Text size="sm" c="dimmed">
            {t("settings.timeline.copyHint", { defaultValue: "Copy a day and paste to another." })}
          </Text>
          {copyDay !== null && (
            <Group gap="xs">
              <Text size="sm">{t("settings.timeline.copying", { defaultValue: "Copying", day: dayLabels[copyDay] })}</Text>
              <Button size="xs" variant="light" onClick={() => setCopyDay(null)}>
                {t("settings.timeline.modal.cancel")}
              </Button>
            </Group>
          )}
        </Group>
      </Card>

      <Stack gap="md">
        {dayOrder.map((dayIdx) => {
          const dayEvents = eventsByDay.get(dayIdx) ?? [];
          return (
            <Card key={dayIdx} withBorder radius="md" padding="md">
              <Group justify="space-between" mb="xs">
                <Title order={4}>{dayLabels[dayIdx]}</Title>
                <Group gap="xs">
                  {copyDay === null ? (
                    <Tooltip label={t("settings.timeline.copyDay", { defaultValue: "Copy day" })} withArrow>
                      <ActionIcon variant="light" aria-label="Copy day" onClick={() => copyDayEvents(dayIdx)}>
                        <IconCopy size={16} />
                      </ActionIcon>
                    </Tooltip>
                  ) : copyDay === dayIdx ? (
                    <Tooltip label={t("settings.timeline.modal.cancel")} withArrow>
                      <ActionIcon variant="light" color="red" aria-label="Cancel copy" onClick={() => setCopyDay(null)}>
                        <IconClipboardCheck size={16} />
                      </ActionIcon>
                    </Tooltip>
                  ) : (
                    <Tooltip label={t("settings.timeline.pasteDay", { defaultValue: "Paste day" })} withArrow>
                      <ActionIcon variant="light" aria-label="Paste day" onClick={() => void pasteDayEvents(dayIdx)}>
                        <IconClipboardCheck size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => openNew(dayIdx)} disabled={loading || modes.length === 0}>
                    {t("settings.timeline.addEvent")}
                  </Button>
                </Group>
              </Group>

              {dayEvents.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {t("settings.timeline.noEvents")}
                </Text>
              ) : (
                <Stack gap="xs">
                  {dayEvents.map((ev) => (
                    <Card key={ev.id ?? `${ev.startTime}-${ev.hruConfig?.mode}`} withBorder padding="sm" radius="md">
                      <Group justify="space-between" align="center">
                        <Stack gap={2} style={{ flex: 1 }}>
                          <Text fw={600}>
                            {ev.startTime} – {ev.endTime}
                          </Text>
                          <Text size="sm" c="dimmed">
                            {t("settings.timeline.hru")}:{" "}
                            {modes.find((m) => m.id.toString() === ev.hruConfig?.mode?.toString())?.name ?? ev.hruConfig?.mode ?? "-"}
                          </Text>
                        </Stack>
                        <Group gap="xs">
                          <Switch
                            size="sm"
                            checked={ev.enabled}
                            onChange={(e) => {
                              const enabled = e.currentTarget.checked;
                              setEvents((prev) => prev.map((x) => (x.id === ev.id ? { ...x, enabled } : x)));
                              void saveEvent({ ...ev, enabled });
                            }}
                          />
                          <ActionIcon
                            variant="light"
                            aria-label="Edit"
                            onClick={() => {
                              setSelectedDay(ev.dayOfWeek);
                              setEditingEvent(ev);
                              setModalOpen(true);
                            }}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                          <ActionIcon variant="light" color="red" aria-label="Delete" onClick={() => void deleteEvent(ev.id)}>
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      </Group>
                    </Card>
                  ))}
                </Stack>
              )}
            </Card>
          );
        })}
      </Stack>

      <Modal
        opened={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingEvent(null);
        }}
        title={t("settings.timeline.modal.title")}
        size="md"
      >
        {editingEvent && (
          <Stack gap="md">
            <Group grow>
              <TextInput
                label={t("settings.timeline.form.startTime")}
                placeholder="08:00"
                value={editingEvent.startTime}
                onChange={(e) => setEditingEvent({ ...editingEvent, startTime: e.target.value })}
                pattern={TIME_REGEX.source}
                required
              />
              <TextInput
                label={t("settings.timeline.form.endTime")}
                placeholder="08:30"
                value={editingEvent.endTime}
                onChange={(e) => setEditingEvent({ ...editingEvent, endTime: e.target.value })}
                pattern={TIME_REGEX.source}
                required
              />
            </Group>

            <Select
              label={t("schedule.modeSelect", { defaultValue: "Select mode" })}
              data={modeOptions}
              value={editingEvent.hruConfig?.mode?.toString() ?? ""}
              onChange={(value) =>
                setEditingEvent({
                  ...editingEvent,
                  hruConfig: { ...(editingEvent.hruConfig ?? {}), mode: value ?? undefined },
                })
              }
              searchable
              required
            />

            <Divider />

            <Group justify="flex-end" gap="sm">
              <Button
                variant="light"
                onClick={() => {
                  setModalOpen(false);
                  setEditingEvent(null);
                }}
              >
                {t("settings.timeline.modal.cancel")}
              </Button>
              <Button
                onClick={() => {
                  if (editingEvent) {
                    void saveEvent({ ...editingEvent, dayOfWeek: selectedDay ?? editingEvent.dayOfWeek });
                  }
                }}
                loading={saving}
              >
                {t("settings.timeline.modal.save")}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <Modal
        opened={modeModalOpen}
        onClose={() => setModeModalOpen(false)}
        title={t("settings.timeline.modeDialogTitle", { defaultValue: "Create mode" })}
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label={t("settings.timeline.modeName", { defaultValue: "Mode name" })}
            placeholder={t("settings.timeline.modePlaceholder", { defaultValue: "e.g., Comfort" })}
            value={newModeName}
            onChange={(e) => setNewModeName(e.target.value)}
            required
          />
          <Group grow>
            <NumberInput
              label={t("settings.timeline.modePower", { defaultValue: "Power (%)" })}
              placeholder="50"
              value={newModePower}
              onChange={(value) => setNewModePower(typeof value === "number" ? value : undefined)}
              min={0}
              max={100}
              step={1}
            />
            <NumberInput
              label={t("settings.timeline.modeTemperature", { defaultValue: "Temperature (°C)" })}
              placeholder="21"
              value={newModeTemperature}
              onChange={(value) => setNewModeTemperature(typeof value === "number" ? value : undefined)}
              min={-50}
              max={100}
              step={0.5}
            />
          </Group>

          {valves.length > 0 && (
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                {t("settings.timeline.modeValves", { defaultValue: "Valve openings (%)" })}
              </Text>
              {valves.map((v, idx) => {
                const key = v.entityId || v.name || `valve-${idx}`;
                const label = v.name || v.entityId || `Valve ${idx + 1}`;
                return (
                <NumberInput
                  key={key}
                  label={label}
                  placeholder="e.g., 50"
                  value={valveOpenings[v.entityId] ?? ""}
                  onChange={(value) =>
                    setValveOpenings((prev) => ({
                      ...prev,
                      [v.entityId || key]: typeof value === "number" ? value : undefined,
                    }))
                  }
                  min={0}
                  max={100}
                  step={1}
                />
              );
              })}
            </Stack>
          )}
          <TextInput
            label={t("settings.timeline.modeColor", { defaultValue: "Color (optional)" })}
            placeholder="#228be6 or blue"
            value={newModeColor}
            onChange={(e) => setNewModeColor(e.target.value)}
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="light" onClick={() => setModeModalOpen(false)}>
              {t("settings.timeline.modal.cancel")}
            </Button>
            <Button onClick={() => void saveMode()} loading={savingMode}>
              {t("settings.timeline.modeCreateAction", { defaultValue: "Create" })}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
