import type { Logger } from "pino";
import { getAppSetting } from "./database";
import { getUnitById } from "../hru/definitions";
import { ModbusTcpClient } from "./modbus/ModbusTcpClient";
import { HRU_SETTINGS_KEY, type HruSettings } from "../types";

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

export async function withTempModbusClient<T>(
  cfg: { host: string; port: number; unitId: number },
  logger: Logger,
  fn: (client: ModbusTcpClient) => Promise<T>,
): Promise<T> {
  const client = new ModbusTcpClient(
    { host: cfg.host, port: cfg.port, unitId: cfg.unitId, timeoutMs: 2000 },
    logger,
  );
  try {
    await client.connect();
    const result = await fn(client);
    await client.safeDisconnect();
    return result;
  } catch (e) {
    await client.safeDisconnect();
    throw e;
  }
}
