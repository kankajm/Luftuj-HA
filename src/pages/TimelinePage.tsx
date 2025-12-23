import { useCallback, useMemo, useState, useEffect } from "react";
import { Button, Card, Group, Stack, Text, Title, Modal, Switch, TextInput, NumberInput, Select } from "@mantine/core";
import { IconPlus, IconEdit, IconTrash } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";

import { resolveApiUrl } from "../utils/api";

import { Calendar, dateFnsLocalizer, type SlotInfo } from "react-big-calendar";
import {
  addDays,
  format,
  getDay,
  parse,
  startOfDay,
  setHours,
  setMinutes,
  startOfWeek,
} from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { cs as csLocale } from "date-fns/locale/cs";
import "react-big-calendar/lib/css/react-big-calendar.css";

const TIME_REGEX = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

interface TimelineEvent {
  id?: number;
  startTime: string;
  endTime: string;
  dayOfWeek: number | null;
  hruConfig?: {
    mode?: string;
    power?: number;
    temperature?: number;
  } | null;
  luftatorConfig?: Record<string, number> | null;
  enabled: boolean;
  priority: number;
}

interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  resource: TimelineEvent;
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
  priority?: number;
}

interface WindowWithTimelineEvents extends Window {
  __timelineCalendarEvents?: CalendarEvent[];
}

const locales = {
  en: enUS,
  cs: csLocale,
};

const calendarLocalizer = dateFnsLocalizer({
  format,
  parse,
    getDay,
  locales,
});

