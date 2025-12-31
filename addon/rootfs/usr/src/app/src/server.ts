import "dotenv/config";

import cors from "cors";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import fs from "fs";
import net from "net";
import path from "path";
import WebSocket, { WebSocketServer } from "ws";

import { createLogger } from "./logger";
import { loadConfig, getConfig } from "./config/options";
import { HomeAssistantClient } from "./services/homeAssistantClient";
import type { ValveController } from "./core/valveManager";
import { ValveManager } from "./core/valveManager";
import { OfflineValveManager } from "./core/offlineValveManager";
import {
  getDatabasePath,
  replaceDatabaseWithFile,
  createDatabaseBackup,
  getAppSetting,
  setAppSetting,
  getTimelineEvents,
  upsertTimelineEvent,
  deleteTimelineEvent,
} from "./services/database";
import { HRU_UNITS, getUnitById } from "./hru/definitions";
import { ModbusTcpClient } from "./services/modbus/ModbusTcpClient";

loadConfig();
const config = getConfig();
const logger = createLogger(config.logLevel);

const app = express();
app.disable("x-powered-by");

app.use(
  cors({
    origin: config.corsOrigins.includes("*") ? true : config.corsOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);
app.use(express.json());
app.use(express.raw({ type: "application/octet-stream", limit: "200mb" }));

const THEME_SETTING_KEY = "ui.theme";
const LANGUAGE_SETTING_KEY = "ui.language";
const SUPPORTED_LANGUAGES = new Set(["en", "cs"]);

app.use((request: Request, response: Response, next: NextFunction) => {
  const requestStart = Date.now();
  response.on("finish", () => {
    const durationMs = Date.now() - requestStart;
    logger.info(
      {
        method: request.method,
        url: request.originalUrl,
        status: response.statusCode,
        durationMs,
        contentLength: request.headers["content-length"],
      },
      "HTTP request completed",
    );
  });
  next();
});

// HRU support
type HruSettings = {
  unit: string | null; // id from HRU_UNITS
  host: string;
  port: number;
  unitId: number; // Modbus unit/slave id
};

const HRU_SETTINGS_KEY = "hru.settings";
const ADDON_MODE_KEY = "addon.mode";
const ADDON_MODES = ["manual", "timeline"] as const;
type AddonMode = typeof ADDON_MODES[number];
const TIMELINE_MODES_KEY = "timeline.modes";

app.get("/api/hru/units", (_request: Request, response: Response) => {
  response.json(
    HRU_UNITS.map((u) => ({
      id: u.id,
      name: u.name,
      description: u.description,
      registers: {
        requestedPower: u.registers.requestedPower,
        requestedTemperature: u.registers.requestedTemperature,
        mode: { address: u.registers.mode.address, kind: u.registers.mode.kind, values: u.registers.mode.values },
      },
    })),
  );
});

type TimelineMode = {
  id: number;
  name: string;
  color?: string;
  power?: number;
  temperature?: number;
  luftatorConfig?: Record<string, number>;
};

function getTimelineModes(): TimelineMode[] {
  const raw = getAppSetting(TIMELINE_MODES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw)) as TimelineMode[];
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

function saveTimelineModes(modes: TimelineMode[]) {
  setAppSetting(TIMELINE_MODES_KEY, JSON.stringify(modes));
}

app.get("/api/timeline/modes", (_request: Request, response: Response) => {
  response.json({ modes: getTimelineModes() });
});

app.post("/api/timeline/modes", (request: Request, response: Response) => {
  const { name, color, power, temperature, luftatorConfig } = request.body as {
    name?: string;
    color?: string;
    power?: number;
    temperature?: number;
    luftatorConfig?: Record<string, number>;
  };
  const trimmed = (name ?? "").toString().trim();
  if (!trimmed) {
    response.status(400).json({ detail: "Mode name is required" });
    return;
  }
  if (power !== undefined && (Number.isNaN(power) || power < 0 || power > 90)) {
    response.status(400).json({ detail: "Power must be between 0 and 90" });
    return;
  }
  if (temperature !== undefined && (Number.isNaN(temperature) || temperature < -50 || temperature > 100)) {
    response.status(400).json({ detail: "Temperature must be between -50 and 100" });
    return;
  }
  if (luftatorConfig !== undefined) {
    if (typeof luftatorConfig !== "object" || Array.isArray(luftatorConfig)) {
      response.status(400).json({ detail: "luftatorConfig must be an object of valve->percentage" });
      return;
    }
    for (const [key, value] of Object.entries(luftatorConfig)) {
      if (value === null || value === undefined) {
        continue;
      }
      if (Number.isNaN(Number(value)) || Number(value) < 0 || Number(value) > 90) {
        response.status(400).json({ detail: `Invalid opening for valve ${key}. Must be 0-90.` });
        return;
      }
    }
  }
  const modes = getTimelineModes();
  const nextId = modes.reduce((acc, m) => Math.max(acc, m.id), 0) + 1;
  const newMode: TimelineMode = {
    id: nextId,
    name: trimmed,
    color,
    power,
    temperature,
    luftatorConfig: luftatorConfig
      ? Object.fromEntries(
          Object.entries(luftatorConfig)
            .filter(([, v]) => v !== undefined && v !== null && !Number.isNaN(Number(v)))
            .map(([k, v]) => [k, Number(v)]),
        )
      : undefined,
  };
  modes.push(newMode);
  saveTimelineModes(modes);
  response.status(201).json(newMode);
});

app.put("/api/timeline/modes/:id", (request: Request, response: Response) => {
  const id = Number.parseInt(request.params.id as string, 10);
  if (!Number.isFinite(id)) {
    response.status(400).json({ detail: "Invalid mode id" });
    return;
  }
  const { name, color, power, temperature, luftatorConfig } = request.body as {
    name?: string;
    color?: string;
    power?: number;
    temperature?: number;
    luftatorConfig?: Record<string, number>;
  };
  const trimmed = (name ?? "").toString().trim();
  if (!trimmed) {
    response.status(400).json({ detail: "Mode name is required" });
    return;
  }
  if (power !== undefined && (Number.isNaN(power) || power < 0 || power > 90)) {
    response.status(400).json({ detail: "Power must be between 0 and 90" });
    return;
  }
  if (temperature !== undefined && (Number.isNaN(temperature) || temperature < -50 || temperature > 100)) {
    response.status(400).json({ detail: "Temperature must be between -50 and 100" });
    return;
  }
  if (luftatorConfig !== undefined) {
    if (typeof luftatorConfig !== "object" || Array.isArray(luftatorConfig)) {
      response.status(400).json({ detail: "luftatorConfig must be an object of valve->percentage" });
      return;
    }
    for (const [key, value] of Object.entries(luftatorConfig)) {
      if (value === null || value === undefined) {
        continue;
      }
      if (Number.isNaN(Number(value)) || Number(value) < 0 || Number(value) > 100) {
        response.status(400).json({ detail: `Invalid opening for valve ${key}. Must be 0-100.` });
        return;
      }
    }
  }
  const modes = getTimelineModes();
  const idx = modes.findIndex((m) => m.id === id);
  if (idx === -1) {
    response.status(404).json({ detail: "Mode not found" });
    return;
  }
  const baseMode = modes[idx];
  if (!baseMode) {
    response.status(404).json({ detail: "Mode not found" });
    return;
  }
  const updated: TimelineMode = {
    ...baseMode,
    id: baseMode.id,
    name: trimmed,
    color,
    power,
    temperature,
    luftatorConfig: luftatorConfig
      ? Object.fromEntries(
          Object.entries(luftatorConfig)
            .filter(([, v]) => v !== undefined && v !== null && !Number.isNaN(Number(v)))
            .map(([k, v]) => [k, Number(v)]),
        )
      : undefined,
  };
  modes[idx] = updated;
  saveTimelineModes(modes);
  response.json(updated);
});

app.delete("/api/timeline/modes/:id", (request: Request, response: Response) => {
  const id = Number.parseInt(request.params.id as string, 10);
  if (!Number.isFinite(id)) {
    response.status(400).json({ detail: "Invalid mode id" });
    return;
  }
  const modes = getTimelineModes();
  const filtered = modes.filter((m) => m.id !== id);
  if (filtered.length === modes.length) {
    response.status(404).json({ detail: "Mode not found" });
    return;
  }
  saveTimelineModes(filtered);
  response.status(204).end();
});

app.get("/api/hru/modes", (_request: Request, response: Response) => {
  const raw = getAppSetting(HRU_SETTINGS_KEY);
  const settings = raw
    ? (JSON.parse(String(raw)) as { unit: string | null })
    : { unit: null };

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

app.get("/api/settings/hru", (_request: Request, response: Response) => {
  const raw = getAppSetting(HRU_SETTINGS_KEY);
  let value: HruSettings;
  try {
    value = raw ? (JSON.parse(String(raw)) as HruSettings) : { unit: null, host: "localhost", port: 502, unitId: 1 };
  } catch {
    value = { unit: null, host: "localhost", port: 502, unitId: 1 };
  }
  response.json(value);
});

app.post("/api/settings/hru", (request: Request, response: Response) => {
  const body = request.body as Partial<HruSettings>;
  const unit = body.unit ?? null;
  const host = (body.host ?? "").toString().trim();
  const port = Number(body.port);
  const unitId = Number(body.unitId);

  if (unit !== null && !HRU_UNITS.some((u) => u.id === unit)) {
    response.status(400).json({ detail: "Unknown HRU unit id" });
    return;
  }
  if (!host) {
    response.status(400).json({ detail: "Missing host" });
    return;
  }
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    response.status(400).json({ detail: "Invalid port" });
    return;
  }
  if (!Number.isFinite(unitId) || unitId <= 0 || unitId > 247) {
    response.status(400).json({ detail: "Invalid unitId" });
    return;
  }

  const settings: HruSettings = { unit, host, port, unitId };
  setAppSetting(HRU_SETTINGS_KEY, JSON.stringify(settings));
  response.status(204).end();
});

function requireHruDefinition(
  response: Response,
): { settings: HruSettings; def: NonNullable<ReturnType<typeof getUnitById>> } | null {
  const raw = getAppSetting(HRU_SETTINGS_KEY);
  const settings = raw ? (JSON.parse(String(raw)) as HruSettings) : { unit: null, host: "localhost", port: 502, unitId: 1 };
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

function getHruDefinitionSafe(): { settings: HruSettings; def: NonNullable<ReturnType<typeof getUnitById>> } | null {
  const raw = getAppSetting(HRU_SETTINGS_KEY);
  const settings = raw ? (JSON.parse(String(raw)) as HruSettings) : { unit: null, host: "localhost", port: 502, unitId: 1 };
  if (!settings.unit) {
    return null;
  }
  const def = getUnitById(settings.unit);
  if (!def) {
    return null;
  }
  return { settings, def };
}

async function withTempModbusClient<T>(cfg: { host: string; port: number; unitId: number }, fn: (client: ModbusTcpClient) => Promise<T>): Promise<T> {
  const client = new ModbusTcpClient({ host: cfg.host, port: cfg.port, unitId: cfg.unitId, timeoutMs: 2000 }, logger);
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

app.get("/api/hru/read", async (_request: Request, response: Response) => {
  const ctx = requireHruDefinition(response);
  if (!ctx) return;
  const { settings, def } = ctx;

  try {
    const result = await withTempModbusClient({ host: settings.host, port: settings.port, unitId: settings.unitId }, async (mb) => {
      const powerRaw = (await mb.readHolding(def.registers.requestedPower.address, 1))[0] ?? 0;
      const tempRaw = (await mb.readHolding(def.registers.requestedTemperature.address, 1))[0] ?? 0;
      const modeRaw = (await mb.readHolding(def.registers.mode.address, 1))[0] ?? 0;

      const power = powerRaw;
      const temp = def.registers.requestedTemperature.scale ? tempRaw * def.registers.requestedTemperature.scale : tempRaw;
      const mode = def.registers.mode.values[modeRaw] ?? String(modeRaw);

      return {
        raw: { power: powerRaw, temperature: tempRaw, mode: modeRaw },
        value: { power, temperature: temp, mode },
      };
    });
    response.json(result);
  } catch (error) {
    logger.warn({ error }, "HRU read failed");
    response.status(502).json({ detail: "Failed to read from HRU" });
  }
});

app.post("/api/hru/write", async (request: Request, response: Response) => {
  const ctx = requireHruDefinition(response);
  if (!ctx) return;
  const { settings, def } = ctx;

  const body = request.body as { power?: number; temperature?: number; mode?: number | string };
  if (body.power === undefined && body.temperature === undefined && body.mode === undefined) {
    response.status(400).json({ detail: "No fields to write" });
    return;
  }

  try {
    await withTempModbusClient({ host: settings.host, port: settings.port, unitId: settings.unitId }, async (mb) => {
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
        else rawMode = Math.max(0, def.registers.mode.values.findIndex((v) => v === body.mode));
        await mb.writeHolding(def.registers.mode.address, rawMode);
      }
    });
    response.status(204).end();
  } catch (error) {
    logger.warn({ error }, "HRU write failed");
    response.status(502).json({ detail: "Failed to write to HRU" });
  }
});

// Timeline API endpoints
app.get("/api/timeline/events", (_request: Request, response: Response) => {
  try {
    const events = getTimelineEvents();
    response.json(events);
  } catch (error) {
    logger.warn({ error }, "Failed to get timeline events");
    response.status(500).json({ detail: "Failed to retrieve timeline events" });
  }
});

app.post("/api/timeline/events", (request: Request, response: Response) => {
  const body = request.body as {
    id?: number;
    startTime?: string;
    endTime?: string;
    dayOfWeek?: number | null;
    hruConfig?: {
      mode?: string;
      power?: number;
      temperature?: number;
    } | null;
    luftatorConfig?: Record<string, number> | null;
    enabled?: boolean;
    priority?: number;
  };

  // Validation
  if (!body.startTime || !body.endTime) {
    response.status(400).json({ detail: "Start time and end time are required" });
    return;
  }
  
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(body.startTime) || !timeRegex.test(body.endTime)) {
    response.status(400).json({ detail: "Times must be in HH:MM format" });
    return;
  }
  
  if (body.dayOfWeek !== undefined && body.dayOfWeek !== null && (body.dayOfWeek < 0 || body.dayOfWeek > 6)) {
    response.status(400).json({ detail: "Day of week must be 0-6 or null for all days" });
    return;
  }
  
  if (body.priority !== undefined && (body.priority < 0 || body.priority > 100)) {
    response.status(400).json({ detail: "Priority must be 0-100" });
    return;
  }

  try {
    const event = upsertTimelineEvent({
      id: body.id,
      startTime: body.startTime,
      endTime: body.endTime,
      dayOfWeek: body.dayOfWeek,
      hruConfig: body.hruConfig,
      luftatorConfig: body.luftatorConfig,
      enabled: body.enabled ?? true,
      priority: body.priority ?? 0,
    });
    response.json(event);
  } catch (error) {
    logger.warn({ error }, "Failed to save timeline event");
    response.status(500).json({ detail: "Failed to save timeline event" });
  }
});

app.delete("/api/timeline/events/:id", (request: Request, response: Response) => {
  const id = Number.parseInt(request.params.id as string, 10);
  if (!Number.isFinite(id)) {
    response.status(400).json({ detail: "Invalid event ID" });
    return;
  }

  try {
    deleteTimelineEvent(id);
    response.status(204).end();
  } catch (error) {
    logger.warn({ error, id }, "Failed to delete timeline event");
    response.status(500).json({ detail: "Failed to delete timeline event" });
  }
});

// Addon mode settings
app.get("/api/settings/mode", (_request: Request, response: Response) => {
  const raw = getAppSetting(ADDON_MODE_KEY);
  const mode = ADDON_MODES.includes(raw as AddonMode) ? raw : "manual";
  response.json({ mode });
});

app.post("/api/settings/mode", (request: Request, response: Response) => {
  const { mode } = request.body as { mode?: string };
  if (!mode || !ADDON_MODES.includes(mode as AddonMode)) {
    response.status(400).json({ detail: "Invalid mode" });
    return;
  }
  setAppSetting(ADDON_MODE_KEY, mode);
  response.status(204).end();
});

app.get("/api/status", (_request: Request, response: Response) => {
  const ha = haClient
    ? { connection: haClient.getConnectionState() }
    : { connection: "offline" };
  response.json({ ha });
});

async function probeTcp(host: string, port: number, timeoutMs = 1500): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = new net.Socket();
    let done = false;
    function finalize(err?: Error) {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch { /* empty */ }
      if (err) reject(err);
      else resolve();
    }
    socket.setTimeout(timeoutMs);
    socket.once("error", (err) => finalize(err));
    socket.once("timeout", () => finalize(new Error("timeout")));
    socket.connect(port, host, () => finalize());
  });
}

