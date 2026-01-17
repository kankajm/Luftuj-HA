import { Badge, Card, Group, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

interface StatusCardProps {
  title: string;
  description: string;
  status: "success" | "warning" | "error" | "neutral";
  statusLabel: string;
  children?: ReactNode;
}

export function StatusCard({ title, description, status, statusLabel, children }: StatusCardProps) {
  const color =
    status === "success"
      ? "green"
      : status === "warning"
        ? "yellow"
        : status === "error"
          ? "red"
          : "gray";

  return (
    <Card shadow="sm" padding="lg" withBorder>
      <Group justify="space-between" align="center">
        <Title order={4}>{title}</Title>
        <Badge color={color} variant="light" size="lg">
          {statusLabel}
        </Badge>
      </Group>
      {children}
      <Text size="sm" c="dimmed" mt={children ? "xs" : 0}>
        {description}
      </Text>
    </Card>
  );
}
