import { useState, useCallback } from "react";
import { notifications } from "@mantine/notifications";
import type { TFunction } from "i18next";
import type { Mode } from "../types/timeline";
import * as api from "../api/timeline";

export function useTimelineModes(t: TFunction) {
  const [modes, setModes] = useState<Mode[]>([]);
  const [savingMode, setSavingMode] = useState(false);

  const loadModes = useCallback(async () => {
    try {
      const data = await api.fetchTimelineModes();
      setModes(data);
    } catch {
      notifications.show({
        title: t("settings.timeline.notifications.loadFailedTitle"),
        message: t("settings.timeline.notifications.loadFailedModes", {
          defaultValue: "Failed to load modes",
        }),
        color: "red",
      });
    }
  }, [t]);

  const saveMode = useCallback(
    async (mode: Partial<Mode>) => {
      setSavingMode(true);
      try {
        let saved: Mode;
        const isEdit = typeof mode.id === "number";

        if (isEdit) {
          saved = await api.updateTimelineMode(mode as Mode);
        } else {
          saved = await api.createTimelineMode(mode as Omit<Mode, "id">);
        }

        setModes((prev) => {
          if (isEdit) {
            return prev.map((m) => (m.id === saved.id ? saved : m));
          }
          return [...prev, saved];
        });

        notifications.show({
          title: t("settings.timeline.notifications.saveSuccessTitle"),
          message: t(
            isEdit
              ? "settings.timeline.notifications.modeUpdated"
              : "settings.timeline.notifications.modeCreated",
            { defaultValue: isEdit ? "Mode updated" : "Mode created" },
          ),
          color: "green",
        });
        return true;
      } catch (err) {
        notifications.show({
          title: t("settings.timeline.notifications.saveFailedTitle"),
          message:
            err instanceof Error
              ? err.message
              : t("settings.timeline.notifications.saveFailedMessage"),
          color: "red",
        });
        return false;
      } finally {
        setSavingMode(false);
      }
    },
    [t],
  );

  const deleteMode = useCallback(
    async (id: number) => {
      try {
        await api.deleteTimelineMode(id);
        setModes((prev) => prev.filter((m) => m.id !== id));
        notifications.show({
          title: t("settings.timeline.notifications.modeDeleteSuccessTitle"),
          message: t("settings.timeline.notifications.modeDeleteSuccessMessage", {
            defaultValue: "Mode deleted",
          }),
          color: "green",
        });
      } catch (err) {
        notifications.show({
          title: t("settings.timeline.notifications.deleteFailedTitle"),
          message:
            err instanceof Error
              ? err.message
              : t("settings.timeline.notifications.deleteFailedMessage"),
          color: "red",
        });
      }
    },
    [t],
  );

  return { modes, loadModes, saveMode, deleteMode, savingMode };
}
