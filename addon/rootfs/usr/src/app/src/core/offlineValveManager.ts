import type { Logger } from "pino";
import type { BroadcastFn, ValveController, ValveSnapshot } from "./valveManager";

// Provides a stub controller when the add-on runs without Home Assistant credentials (dev/tests).
// It keeps the backend bootable, emits an empty snapshot for the UI, and blocks valve mutations with
// a predictable "Offline mode" error instead of crashing on missing HA connectivity.
export class OfflineValveManager implements ValveController {
  constructor(private readonly logger: Logger, private readonly broadcast: BroadcastFn) {}

  async start(): Promise<void> {
    this.logger.warn("Valve manager running in offline mode; Home Assistant communication disabled");
    await this.broadcast({ type: "snapshot", payload: [] });
  }

  async stop(): Promise<void> {
    this.logger.info("Valve manager offline shutdown complete");
  }

  async getSnapshot(): Promise<ValveSnapshot[]> {
    return [];
  }

  async setValue(): Promise<ValveSnapshot> {
    throw new Error("Offline mode: valve control unavailable");
  }
}