app.get("/api/modbus/status", async (request: Request, response: Response) => {
  const hostQ = String((request.query.host as string | undefined) ?? "").trim();
  const portQ = String((request.query.port as string | undefined) ?? "").trim();

  let savedSettings: HruSettings | null = null;
  try {
    const raw = getAppSetting(HRU_SETTINGS_KEY);
    savedSettings = raw ? (JSON.parse(String(raw)) as HruSettings) : null;
  } catch {
    savedSettings = null;
  }

  const host = hostQ || savedSettings?.host || "localhost";
  const parsedPort = Number.parseInt(portQ, 10);
  const port = Number.isFinite(parsedPort)
    ? parsedPort
    : Number.isFinite(savedSettings?.port)
      ? (savedSettings?.port as number)
      : 502;

  try {
    await probeTcp(host, port);
    response.json({ reachable: true });
  } catch (err) {
    logger.warn({ host, port, err }, "Modbus TCP probe failed");
    response.json({ reachable: false, error: err instanceof Error ? err.message : String(err) });
  }
});

const clients = new Set<WebSocket>();

async function broadcast(message: unknown): Promise<void> {
  const data = JSON.stringify(message);
  for (const client of Array.from(clients)) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    } else {
      clients.delete(client);
    }
  }
}

let valveManager: ValveController;
let haClient: HomeAssistantClient | null = null;
let timelineInterval: NodeJS.Timeout | null = null;
let lastAppliedEventId: number | null = null;

