import type { Logger } from "pino";
import type { ValveController } from "../core/valveManager";
import { getTimelineEvents } from "./database";
import { getHruDefinitionSafe, withTempModbusClient } from "./hruService";

export class TimelineRunner {
  private timelineTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly valveManager: ValveController,
    private readonly logger: Logger,
  ) {}

  public start(): void {
    // Run immediately on startup then align to minute boundary
    void this.applyTimelineEvent().finally(() => this.scheduleNextTimelineTick());
  }

  public stop(): void {
    if (this.timelineTimer) {
      clearTimeout(this.timelineTimer);
      this.timelineTimer = null;
    }
  }

  private mapTodayToTimelineDay(): number {
    // UI uses Monday = 0 ... Sunday = 6
    const jsDay = new Date().getDay(); // Sunday = 0
    return jsDay === 0 ? 6 : jsDay - 1;
  }

  private timeToMinutes(value: string): number {
    const parts = value.split(":");
    const h = Number.parseInt(parts[0] ?? "0", 10);
    const m = Number.parseInt(parts[1] ?? "0", 10);
    const hh = Number.isFinite(h) ? h : 0;
    const mm = Number.isFinite(m) ? m : 0;
    return hh * 60 + mm;
  }

  private pickActiveEvent(): ReturnType<typeof getTimelineEvents>[number] | null {
    const nowMinutes = this.timeToMinutes(
      `${new Date().getHours().toString().padStart(2, "0")}:${new Date().getMinutes().toString().padStart(2, "0")}`,
    );
    const today = this.mapTodayToTimelineDay();
    const events = getTimelineEvents();

    const candidates = events
      .filter((e) => e.enabled && (e.dayOfWeek ?? today) === today)
      .filter(
        (e) =>
          this.timeToMinutes(e.startTime) <= nowMinutes &&
          nowMinutes < this.timeToMinutes(e.endTime),
      );

    this.logger.debug(
      { today, nowMinutes, candidates: candidates.length },
      "Timeline: candidate events for current time",
    );

    if (candidates.length === 0) return null;

    // Highest priority, then latest start time
    candidates.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return this.timeToMinutes(b.startTime) - this.timeToMinutes(a.startTime);
    });

    return candidates[0] ?? null;
  }

  private async applyTimelineEvent(): Promise<void> {
    const event = this.pickActiveEvent();
    if (!event) {
      this.logger.debug("Timeline: no active event for current time");
      return;
    }

    const hasValves = event.luftatorConfig && Object.keys(event.luftatorConfig).length > 0;
    const hasHru = Boolean(event.hruConfig);

    if (!hasValves && !hasHru) {
      this.logger.debug({ eventId: event.id }, "Timeline: active event has no HRU/valve payload");
      return;
    }

    this.logger.info(
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
          await this.valveManager.setValue(entityId, opening);
        } catch (err) {
          this.logger.warn({ entityId, err }, "Failed to apply valve opening from timeline");
        }
      }
    }

    // Apply HRU settings if available
    if (hasHru && event.hruConfig) {
      const hruCtx = getHruDefinitionSafe();
      if (hruCtx) {
        const { settings, def } = hruCtx;
        const { power, temperature, mode } = event.hruConfig;
        this.logger.info(
          {
            eventId: event.id,
            power,
            temperature,
            mode,
            host: settings.host,
            port: settings.port,
            unitId: settings.unitId,
          },
          "Timeline: applying HRU settings",
        );
        try {
          await withTempModbusClient(
            { host: settings.host, port: settings.port, unitId: settings.unitId },
            this.logger,
            async (mb) => {
              if (typeof power === "number" && Number.isFinite(power)) {
                await mb.writeHolding(def.registers.requestedPower.address, Math.round(power));
              }
              if (typeof temperature === "number" && Number.isFinite(temperature)) {
                const scale = def.registers.requestedTemperature.scale ?? 1;
                const rawVal = Math.round(temperature / scale);
                await mb.writeHolding(def.registers.requestedTemperature.address, rawVal);
              }
              if (mode !== undefined && mode !== null) {
                let rawMode: number | null;
                const parsed = Number.parseInt(String(mode), 10);
                if (Number.isFinite(parsed)) {
                  rawMode = parsed;
                } else {
                  const idx = def.registers.mode.values.findIndex((v) => v === mode);
                  rawMode = idx >= 0 ? idx : 0;
                }
                if (rawMode !== null) {
                  await mb.writeHolding(def.registers.mode.address, rawMode);
                }
              }
            },
          );
        } catch (err) {
          this.logger.warn({ err }, "Failed to apply HRU settings from timeline event");
        }
      }
    }

  }

  private scheduleNextTimelineTick(): void {
    if (this.timelineTimer) {
      clearTimeout(this.timelineTimer);
    }
    const now = new Date();
    const msUntilNextMinute = 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());
    this.timelineTimer = setTimeout(() => {
      void this.applyTimelineEvent().finally(() => {
        this.scheduleNextTimelineTick();
      });
    }, msUntilNextMinute);
  }
}
