import { Router } from "express";
import type { Request, Response } from "express";
import type { Logger } from "pino";
import { HRU_UNITS } from "../hru/definitions";
import { withTempModbusClient } from "../services/hruService";
import { getUnitById } from "../hru/definitions";
import { getAppSetting } from "../services/database";
import { HRU_SETTINGS_KEY, type HruSettings } from "../types";

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
        registers: {
          requestedPower: u.registers.requestedPower,
          requestedTemperature: u.registers.requestedTemperature,
          mode: {
            address: u.registers.mode.address,
            kind: u.registers.mode.kind,
            values: u.registers.mode.values,
          },
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

    const modes = def.registers.mode.values.map((name, index) => ({
      id: index,
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
          const powerRaw = (await mb.readHolding(def.registers.requestedPower.address, 1))[0] ?? 0;
          const tempRaw =
            (await mb.readHolding(def.registers.requestedTemperature.address, 1))[0] ?? 0;
          const modeRaw = (await mb.readHolding(def.registers.mode.address, 1))[0] ?? 0;

          const power = powerRaw;
          const temp = def.registers.requestedTemperature.scale
            ? tempRaw * def.registers.requestedTemperature.scale
            : tempRaw;
          const mode = def.registers.mode.values[modeRaw] ?? String(modeRaw);

          return {
            raw: { power: powerRaw, temperature: tempRaw, mode: modeRaw },
            value: { power, temperature: temp, mode },
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
            await mb.writeHolding(def.registers.requestedPower.address, Math.round(body.power));
          }
          if (typeof body.temperature === "number") {
            const scale = def.registers.requestedTemperature.scale ?? 1;
            const rawVal = Math.round(body.temperature / scale);
            await mb.writeHolding(def.registers.requestedTemperature.address, rawVal);
          }
          if (body.mode !== undefined) {
            let rawMode: number;
            if (typeof body.mode === "number") rawMode = body.mode;
            else
              rawMode = Math.max(
                0,
                def.registers.mode.values.findIndex((v) => v === body.mode),
              );
            await mb.writeHolding(def.registers.mode.address, rawMode);
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