function mapTodayToTimelineDay(): number {
  // UI uses Monday = 0 ... Sunday = 6
  const jsDay = new Date().getDay(); // Sunday = 0
  return jsDay === 0 ? 6 : jsDay - 1;
}

function timeToMinutes(value: string): number {
  const parts = value.split(":");
  const h = Number.parseInt(parts[0] ?? "0", 10);
  const m = Number.parseInt(parts[1] ?? "0", 10);
  const hh = Number.isFinite(h) ? h : 0;
  const mm = Number.isFinite(m) ? m : 0;
  return hh * 60 + mm;
}

function pickActiveEvent(): ReturnType<typeof getTimelineEvents>[number] | null {
  const nowMinutes = timeToMinutes(
    `${new Date().getHours().toString().padStart(2, "0")}:${new Date().getMinutes().toString().padStart(2, "0")}`,
  );
  const today = mapTodayToTimelineDay();
  const events = getTimelineEvents();

  const candidates = events
    .filter((e) => e.enabled && (e.dayOfWeek ?? today) === today)
    .filter((e) => timeToMinutes(e.startTime) <= nowMinutes && nowMinutes < timeToMinutes(e.endTime));

  logger.debug(
    { today, nowMinutes, candidates: candidates.length },
    "Timeline: candidate events for current time",
  );

  if (candidates.length === 0) return null;

  // Highest priority, then latest start time
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return timeToMinutes(b.startTime) - timeToMinutes(a.startTime);
  });

  return candidates[0] ?? null;
}

