import { Badge, Card, Group, Slider, Stack, Text, Title } from "@mantine/core";

import type { Valve } from "../types/valve";

export interface ValveCardProps {
  valve: Valve;
  formatValue: (value: number) => string;
  marks: { value: number; label: string }[];
  onPreview: (entityId: string, value: number) => void;
  onCommit: (entityId: string, value: number) => void | Promise<void>;
}

export function ValveCard({ valve, formatValue, marks, onPreview, onCommit }: ValveCardProps) {
  return (
    <Card shadow="sm" radius="md" padding="lg" withBorder>
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Title order={4}>{valve.name}</Title>
          <Badge size="lg" variant="light" color="blue">
            {formatValue(valve.value)}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          {valve.entityId}
        </Text>
        <Slider
          value={valve.value}
          min={valve.min}
          max={valve.max}
          step={valve.step}
          marks={marks}
          label={formatValue}
          onChange={(value) => onPreview(valve.entityId, value)}
          onChangeEnd={(value) => {
            void onCommit(valve.entityId, value);
          }}
        />
      </Stack>
    </Card>
  );
}
