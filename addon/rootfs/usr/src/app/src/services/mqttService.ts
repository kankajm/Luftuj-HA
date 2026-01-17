import mqtt from "mqtt";
import type { Logger } from "pino";
import type { AppConfig } from "../config/options";
import type { HruUnitDefinition } from "../hru/definitions";
import { getAppSetting } from "./database";
import { MQTT_SETTINGS_KEY, type MqttSettings } from "../types";

const DISCOVERY_PREFIX = "homeassistant";
const BASE_TOPIC = "luftuj/hru";

export class MqttService {
  private client: mqtt.MqttClient | null = null;
  private connected = false;

  constructor(
    private readonly envConfig: AppConfig["mqtt"],
    private readonly logger: Logger,
  ) {}

  private resolveConfig(): AppConfig["mqtt"] {
    const raw = getAppSetting(MQTT_SETTINGS_KEY);
    if (raw) {
      try {
        const dbSettings = JSON.parse(raw) as MqttSettings;
        if (dbSettings.enabled) {
          return {
            host: dbSettings.host,
            port: dbSettings.port,
            user: dbSettings.user ?? null,
            password: dbSettings.password ?? null,
          };
        }
        // Explicitly disabled in DB overrides ENV?
        // Or if disabled in DB, do we fallback to ENV?
        // "Disabled in DB" probably means "User turned it off in UI".
        // So we should respect that and return null/empty host.
        return { host: null, port: 1883, user: null, password: null };
      } catch (err) {
        this.logger.warn({ err }, "Failed to parse MQTT settings from DB");
      }
    }
    // Fallback to ENV config
    return this.envConfig;
  }

  async reloadConfig(): Promise<void> {
    await this.disconnect();
    await this.connect();
  }

  async connect(): Promise<void> {
    const config = this.resolveConfig();

    if (!config.host) {
      this.logger.info("MQTT host not configured, skipping MQTT service");
      return;
    }

    const brokerUrl = `mqtt://${config.host}:${config.port}`;
    this.logger.info({ brokerUrl }, "Connecting to MQTT broker");

    try {
      this.client = await mqtt.connectAsync(brokerUrl, {
        username: config.user ?? undefined,
        password: config.password ?? undefined,
        clientId: "luftuj-addon",
        clean: true,
      });

      this.connected = true;
      this.logger.info("MQTT connected");

      this.client.on("error", (err) => {
        this.logger.error({ err }, "MQTT error");
      });

      this.client.on("close", () => {
        if (this.connected) {
          this.logger.warn("MQTT connection closed");
          this.connected = false;
        }
      });

      this.client.on("connect", () => {
        this.connected = true;
        this.logger.info("MQTT reconnected");
      });
    } catch (err) {
      this.logger.error({ err }, "Failed to connect to MQTT broker");
      // Don't throw, just log. Retry logic is built into mqtt client if we want,
      // but connectAsync throws if initial connection fails.
    }
  }

  async publishDiscovery(unit: HruUnitDefinition): Promise<void> {
    if (!this.client || !this.connected) return;

    const device = {
      identifiers: [`luftuj_hru_${unit.id}`],
      name: `Luftuj HRU (${unit.name})`,
      model: unit.name,
      manufacturer: "Luftuj",
    };

    // 1. Requested Power
    await this.publishConfig("sensor", "requested_power", {
      name: "Requested Power",
      unique_id: `luftuj_hru_${unit.id}_power`,
      state_topic: `${BASE_TOPIC}/state`,
      value_template: "{{ value_json.power }}",
      unit_of_measurement: "%",
      device_class: "power_factor", // Using power_factor as it is percentage based 0-100 commonly
      device,
    });

    // 2. Requested Temperature
    await this.publishConfig("sensor", "requested_temperature", {
      name: "Requested Temperature",
      unique_id: `luftuj_hru_${unit.id}_temperature`,
      state_topic: `${BASE_TOPIC}/state`,
      value_template: "{{ value_json.temperature }}",
      unit_of_measurement: "°C",
      device_class: "temperature",
      device,
    });

    // 3. Mode
    await this.publishConfig("sensor", "mode", {
      name: "Mode",
      unique_id: `luftuj_hru_${unit.id}_mode`,
      state_topic: `${BASE_TOPIC}/state`,
      value_template: "{{ value_json.mode }}",
      device,
    });
  }

  async publishState(state: {
    power?: number;
    temperature?: number;
    mode?: string;
  }): Promise<void> {
    if (!this.client || !this.connected) {
      this.logger.debug("MQTT: publishState called but not connected");
      return;
    }

    try {
      const topic = `${BASE_TOPIC}/state`;
      const payload = JSON.stringify(state);
      this.logger.debug({ topic, payload }, "MQTT: Publishing state");

      await this.client.publishAsync(topic, payload, {
        retain: false,
      });
    } catch (err) {
      this.logger.error({ err }, "Failed to publish MQTT state");
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.logger.info("MQTT: Disconnecting...");
      await this.client.endAsync();
      this.client = null;
      this.connected = false;
    }
  }

  private async publishConfig(
    component: string,
    objectId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.client) return;

    const topic = `${DISCOVERY_PREFIX}/${component}/luftuj_hru/${objectId}/config`;
    this.logger.debug({ topic }, "MQTT: Publishing discovery config");
    try {
      await this.client.publishAsync(topic, JSON.stringify(payload), { retain: true });
    } catch (err) {
      this.logger.error({ err, topic }, "Failed to publish discovery message");
    }
  }
}