async function applyTimelineEvent(): Promise<void> {
  const event = pickActiveEvent();
  if (!event) {
    logger.debug("Timeline: no active event for current time");
    lastAppliedEventId = null;
    return;
  }

  if (event.id && lastAppliedEventId === event.id) {
    logger.debug({ eventId: event.id }, "Timeline: active event already applied");
    return; // already applied
  }

  const hasValves = event.luftatorConfig && Object.keys(event.luftatorConfig).length > 0;
  const hasHru = Boolean(event.hruConfig);

  if (!hasValves && !hasHru) {
    logger.debug({ eventId: event.id }, "Timeline: active event has no HRU/valve payload");
    lastAppliedEventId = event.id ?? null;
    return;
  }

  logger.info(
    {
      eventId: event.id,
      dayOfWeek: event.dayOfWeek,
      startTime: event.startTime,
      endTime: event.endTime,
      hasValves,
      hasHru,
    },
    "Timeline: applying active event",
  );

  if (hasValves && event.luftatorConfig) {
    for (const [entityId, opening] of Object.entries(event.luftatorConfig)) {
      if (opening === undefined || opening === null) continue;
      try {
        await valveManager.setValue(entityId, opening);
      } catch (err) {
        logger.warn({ entityId, err }, "Failed to apply valve opening from timeline");
      }
    }
  }

  // Apply HRU settings if available
  if (hasHru && event.hruConfig) {
    const hruCtx = getHruDefinitionSafe();
    if (hruCtx) {
      const { settings, def } = hruCtx;
      const { power, temperature, mode } = event.hruConfig;
      logger.info(
        { eventId: event.id, power, temperature, mode, host: settings.host, port: settings.port, unitId: settings.unitId },
        "Timeline: applying HRU settings",
      );
      try {
        await withTempModbusClient({ host: settings.host, port: settings.port, unitId: settings.unitId }, async (mb) => {
          if (typeof power === "number" && Number.isFinite(power)) {
            await mb.writeHolding(def.registers.requestedPower.address, Math.round(power));
          }
          if (typeof temperature === "number" && Number.isFinite(temperature)) {
            const scale = def.registers.requestedTemperature.scale ?? 1;
            const rawVal = Math.round(temperature / scale);
            await mb.writeHolding(def.registers.requestedTemperature.address, rawVal);
          }
          if (mode !== undefined && mode !== null) {
            let rawMode: number | null = null;
            if (typeof mode === "number" && Number.isFinite(mode)) {
              rawMode = mode;
            } else {
              const parsed = Number.parseInt(String(mode), 10);
              if (Number.isFinite(parsed)) {
                rawMode = parsed;
              } else {
                const idx = def.registers.mode.values.findIndex((v) => v === mode);
                rawMode = idx >= 0 ? idx : 0;
              }
            }
            if (rawMode !== null) {
              await mb.writeHolding(def.registers.mode.address, rawMode);
            }
          }
        });
      } catch (err) {
        logger.warn({ err }, "Failed to apply HRU settings from timeline event");
      }
    }
  }

  lastAppliedEventId = event.id ?? null;
}

