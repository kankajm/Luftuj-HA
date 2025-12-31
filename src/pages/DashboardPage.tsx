import { Badge, Card, Container, Group, Stack, Text, Title, RingProgress, ThemeIcon } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveApiUrl, resolveWebSocketUrl } from "../utils/api";
import { IconFlame, IconThermometer, IconMoodSmileBeam } from "@tabler/icons-react";

export function DashboardPage() {
  const { t } = useTranslation();
  const [haStatus, setHaStatus] = useState<
    "connected" | "connecting" | "disconnected" | "offline"
  >("offline");
  const [haLoading, setHaLoading] = useState(true);

  // Modbus probe configuration (defaults to env, then settings, then localhost:502)
  const envHost = (import.meta.env.VITE_MODBUS_HOST as string | undefined) ?? undefined;
  const envPortRaw = import.meta.env.VITE_MODBUS_PORT as string | number | undefined;
  const envPort =
    typeof envPortRaw === "string" ? Number.parseInt(envPortRaw, 10) : (envPortRaw as number | undefined);
  const [modbusHost, setModbusHost] = useState(envHost ?? "localhost");
  const [modbusPort, setModbusPort] = useState(envPort ?? 502);
  const [modbusStatus, setModbusStatus] = useState<"loading" | "reachable" | "unreachable">("loading");
  const [hruStatus, setHruStatus] = useState<
    { power: number; temperature: number; mode: string } | { error: string } | null
  >(null);
  const valvesWsRef = useRef<WebSocket | null>(null);
  const valvesReconnectRef = useRef<number | null>(null);

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
    let canceled = false;
    async function loadSettings() {
      try {
        const res = await fetch(resolveApiUrl("/api/settings/hru"));
        if (!res.ok) return;
        const data = (await res.json()) as { host?: string; port?: number };
        if (canceled) return;
        if (data.host) setModbusHost(data.host);
        if (Number.isFinite(data.port)) setModbusPort(data.port as number);
      } catch {
        // ignore, fallback to env/default
      }
    }
    void loadSettings();
    return () => {
      canceled = true;
    };
  }, []);

  // HRU live polling
  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch(resolveApiUrl("/api/hru/read"));
        if (!active) return;
        if (!res.ok) {
          const detail = await res.text();
          setHruStatus({ error: detail || "Failed to read HRU" });
          return;
        }
        const data = (await res.json()) as { value?: { power: number; temperature: number; mode: string } };
        if (data?.value) {
          setHruStatus(data.value);
        } else {
          setHruStatus({ error: "Invalid HRU response" });
        }
      } catch {
        if (!active) return;
        setHruStatus({ error: "Failed to read HRU" });
      }
    }
    void poll();
    const id = setInterval(poll, 10_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

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
    let stopped = false;

    function cleanupSocket() {
      if (valvesWsRef.current) {
        const ws = valvesWsRef.current;
        valvesWsRef.current = null;
        ws.removeEventListener("message", onMessage);
        ws.removeEventListener("error", onError);
        ws.removeEventListener("close", onClose);
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000, "cleanup");
        } else if (ws.readyState === WebSocket.CONNECTING) {
          function closer() {
            ws.removeEventListener("open", closer);
            ws.close(1000, "cleanup");
          }
          ws.addEventListener("open", closer);
        }
      }
      if (valvesReconnectRef.current !== null) {
        window.clearTimeout(valvesReconnectRef.current);
        valvesReconnectRef.current = null;
      }
    }

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

    function onError() {
      // handled by close/reconnect
    }

    function onClose() {
      if (stopped) return;
      if (valvesReconnectRef.current !== null) return;
      valvesReconnectRef.current = window.setTimeout(() => {
        valvesReconnectRef.current = null;
        connect();
      }, 2000);
    }

    function connect() {
      cleanupSocket();
      const url = resolveWebSocketUrl("/ws/valves");
      const ws = new WebSocket(url);
      valvesWsRef.current = ws;
      ws.addEventListener("message", onMessage);
      ws.addEventListener("error", onError);
      ws.addEventListener("close", onClose);
    }

    connect();

    return () => {
      stopped = true;
      cleanupSocket();
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
          <Group justify="space-between" align="center">
            <Title order={4}>{t("dashboard.hruStatusTitle", { defaultValue: "HRU live values" })}</Title>
            {hruStatus === null ? (
              <Badge color="gray" variant="light" size="lg">
                {t("dashboard.haStatus.loading")}
              </Badge>
            ) : "error" in hruStatus ? (
              <Badge color="red" variant="light" size="lg">
                {t("dashboard.hruStatusError", { defaultValue: "Error" })}
              </Badge>
            ) : (
              <Badge color="green" variant="light" size="lg">
                {t("dashboard.hruStatusOk", { defaultValue: "OK" })}
              </Badge>
            )}
          </Group>
          {hruStatus === null ? (
            <Text size="sm" c="dimmed">
              {t("dashboard.haStatus.loading")}
            </Text>
          ) : "error" in hruStatus ? (
            <Text size="sm" c="red">
              {hruStatus.error}
            </Text>
          ) : (
            <Group align="center" mt="sm" gap="lg">
              <RingProgress
                size={120}
                thickness={12}
                roundCaps
                sections={[{ value: Math.max(0, Math.min(100, Math.round(hruStatus.power))), color: "teal" }]}
                label={
                  <Stack gap={2} align="center">
                    <ThemeIcon color="teal" variant="light" radius="xl">
                      <IconFlame size={20} />
                    </ThemeIcon>
                    <Text fw={600} size="sm">
                      {Math.round(hruStatus.power)}%
                    </Text>
                    <Text size="xs" c="dimmed">
                      {t("hru.power", { defaultValue: "Power" })}
                    </Text>
                  </Stack>
                }
              />
              <Stack gap={8} style={{ flex: 1 }}>
                <Group gap="xs" align="center">
                  <ThemeIcon color="blue" variant="light" radius="xl">
                    <IconThermometer size={18} />
                  </ThemeIcon>
                  <Text fw={600}>
                    {t("hru.temperature", { defaultValue: "Temperature" })}: {hruStatus.temperature}°C
                  </Text>
                </Group>
                <Group gap="xs" align="center">
                  <ThemeIcon color="grape" variant="light" radius="xl">
                    <IconMoodSmileBeam size={18} />
                  </ThemeIcon>
                  <Text fw={600}>
                    {t("dashboard.hruMode", { defaultValue: "Mode" })}: {hruStatus.mode}
                  </Text>
                </Group>
              </Stack>
            </Group>
          )}
          <Text size="sm" c="dimmed" mt="xs">
            {t("dashboard.hruStatusDescription", { defaultValue: "Reads HRU registers every 10 seconds" })}
          </Text>
        </Card>
        <Card shadow="sm" padding="lg" withBorder>
          <Text c="dimmed">{t("dashboard.placeholder")}</Text>
        </Card>
      </Stack>
    </Container>
  );
}
