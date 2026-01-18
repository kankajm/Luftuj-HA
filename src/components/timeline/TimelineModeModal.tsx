import { Modal, Stack, TextInput, Group, NumberInput, Text, Button } from "@mantine/core";
import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import type { Mode } from "../../types/timeline";
import type { Valve } from "../../types/valve";

interface TimelineModeModalProps {
  opened: boolean;
  mode: Mode | null; // if null, creating new
  valves: Valve[];
  saving: boolean;
  onClose: () => void;
  onSave: (mode: Partial<Mode>) => void;
  t: TFunction;
  hruCapabilities?: {
    supportsPowerWrite?: boolean;
    supportsTemperatureWrite?: boolean;
  };
  powerUnit?: string;
  temperatureUnit?: string;
}

export function TimelineModeModal({
  opened,
  mode,
  valves,
  saving,
  onClose,
  onSave,
  t,
  hruCapabilities,
  powerUnit = "%",
  temperatureUnit = "°C",
}: TimelineModeModalProps) {
  const [name, setName] = useState("");
  const [power, setPower] = useState<number | undefined>(undefined);
  const [temperature, setTemperature] = useState<number | undefined>(undefined);
  const [color, setColor] = useState("");
  const [valveOpenings, setValveOpenings] = useState<Record<string, number | undefined>>({});

  useEffect(() => {
    if (opened) {
      if (mode) {
        setName(mode.name);
        setPower(mode.power);
        setTemperature(mode.temperature);
        setColor(mode.color ?? "");
        setValveOpenings(mode.luftatorConfig ?? {});
      } else {
        setName("");
        setPower(undefined);
        setTemperature(undefined);
        setColor("");
        setValveOpenings({});
      }
    }
  }, [opened, mode]);

  function handleSave() {
    // Filter undefined/invalid
    const cleanedValveOpenings = Object.fromEntries(
      Object.entries(valveOpenings).filter(
        ([, value]) =>
          typeof value === "number" && !Number.isNaN(value) && value >= 0 && value <= 100,
      ),
    ) as Record<string, number>;

    onSave({
      id: mode?.id, // undefined if creating
      name,
      power,
      temperature,
      color: color || undefined,
      luftatorConfig: Object.keys(cleanedValveOpenings).length ? cleanedValveOpenings : undefined,
    });
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("settings.timeline.modeDialogTitle", { defaultValue: "Create mode" })}
      size="md"
    >
      <Stack gap="md">
        <TextInput
          label={t("settings.timeline.modeName", { defaultValue: "Mode name" })}
          placeholder={t("settings.timeline.modePlaceholder", { defaultValue: "e.g., Comfort" })}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Group grow>
          {hruCapabilities?.supportsPowerWrite !== false && (
            <NumberInput
              label={`${t("settings.timeline.modePower", { defaultValue: "Power" })} (${powerUnit})`}
              placeholder="50"
              value={power}
              onChange={(value) => setPower(typeof value === "number" ? value : undefined)}
              min={0}
              max={100}
              step={1}
            />
          )}
          {hruCapabilities?.supportsTemperatureWrite !== false && (
            <NumberInput
              label={`${t("settings.timeline.modeTemperature", { defaultValue: "Temperature" })} (${temperatureUnit})`}
              placeholder="21"
              value={temperature}
              onChange={(value) => setTemperature(typeof value === "number" ? value : undefined)}
              min={-50}
              max={100}
              step={0.5}
            />
          )}
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
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
        <Group justify="flex-end" gap="sm">
          <Button variant="light" onClick={onClose}>
            {t("settings.timeline.modal.cancel")}
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {t(mode ? "settings.timeline.modeUpdateAction" : "settings.timeline.modeCreateAction", {
              defaultValue: mode ? "Update" : "Create",
            })}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
