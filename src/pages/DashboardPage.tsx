import { Badge, Card, Container, Group, Stack, Text, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveApiUrl, resolveWebSocketUrl } from "../utils/api";

export function DashboardPage() {
  const { t } = useTranslation();
  const [haStatus, setHaStatus] = useState<
    "connected" | "connecting" | "disconnected" | "offline"
  >("offline");
  const [haLoading, setHaLoading] = useState(true);

  // Modbus probe configuration (defaults to localhost:502 when env vars are absent)
  const modbusHost = (import.meta.env.VITE_MODBUS_HOST as string | undefined) ?? "localhost";
  const modbusPortRaw = import.meta.env.VITE_MODBUS_PORT as string | number | undefined;
  const modbusPort =
    typeof modbusPortRaw === "string"
      ? Number.parseInt(modbusPortRaw, 10)
      : (modbusPortRaw as number | undefined) ?? 502;
  const [modbusStatus, setModbusStatus] = useState<"loading" | "reachable" | "unreachable">("loading");

  // HA status via REST (fallback)
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch(resolveApiUrl("/api/status"));
        if (!res.ok) {
          setHaLoading(false);
          return;
        }
        const data = (await res.json()) as { ha?: { connection?: string } };
        if (!active) return;
        const s = data.ha?.connection;
        if (s === "connected" || s === "connecting" || s === "disconnected" || s === "offline") {
          setHaStatus(s);
        }
        setHaLoading(false);
      } catch {
        setHaLoading(false);
      }
    }
    void load();
    const id = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // Modbus reachability probe (polling)
  useEffect(() => {
    let active = true;
    async function probe() {
      try {
        const url = resolveApiUrl(`/api/modbus/status?host=${encodeURIComponent(modbusHost)}&port=${modbusPort}`);
        const res = await fetch(url);
        if (!active) return;
        if (!res.ok) {
          setModbusStatus("unreachable");
          return;
        }
        const data = (await res.json()) as { reachable?: boolean };
        setModbusStatus(data.reachable ? "reachable" : "unreachable");
      } catch {
        if (!active) return;
        setModbusStatus("unreachable");
      }
    }
    void probe();
    const id = setInterval(probe, 10000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [modbusHost, modbusPort]);

  // HA status via WebSocket
  useEffect(() => {
    const url = resolveWebSocketUrl("/ws/valves");
    const ws = new WebSocket(url);

    function onMessage(ev: MessageEvent) {
      try {
        const msg = JSON.parse(ev.data as string) as {
          type?: string;
          payload?: { ha?: { connection?: string } };
        };
        if (msg?.type === "status") {
          const s = msg?.payload?.ha?.connection;
          if (s === "connected" || s === "connecting" || s === "disconnected" || s === "offline") {
            setHaStatus(s);
          }
          setHaLoading(false);
        }
      } catch {
        // ignore
      }
    }

    ws.addEventListener("message", onMessage);
    return () => {
      ws.removeEventListener("message", onMessage);
      ws.close();
    };
  }, []);

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Title order={2}>{t("dashboard.title")}</Title>
        <Card shadow="sm" padding="lg" withBorder>
          <Group justify="space-between" align="center">
            <Title order={4}>
              {t("dashboard.haStatusTitle", { defaultValue: "Home Assistant" })}
            </Title>
            {haLoading ? (
              <Badge color="gray" variant="light" size="lg">
                {t("dashboard.haStatus.loading")}
              </Badge>
            ) : (
              <Badge
                color={haStatus === "connected" ? "green" : haStatus === "connecting" ? "yellow" : "red"}
                variant="light"
                size="lg"
              >
                {t(`dashboard.haStatus.${haStatus}`)}
              </Badge>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            {t("dashboard.haStatusDescription", {
              defaultValue: "Backend connection to Home Assistant WebSocket",
            })}
          </Text>
        </Card>
        <Card shadow="sm" padding="lg" withBorder>
          <Group justify="space-between" align="center">
            <Title order={4}>{t("dashboard.modbusStatusTitle", { defaultValue: "Modbus TCP" })}</Title>
            <Badge
              color={
                modbusStatus === "reachable" ? "green" : modbusStatus === "unreachable" ? "red" : "gray"
              }
              variant="light"
              size="lg"
            >
              {modbusStatus === "loading"
                ? t("dashboard.haStatus.loading")
                : modbusStatus === "reachable"
                ? t("dashboard.modbusStatus.reachable")
                : t("dashboard.modbusStatus.unreachable")}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            {t("dashboard.modbusStatusDescription", {
              defaultValue: "Reachability of the configured Modbus TCP server",
            })}
          </Text>
        </Card>
        <Card shadow="sm" padding="lg" withBorder>
          <Text c="dimmed">{t("dashboard.placeholder")}</Text>
        </Card>
      </Stack>
    </Container>
  );
}