function startTimelineScheduler(): void {
  if (timelineInterval) {
    clearInterval(timelineInterval);
  }
  timelineInterval = setInterval(() => {
    void applyTimelineEvent();
  }, 30_000);
  void applyTimelineEvent();
}

if (config.token) {
  haClient = new HomeAssistantClient(config.baseUrl, config.token, logger);
  valveManager = new ValveManager(haClient, logger, broadcast);
  haClient.addStatusListener((state) => {
    void broadcast({ type: "status", payload: { ha: { connection: state } } });
  });
} else {
  valveManager = new OfflineValveManager(logger, broadcast);
}

startTimelineScheduler();

app.get("/api/valves", async (_request: Request, response: Response, next: NextFunction) => {
  try {
    const snapshot = await valveManager.getSnapshot();
    response.json(snapshot);
  } catch (error) {
    next(error);
  }
});

app.get("/api/settings/theme", (_request: Request, response: Response) => {
  const theme = getAppSetting(THEME_SETTING_KEY) ?? "light";
  response.json({ theme });
});

app.post("/api/settings/theme", (request: Request, response: Response) => {
  const { theme } = request.body as { theme?: string };
  if (theme !== "light" && theme !== "dark") {
    response.status(400).json({ detail: "Invalid theme value" });
    return;
  }
  setAppSetting(THEME_SETTING_KEY, theme);
  response.status(204).end();
});

