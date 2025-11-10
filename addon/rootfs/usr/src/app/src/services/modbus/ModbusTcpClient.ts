import ModbusRTU from "modbus-serial";
import type { Logger } from "pino";

export interface ModbusTcpConfig {
  host: string;
  port: number;
  unitId: number;
  timeoutMs?: number;
  reconnectMs?: number;
}

export class ModbusTcpClient {
  private client = new ModbusRTU();
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly cfg: ModbusTcpConfig,
    private readonly logger: Logger,
  ) {
    const timeout = cfg.timeoutMs ?? 2000;
    this.client.setTimeout(timeout);
  }

  async connect(): Promise<void> {
    await this.safeDisconnect();
    return new Promise((resolve, reject) => {
      this.logger.info({ host: this.cfg.host, port: this.cfg.port }, "Connecting Modbus TCP");
      this.client.connectTCP(this.cfg.host, { port: this.cfg.port }, async (err?: Error) => {
        if (err) {
          this.logger.warn({ err }, "Modbus TCP connect failed");
          this.scheduleReconnect();
          reject(err);
          return;
        }
        try {
          this.client.setID(this.cfg.unitId);
          this.connected = true;
          this.logger.info({ unitId: this.cfg.unitId }, "Modbus TCP connected");
          resolve();
        } catch (e) {
          this.logger.error({ e }, "Failed to set unit ID for Modbus TCP");
          reject(e);
        }
      });
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const wait = this.cfg.reconnectMs ?? 3000;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch(() => {
        /* keep retrying */
      });
    }, wait);
  }

  async safeDisconnect(): Promise<void> {
    if (!this.connected) return;
    try {
      this.client.close(() => {
        this.connected = false;
        this.logger.info("Modbus TCP disconnected");
      });
    } catch (e) {
      this.logger.warn({ e }, "Modbus TCP disconnect error");
    }
  }

  isConnected() {
    return this.connected;
  }

  async readHolding(start: number, length: number): Promise<number[]> {
    const res = await this.client.readHoldingRegisters(start, length);
    return Array.from(res.data);
  }

  async readInput(start: number, length: number): Promise<number[]> {
    const res = await this.client.readInputRegisters(start, length);
    return Array.from(res.data);
  }

  async writeHolding(start: number, values: number | number[]): Promise<void> {
    if (Array.isArray(values)) {
      await this.client.writeRegisters(start, values);
    } else {
      await this.client.writeRegister(start, values);
    }
  }
}
