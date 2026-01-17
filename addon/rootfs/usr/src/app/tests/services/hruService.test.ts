import { describe, expect, test, mock, beforeEach } from "bun:test";
import type { Logger } from "pino";
import { withTempModbusClient } from "../../src/services/hruService";

// Mock implementation
const mockConnect = mock(() => Promise.resolve());
const mockSafeDisconnect = mock(() => Promise.resolve());
const mockReadHolding = mock(() => Promise.resolve([123]));

class MockModbusTcpClient {
  constructor(
    public config: { host: string; port: number; unitId: number },
    public logger: Logger,
  ) {}
}

// Mock the module
mock.module("../../src/services/modbus/ModbusTcpClient", () => ({
  ModbusTcpClient: MockModbusTcpClient,
}));

mock.module("../../src/services/database", () => ({
  getAppSetting: mock(() => null),
  setupDatabase: mock(() => {}),
}));

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Logger;

describe("HruService", () => {
  beforeEach(() => {
    mockConnect.mockClear();
    mockSafeDisconnect.mockClear();
    mockReadHolding.mockClear();
  });

  test("withTempModbusClient should connect, run fn, and disconnect", async () => {
    const result = await withTempModbusClient(
      { host: "localhost", port: 502, unitId: 1 },
      mockLogger,
      async (client) => {
        return await client.readHolding(0, 1);
      },
    );

    expect(mockConnect).toHaveBeenCalled();
    expect(mockSafeDisconnect).toHaveBeenCalled();
    expect(result).toEqual([123]);
  });

  test("withTempModbusClient should disconnect even if function throws", async () => {
    try {
      await withTempModbusClient(
        { host: "localhost", port: 502, unitId: 1 },
        mockLogger,
        async () => {
          throw new Error("Test Error");
        },
      );
    } catch (e) {
      expect((e as Error).message).toBe("Test Error");
    }

    expect(mockConnect).toHaveBeenCalled();
    expect(mockSafeDisconnect).toHaveBeenCalled();
  });
});