app.get("/api/settings/language", (_request: Request, response: Response) => {
  const language = getAppSetting(LANGUAGE_SETTING_KEY) ?? "en";
  response.json({ language });
});

app.post("/api/settings/language", (request: Request, response: Response) => {
  const { language } = request.body as { language?: string };
  if (!language || !SUPPORTED_LANGUAGES.has(language)) {
    response.status(400).json({ detail: "Invalid language value" });
    return;
  }
  setAppSetting(LANGUAGE_SETTING_KEY, language);
  response.status(204).end();
});

app.get(
  "/api/database/export",
  async (_request: Request, response: Response, next: NextFunction) => {
    try {
      const dbPath = getDatabasePath();
      if (!fs.existsSync(dbPath)) {
        logger.warn({ dbPath }, "Database export requested but file missing");
        response.status(404).json({ detail: "Database file not found" });
        return;
      }

      logger.info({ dbPath }, "Streaming database export");
      response.setHeader("Content-Type", "application/octet-stream");
      response.setHeader("Content-Disposition", "attachment; filename=luftator.db");
      fs.createReadStream(dbPath)
        .on("error", (error) => next(error))
        .pipe(response);
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/database/import",
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (!request.body || !(request.body instanceof Buffer) || request.body.length === 0) {
        response.status(400).json({ detail: "Request body must be a binary SQLite file" });
        return;
      }

      const buffer = request.body as Buffer;
      if (!buffer.subarray(0, 16).toString("utf-8").includes("SQLite format")) {
        logger.warn({ length: buffer.length }, "Rejected database import: invalid signature");
        response
          .status(400)
          .json({ detail: "Uploaded file does not appear to be a SQLite database" });
        return;
      }

      logger.info({ size: buffer.length }, "Replacing database from uploaded file");
      await createDatabaseBackup();
      await replaceDatabaseWithFile(buffer);

      logger.info("Database import completed, restarting valve manager");
      await valveManager.stop();
      await valveManager.start();

      response.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/valves/:entityId",
  async (request: Request, response: Response, next: NextFunction) => {
    const entityId = request.params.entityId;
    if (!entityId) {
      response.status(400).json({ detail: "Missing entityId path parameter" });
      return;
    }

    try {
      const { value } = request.body as { value?: unknown };

      const numericValue =
        typeof value === "string" ? Number(value) : (value as number | undefined);
      if (numericValue === undefined || Number.isNaN(numericValue)) {
        response.status(400).json({ detail: "Missing or invalid 'value' in payload" });
        return;
      }

      logger.debug({ entityId, value: numericValue }, "Valve value POST received");
      const result = await valveManager.setValue(entityId, Number(numericValue));
      logger.info({ entityId, value: numericValue }, "Valve value updated via API");
      response.json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (/Unknown valve/.test(error.message)) {
          logger.warn({ entityId }, "Valve value update failed: unknown valve");
          response.status(404).json({ detail: error.message });
          return;
        }
        if (/Offline mode/.test(error.message)) {
          logger.warn({ entityId }, "Valve value update rejected: offline mode");
          response.status(503).json({ detail: error.message });
          return;
        }
      }
      next(error);
    }
  },
);

const staticRoot = config.staticRoot;
const assetsPath = path.join(staticRoot, "assets");
const indexPath = path.join(staticRoot, "index.html");

if (fs.existsSync(staticRoot)) {
  if (fs.existsSync(assetsPath)) {
    app.use("/assets", express.static(assetsPath, { fallthrough: true }));
  }

  app.get("/", (_request: Request, response: Response, next: NextFunction) => {
    if (!fs.existsSync(indexPath)) {
      next();
      return;
    }

    response.sendFile(indexPath);
  });

  app.get(
    /^(?!\/api\/|\/ws\/|\/assets\/).*/,
    (_request: Request, response: Response, next: NextFunction) => {
      if (!fs.existsSync(indexPath)) {
        next();
        return;
      }

      response.sendFile(indexPath);
    },
  );
}

app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
  void _next;
  logger.error({ error }, "Unhandled error");
  response.status(500).json({ detail: "Internal server error" });
});

