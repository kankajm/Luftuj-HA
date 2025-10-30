import type { Logger } from "pino";
import WebSocket from "ws";

export interface HassState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
  context?: Record<string, unknown>;
}

export interface HassStateChangedEvent {
  entity_id: string;
  new_state: HassState | null;
  old_state: HassState | null;
}

export type HassEventHandler = (event: HassStateChangedEvent) => Promise<void> | void;

const LUFTATOR_ENTITY_PREFIX = "number.luftator_";
const STATE_CHANGED_EVENT = "state_changed";
const RECONNECT_DELAY_MS = 5_000;

export class HomeAssistantClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(baseUrl: string, private readonly token: string, private readonly logger: Logger) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  async fetchLuftatorEntities(): Promise<HassState[]> {
    const response = await fetch(`${this.baseUrl}/api/states`, {
      headers: this.headers,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to fetch Home Assistant states: ${response.status} ${body}`);
    }

    const payload = (await response.json()) as HassState[];
    return payload.filter((entity) => entity.entity_id.startsWith(LUFTATOR_ENTITY_PREFIX));
  }

  async setValveValue(entityId: string, value: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/services/number/set_value`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ entity_id: entityId, value }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error({ entityId, value, body, status: response.status }, "Failed to set valve value");
      throw new Error(`Failed to set valve value for ${entityId}: ${response.status}`);
    }
  }

  subscribeLuftatorEvents(handler: HassEventHandler): () => void {
    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let subscriptionId = 1;

    const websocketUrl = this.toWebSocketUrl("/api/websocket");

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = (reason: string) => {
      this.logger.warn({ reason }, "Home Assistant WebSocket disconnected; scheduling reconnect");
      clearReconnectTimer();
      if (!active) {
        return;
      }
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
    };

    const cleanupSocket = () => {
      if (socket) {
        socket.removeAllListeners();
        socket.terminate();
        socket = null;
      }
    };

    const connect = () => {
      if (!active) {
        return;
      }

      cleanupSocket();
      clearReconnectTimer();

      this.logger.info({ url: websocketUrl }, "Connecting to Home Assistant WebSocket");
      socket = new WebSocket(websocketUrl, {
        headers: {
          Authorization: this.headers.Authorization,
        },
      });

      socket.on("open", () => {
        this.logger.info("Home Assistant WebSocket connection established");
      });

      socket.on("message", (data) => {
        try {
          const payload = JSON.parse(data.toString()) as Record<string, any>;
          this.handleWebSocketMessage(payload, socket!, handler);
        } catch (error) {
          this.logger.error({ error }, "Failed to process Home Assistant WebSocket message");
        }
      });

      socket.on("error", (error) => {
        this.logger.error({ error }, "Home Assistant WebSocket error");
      });

      socket.on("close", (code, reason) => {
        const message = reason.toString() || "socket closed";
        scheduleReconnect(`${code}: ${message}`);
      });
    };

    connect();

    return () => {
      active = false;
      clearReconnectTimer();
      cleanupSocket();
    };
  }

  private handleWebSocketMessage(message: Record<string, any>, socket: WebSocket, handler: HassEventHandler): void {
    switch (message.type) {
      case "auth_required":
        socket.send(JSON.stringify({ type: "auth", access_token: this.token }));
        break;
      case "auth_ok":
        socket.send(
          JSON.stringify({
            id: Date.now(),
            type: "subscribe_events",
            event_type: STATE_CHANGED_EVENT,
          }),
        );
        break;
      case "auth_invalid":
        this.logger.error({ message }, "Home Assistant authentication failed");
        socket.close(1011, "auth_failed");
        break;
      case "event":
        this.processEvent(message.event, handler);
        break;
      default:
        break;
    }
  }

  private processEvent(eventPayload: Record<string, any>, handler: HassEventHandler): void {
    if (!eventPayload) {
      return;
    }

    const { data } = eventPayload;
    const entityId = data?.entity_id as string | undefined;
    const newState = data?.new_state as HassState | undefined | null;
    const oldState = data?.old_state as HassState | undefined | null;

    if (!entityId || !newState || !entityId.startsWith(LUFTATOR_ENTITY_PREFIX)) {
      return;
    }

    const event: HassStateChangedEvent = {
      entity_id: entityId,
      new_state: newState ?? null,
      old_state: oldState ?? null,
    };

    void Promise.resolve(handler(event)).catch((error) => {
      this.logger.error({ error }, "Unhandled error in event handler");
    });
  }

  private toWebSocketUrl(pathname: string): string {
    const baseUrl = new URL(this.baseUrl);
    const basePath = baseUrl.pathname.replace(/\/$/, "");
    const targetPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
    baseUrl.pathname = `${basePath}${targetPath}`;
    baseUrl.protocol = baseUrl.protocol.replace("http", "ws");
    return baseUrl.toString();
  }
}
