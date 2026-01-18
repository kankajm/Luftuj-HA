import { Router } from "express";
import type { Request, Response } from "express";
import type { Logger } from "pino";
import { HRU_UNITS } from "../hru/definitions";
import { withTempModbusClient } from "../services/hruService";
import { getUnitById } from "../hru/definitions";
import { getAppSetting } from "../services/database";
import { HRU_SETTINGS_KEY, type HruSettings } from "../types";
import { applyWriteDefinition, resolveModeValue } from "../utils/hruWrite";

export function createHruRouter(logger: Logger) {
  const router = Router();

  function requireHruDefinition(
    response: Response,
  ): { settings: HruSettings; def: NonNullable<ReturnType<typeof getUnitById>> } | null {
    const raw = getAppSetting(HRU_SETTINGS_KEY);
    const settings = raw
      ? (JSON.parse(String(raw)) as HruSettings)
      : { unit: null, host: "localhost", port: 502, unitId: 1 };
    if (!settings.unit) {
      response.status(400).json({ detail: "HRU unit not configured" });
      return null;
    }
    const def = getUnitById(settings.unit);
    if (!def) {
      response.status(400).json({ detail: "Unknown HRU unit" });
      return null;
    }
    return { settings, def };
  }

  router.get("/units", (_request: Request, response: Response) => {
    response.json(
      HRU_UNITS.map((u) => ({
        id: u.id,
        name: u.name,
        description: u.description,
        capabilities: u.capabilities ?? null,
        registers: {
          read: {
            power: u.registers.read.power,
            temperature: u.registers.read.temperature,
            mode: {
              address: u.registers.read.mode.address,
              kind: u.registers.read.mode.kind,
              values: u.registers.read.mode.values,
            },
          },
          write: u.registers.write ?? null,
        },
      })),
    );
  });

  router.get("/modes", (_request: Request, response: Response) => {
    const raw = getAppSetting(HRU_SETTINGS_KEY);
    const settings = raw ? (JSON.parse(String(raw)) as { unit: string | null }) : { unit: null };

    if (!settings.unit) {
      response.status(400).json({ detail: "HRU unit not configured" });
      return;
    }

    const def = getUnitById(settings.unit);
    if (!def) {
      response.status(400).json({ detail: "Unknown HRU unit" });
      return;
    }

    const modes = Object.entries(def.registers.read.mode.values).map(([id, name]) => ({
      id: Number(id),
      name,
    }));

    response.json({ modes });
  });

  router.get("/read", async (_request: Request, response: Response) => {
    const ctx = requireHruDefinition(response);
    if (!ctx) return;
    const { settings, def } = ctx;

    try {
      const result = await withTempModbusClient(
        { host: settings.host, port: settings.port, unitId: settings.unitId },
        logger,
        async (mb) => {
          const powerRaw = (await mb.readHolding(def.registers.read.power.address, 1))[0] ?? 0;
          const tempRaw = (await mb.readHolding(def.registers.read.temperature.address, 1))[0] ?? 0;
          const modeRaw = (await mb.readHolding(def.registers.read.mode.address, 1))[0] ?? 0;

          const power = powerRaw;
          const temp = def.registers.read.temperature.scale
            ? tempRaw * def.registers.read.temperature.scale
            : tempRaw;
          const mode = def.registers.read.mode.values[modeRaw] ?? String(modeRaw);

          return {
            raw: { power: powerRaw, temperature: tempRaw, mode: modeRaw },
            value: { power, temperature: temp, mode },
            registers: {
              power: {
                unit: def.registers.read.power.unit,
                scale: def.registers.read.power.scale,
                precision: def.registers.read.power.precision,
              },
              temperature: {
                unit: def.registers.read.temperature.unit,
                scale: def.registers.read.temperature.scale,
                precision: def.registers.read.temperature.precision,
              },
            },
          };
        },
      );
      response.json(result);
    } catch (error) {
      logger.warn({ error }, "HRU read failed");
      response.status(502).json({ detail: "Failed to read from HRU" });
    }
  });

  router.post("/write", async (request: Request, response: Response) => {
    const ctx = requireHruDefinition(response);
    if (!ctx) return;
    const { settings, def } = ctx;

    const body = request.body as { power?: number; temperature?: number; mode?: number | string };
    if (body.power === undefined && body.temperature === undefined && body.mode === undefined) {
      response.status(400).json({ detail: "No fields to write" });
      return;
    }

    try {
      await withTempModbusClient(
        { host: settings.host, port: settings.port, unitId: settings.unitId },
        logger,
        async (mb) => {
          if (typeof body.power === "number") {
            const writeDef = def.registers.write?.power;
            if (!writeDef) {
              response.status(400).json({ detail: "Power write not supported" });
              return;
            }
            await applyWriteDefinition(mb, writeDef, body.power);
          }
          if (typeof body.temperature === "number") {
            const writeDef = def.registers.write?.temperature;
            if (!writeDef) {
              response.status(400).json({ detail: "Temperature write not supported" });
              return;
            }
            await applyWriteDefinition(mb, writeDef, body.temperature);
          }
          if (body.mode !== undefined) {
            const writeDef = def.registers.write?.mode;
            if (!writeDef) {
              response.status(400).json({ detail: "Mode write not supported" });
              return;
            }
            const rawMode = resolveModeValue(def.registers.read.mode.values, body.mode);
            await applyWriteDefinition(mb, writeDef, rawMode);
          }
        },
      );
      response.status(204).end();
    } catch (error) {
      logger.warn({ error }, "HRU write failed");
      response.status(502).json({ detail: "Failed to write to HRU" });
    }
  });

  return router;
}