const httpServer = createServer(app);

const wss = new WebSocketServer({
  server: httpServer,
  path: "/ws/valves",
});

wss.on("connection", async (socket) => {
  clients.add(socket);
  logger.info({ clientCount: clients.size }, "WebSocket client connected");

  socket.on("close", () => {
    clients.delete(socket);
    logger.info({ clientCount: clients.size }, "WebSocket client disconnected");
  });

  socket.on("error", (error) => {
    logger.warn({ error }, "WebSocket client error");
  });

  try {
    const snapshot = await valveManager.getSnapshot();
    socket.send(
      JSON.stringify({
        type: "snapshot",
        payload: snapshot,
      }),
    );
  } catch (error) {
    logger.error({ error }, "Failed to send initial snapshot to websocket client");
  }

  // Send initial status
  try {
    const status = haClient ? haClient.getConnectionState() : "offline";
    socket.send(
      JSON.stringify({
        type: "status",
        payload: { ha: { connection: status } },
      }),
    );
  } catch (error) {
    logger.error({ error }, "Failed to send initial status to websocket client");
  }
});

const port = config.webPort;
const host = "0.0.0.0";

async function start() {
  await valveManager.start();

  httpServer.listen(port, host, () => {
    logger.info({ port }, "Luftujha backend listening");
  });
}

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down Luftujha backend");

  wss.close();

  await valveManager.stop();

  await new Promise<void>((resolve) => {
    httpServer.close(() => resolve());
  });

  process.exit(0);
}

process.on("SIGINT", (signal) => {
  void shutdown(signal.toString());
});

process.on("SIGTERM", (signal) => {
  void shutdown(signal.toString());
});

void start().catch((error) => {
  logger.fatal({ error }, "Failed to start backend");
  process.exit(1);
});