export function TimelinePage() {
  const { t, i18n } = useTranslation();
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  const dayOptions = useMemo(
    () => [
      { label: t("settings.timeline.allDays"), value: "" },
      { label: t("settings.timeline.monday"), value: "1" },
      { label: t("settings.timeline.tuesday"), value: "2" },
      { label: t("settings.timeline.wednesday"), value: "3" },
      { label: t("settings.timeline.thursday"), value: "4" },
      { label: t("settings.timeline.friday"), value: "5" },
      { label: t("settings.timeline.saturday"), value: "6" },
      { label: t("settings.timeline.sunday"), value: "0" },
    ],
    [t],
  );

  function formatDayOfWeek(day: number | null): string {
    const option = dayOptions.find((opt) => opt.value === (day === null ? "" : day.toString()));
    return option?.label || t("settings.timeline.allDays");
  }

  // Load timeline events and valves on mount
  useEffect(() => {
    async function loadTimelineData() {
      setLoadingEvents(true);
      try {
        const eventsRes = await fetch(resolveApiUrl("/api/timeline/events"));
        if (!eventsRes.ok) return;

        const rawEvents = (await eventsRes.json()) as ApiTimelineEvent[];
        const normalisedEvents: TimelineEvent[] = rawEvents.map((e) => ({
          id: e.id,
          startTime: e.startTime ?? e.start_time ?? "",
          endTime: e.endTime ?? e.end_time ?? "",
          dayOfWeek: e.dayOfWeek ?? e.day_of_week ?? null,
          hruConfig: e.hruConfig ?? e.hru_config ?? null,
          luftatorConfig: e.luftatorConfig ?? e.luftator_config ?? null,
          enabled: e.enabled ?? true,
          priority: e.priority ?? 0,
        }));
        setTimelineEvents(normalisedEvents);
      } catch {
        notifications.show({
          title: t("settings.timeline.notifications.loadFailedTitle"),
          message: t("settings.timeline.notifications.loadFailedMessage"),
          color: "red",
        });
      } finally {
        setLoadingEvents(false);
      }
    }
    void loadTimelineData();
  }, [t]);

  // Timeline event management functions
  async function saveTimelineEventImpl(event: TimelineEvent | null) {
    if (!event) return;
    
    setSavingEvent(true);
    try {
      const response = await fetch(resolveApiUrl("/api/timeline/events"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
      if (!response.ok) {
        const detail = await response.text();
        notifications.show({
          title: t("settings.timeline.notifications.saveFailedTitle"),
          message: t("settings.timeline.notifications.saveFailedMessage", { message: detail }),
          color: "red",
        });
        return;
      }
      
      // Refetch events to update list
      const eventsRes = await fetch(resolveApiUrl("/api/timeline/events"));
      if (eventsRes.ok) {
        const events = await eventsRes.json();
        setTimelineEvents(events);
      }
      
      setModalOpen(false);
      setEditingEvent(null);
      
      notifications.show({
        title: t("settings.timeline.notifications.saveSuccessTitle"),
        message: t("settings.timeline.notifications.saveSuccessMessage"),
        color: "green",
      });
    } catch (error) {
      notifications.show({
        title: t("settings.timeline.notifications.saveFailedTitle"),
        message: t("settings.timeline.notifications.saveFailedMessage", { 
          message: error instanceof Error ? error.message : t("settings.timeline.notifications.unknown") 
        }),
        color: "red",
      });
    } finally {
      setSavingEvent(false);
    }
  }
  const saveTimelineEvent = useCallback(saveTimelineEventImpl, [t]);

  async function deleteTimelineEventImpl(id: number) {
    try {
      const response = await fetch(resolveApiUrl(`/api/timeline/events/${id}`), {
        method: "DELETE",
      });
      if (!response.ok) {
        const detail = await response.text();
        notifications.show({
          title: t("settings.timeline.notifications.deleteFailedTitle"),
          message: t("settings.timeline.notifications.deleteFailedMessage", { message: detail }),
          color: "red",
        });
        return;
      }
      
      // Update local state
      setTimelineEvents((prev) => prev.filter((event) => event.id !== id));
      
      notifications.show({
        title: t("settings.timeline.notifications.deleteSuccessTitle"),
        message: t("settings.timeline.notifications.deleteSuccessMessage"),
        color: "green",
      });
    } catch (error) {
      notifications.show({
        title: t("settings.timeline.notifications.deleteFailedTitle"),
        message: t("settings.timeline.notifications.deleteFailedMessage", { 
          message: error instanceof Error ? error.message : t("settings.timeline.notifications.unknown") 
        }),
        color: "red",
      });
    }
  }
  const deleteTimelineEvent = useCallback(deleteTimelineEventImpl, [t]);

  async function toggleEventEnabledImpl(id: number, enabled: boolean) {
    const event = timelineEvents.find((e) => e.id === id);
    if (!event) return;
    
    try {
      const response = await fetch(resolveApiUrl("/api/timeline/events"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...event, enabled }),
      });
      if (!response.ok) {
        // Revert on failure
        setTimelineEvents((prev) => 
          prev.map((e) => (e.id === id ? { ...e, enabled: !enabled } : e))
        );
        notifications.show({
          title: t("settings.timeline.notifications.toggleFailedTitle"),
          message: t("settings.timeline.notifications.toggleFailedMessage"),
          color: "red",
        });
        return;
      }
      
      // Update local state
      setTimelineEvents((prev) => 
        prev.map((e) => (e.id === id ? { ...e, enabled } : e))
      );
    } catch {
      // Revert on failure
      setTimelineEvents((prev) => 
        prev.map((e) => (e.id === id ? { ...e, enabled: !enabled } : e))
      );
      notifications.show({
        title: t("settings.timeline.notifications.toggleFailedTitle"),
        message: t("settings.timeline.notifications.toggleFailedMessage"),
        color: "red",
      });
    }
  }
  const toggleEventEnabled = useCallback(toggleEventEnabledImpl, [timelineEvents, t]);

  const culture = i18n.language.startsWith("cs") ? "cs" : "en";

  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    // Use Monday as the start of the visual week for the *currently visible* calendar week
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });

    const events: CalendarEvent[] = [];

    for (const event of timelineEvents) {
      // In the visual calendar we always show events on every weekday (Mon–Fri)
      const weekdayKeys: number[] = [1, 2, 3, 4, 5]; // 1 = Monday ... 5 = Friday

      for (const day of weekdayKeys) {
        const offsetFromMonday = day - 1; // Monday -> +0, Tuesday -> +1, ...
        const dayDate = addDays(weekStart, offsetFromMonday);

        const [startHour, startMinute] = event.startTime.split(":").map(Number);
        const [endHour, endMinute] = event.endTime.split(":").map(Number);

        const startDate = setHours(setMinutes(dayDate, startMinute), startHour);
        let endDate = setHours(setMinutes(dayDate, endMinute), endHour);

        // Avoid zero-length or negative duration events
        if (endDate <= startDate) {
          endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
        }

        events.push({
          id: event.id ?? Math.random(),
          title: `${event.startTime} - ${event.endTime}`,
          start: startDate,
          end: endDate,
          resource: event,
        });
      }
    }

    // Dev-time debug: expose events for inspection in browser console
    if (import.meta.env.DEV && typeof window !== "undefined") {
      (window as WindowWithTimelineEvents).__timelineCalendarEvents = events;
    }

    return events;
  }, [timelineEvents, currentDate]);

  function handleSelectSlotImpl(slotInfo: SlotInfo) {
    const startDate = slotInfo.start as Date;
    const endDate = slotInfo.end as Date;

    function pad(n: number) {
      return n.toString().padStart(2, "0");
    }

    const startTime = `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`;
    const endTime = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;

    const dayOfWeek = startDate.getDay();

    setEditingEvent({
      startTime,
      endTime,
      dayOfWeek,
      hruConfig: null,
      luftatorConfig: null,
      enabled: true,
      priority: 0,
    });
    setModalOpen(true);
  }
  const handleSelectSlot = useCallback(handleSelectSlotImpl, []);

  function handleSelectEventImpl(event: CalendarEvent) {
    setEditingEvent(event.resource);
    setModalOpen(true);
  }
  const handleSelectEvent = useCallback(handleSelectEventImpl, []);

  function eventPropGetterImpl(event: CalendarEvent) {
    const enabled = event.resource.enabled;
    return {
      style: {
        backgroundColor: enabled
          ? "var(--mantine-color-blue-6)"
          : "var(--mantine-color-gray-6)",
        borderRadius: 4,
        border: "none",
        color: "white",
        opacity: enabled ? 1 : 0.8,
        fontSize: "0.75rem",
      },
    };
  }
  const eventPropGetter = useCallback(eventPropGetterImpl, []);

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Title order={2}>{t("settings.timeline.title")}</Title>
        <Text c="dimmed">{t("settings.timeline.description")}</Text>
      </Stack>

      <Card withBorder padding="lg" radius="md">
        <Group justify="space-between" mb="md">
          <Title order={4}>Weekly Schedule</Title>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              setEditingEvent({
                startTime: "09:00",
                endTime: "17:00",
                dayOfWeek: null,
                hruConfig: null,
                luftatorConfig: null,
                enabled: true,
                priority: 0,
              });
              setModalOpen(true);
            }}
            disabled={loadingEvents}
          >
            {t("settings.timeline.addEvent")}
          </Button>
        </Group>
        {/* Debug info to verify calendar event mapping */}
        {import.meta.env.DEV && (
          <Text size="xs" c="dimmed" mb="xs">
            Debug: {calendarEvents.length} calendar event(s)
            {calendarEvents.length > 0 &&
              ` | first: ${calendarEvents[0].start.toString()} → ${calendarEvents[0].end.toString()}`}
          </Text>
        )}
        <div style={{ height: 700 }}>
          <Calendar<CalendarEvent>
            localizer={calendarLocalizer}
            events={calendarEvents}
            culture={culture}
            defaultView="work_week"
            views={["work_week"]}
            date={currentDate}
            onNavigate={(date) => setCurrentDate(date)}
            step={30}
            timeslots={1}
            selectable
            startAccessor={(event) => (event as CalendarEvent).start}
            endAccessor={(event) => (event as CalendarEvent).end}
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            eventPropGetter={eventPropGetter}
            min={setHours(startOfDay(currentDate), 0)}
            max={setHours(startOfDay(currentDate), 23)}
          />
        </div>
      </Card>

      {/* Events List */}
      <Card withBorder padding="lg" radius="md">
        <Title order={4} mb="md">All Events</Title>
        {loadingEvents ? (
          <Text c="dimmed">{t("settings.timeline.loading")}</Text>
        ) : timelineEvents.length === 0 ? (
          <Text c="dimmed">{t("settings.timeline.noEvents")}</Text>
        ) : (
          <Stack gap="sm">
            {timelineEvents.map((event) => (
              <Card key={event.id} withBorder padding="sm" radius="md">
                <Group justify="space-between">
                  <Stack gap="xs" style={{ flex: 1 }}>
                    <Group>
                      <Text fw={500}>
                        {event.startTime} - {event.endTime}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {formatDayOfWeek(event.dayOfWeek)}
                      </Text>
                      <Text size="sm" c={event.enabled ? "green" : "red"}>
                        {event.enabled ? t("settings.timeline.enabled") : t("settings.timeline.disabled")}
                      </Text>
                    </Group>
                    {(event.hruConfig || event.luftatorConfig) && (
                      <Text size="xs" c="dimmed">
                        {event.hruConfig && `${t("settings.timeline.hru")}: ${event.hruConfig.mode || "-"}, ${event.hruConfig.power || "-"}%, ${event.hruConfig.temperature || "-"}°C`}
                        {event.hruConfig && event.luftatorConfig && ", "}
                        {event.luftatorConfig && `${t("settings.timeline.valves")}: ${Object.keys(event.luftatorConfig).length}`}
                      </Text>
                    )}
                  </Stack>
                  <Group gap="xs">
                    <Switch
                      checked={event.enabled}
                      onChange={(e) => {
                        const enabled = e.currentTarget.checked;
                        // Optimistic update
                        setTimelineEvents((prev) => 
                          prev.map((e) => (e.id === event.id ? { ...e, enabled } : e))
                        );
                        void toggleEventEnabled(event.id!, enabled);
                      }}
                      size="sm"
                    />
                    <Button
                      size="sm"
                      variant="light"
                      leftSection={<IconEdit size={14} />}
                      onClick={() => {
                        setEditingEvent(event);
                        setModalOpen(true);
                      }}
                    >
                      {t("settings.timeline.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="light"
                      color="red"
                      leftSection={<IconTrash size={14} />}
                      onClick={() => {
                        if (confirm(t("settings.timeline.confirmDelete"))) {
                          void deleteTimelineEvent(event.id!);
                        }
                      }}
                    >
                      {t("settings.timeline.delete")}
                    </Button>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        )}
      </Card>

      {/* Timeline Event Modal */}
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
                placeholder="09:00"
                value={editingEvent.startTime}
                onChange={(e) => {
                  setEditingEvent({ ...editingEvent, startTime: e.target.value });
                }}
                pattern="^([0-1][0-9]|2[0-3]):[0-5][0-9]$"
                required
              />
              <TextInput
                label={t("settings.timeline.form.endTime")}
                placeholder="17:00"
                value={editingEvent.endTime}
                onChange={(e) => {
                  setEditingEvent({ ...editingEvent, endTime: e.target.value });
                }}
                pattern="^([0-1][0-9]|2[0-3]):[0-5][0-9]$"
                required
              />
            </Group>
            
            <Select
              label={t("settings.timeline.form.dayOfWeek")}
              data={dayOptions}
              value={editingEvent.dayOfWeek?.toString() ?? ""}
              onChange={(value) => {
                setEditingEvent({ 
                  ...editingEvent, 
                  dayOfWeek: value === "" ? null : Number(value) 
                });
              }}
              clearable
            />
            
            <NumberInput
              label={t("settings.timeline.form.priority")}
              description={t("settings.timeline.priorityDescription")}
              value={editingEvent.priority}
              onChange={(value) => {
                const numericValue = typeof value === "number" ? value : Number(value ?? 0);
                setEditingEvent({ ...editingEvent, priority: Number.isFinite(numericValue) ? numericValue : 0 });
              }}
              min={0}
              max={100}
              step={1}
            />
            
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
                  // Basic validation
                  if (!TIME_REGEX.test(editingEvent.startTime) || !TIME_REGEX.test(editingEvent.endTime)) {
                    notifications.show({
                      title: t("settings.timeline.notifications.validationFailedTitle"),
                      message: t("settings.timeline.notifications.invalidTimeFormat"),
                      color: "red",
                    });
                    return;
                  }
                  
                  // Check start < end
                  const [startHour, startMin] = editingEvent.startTime.split(":").map(Number);
                  const [endHour, endMin] = editingEvent.endTime.split(":").map(Number);
                  const startMinutes = startHour * 60 + startMin;
                  const endMinutes = endHour * 60 + endMin;
                  
                  if (startMinutes >= endMinutes) {
                    notifications.show({
                      title: t("settings.timeline.notifications.validationFailedTitle"),
                      message: t("settings.timeline.notifications.startTimeBeforeEnd"),
                      color: "red",
                    });
                    return;
                  }
                  
                  void saveTimelineEvent(editingEvent);
                }}
                loading={savingEvent}
              >
                {t("settings.timeline.modal.save")}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
