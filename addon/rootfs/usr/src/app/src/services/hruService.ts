import type { Logger } from "pino";
import { getAppSetting } from "./database";
import { getUnitById } from "../hru/definitions";
import { ModbusTcpClient } from "./modbus/ModbusTcpClient";
import { HRU_SETTINGS_KEY, type HruSettings } from "../types";

const clientCache = new Map<string, ModbusTcpClient>();

export function getHruDefinitionSafe(): {
  settings: HruSettings;
  def: NonNullable<ReturnType<typeof getUnitById>>;
} | null {
  const raw = getAppSetting(HRU_SETTINGS_KEY);
  const settings = raw
    ? (JSON.parse(String(raw)) as HruSettings)
    : { unit: null, host: "localhost", port: 502, unitId: 1 };
  if (!settings.unit) {
    return null;
  }
  const def = getUnitById(settings.unit);
  if (!def) {
    return null;
  }
  return { settings, def };
}

export function getSharedModbusClient(
  cfg: { host: string; port: number; unitId: number },
  logger: Logger,
): ModbusTcpClient {
  const key = `${cfg.host}:${cfg.port}:${cfg.unitId}`;
  let client = clientCache.get(key);
  if (!client) {
    client = new ModbusTcpClient(
      { host: cfg.host, port: cfg.port, unitId: cfg.unitId, timeoutMs: 5000 },
      logger,
    );
    clientCache.set(key, client);
  }
  return client;
}

export async function withTempModbusClient<T>(
  cfg: { host: string; port: number; unitId: number },
  logger: Logger,
  fn: (client: ModbusTcpClient) => Promise<T>,
): Promise<T> {
  const client = getSharedModbusClient(cfg, logger);

  if (!client.isConnected()) {
    await client.connect();
  }

  // We do not disconnect here, keeping the connection open as requested.
  // The client handles timeouts/reconnects internally.
  return fn(client);
}
