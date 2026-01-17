import { describe, expect, test, mock, beforeEach, setSystemTime, afterEach } from "bun:test";
import { TimelineRunner } from "../../src/services/timelineRunner";
import type { ValveController } from "../../src/core/valveManager";
import type { Logger } from "pino";
import type { TimelineEvent } from "../../src/services/database";
import type { getHruDefinitionSafe } from "../../src/services/hruService";
import type { HruSettings } from "../../src/types";
import type { HruUnitDefinition } from "../../src/hru/definitions";

// Mock dependencies
const mockGetTimelineEvents = mock<() => TimelineEvent[]>(() => []);
mock.module("../../src/services/database", () => ({
  getTimelineEvents: mockGetTimelineEvents,
}));

const mockGetHruDefinitionSafe = mock<() => ReturnType<typeof getHruDefinitionSafe>>(() => null);
const mockModbusWriteHolding = mock(async () => {});
const mockWithTempModbusClient = mock(async (_cfg, _logger, fn) => {
  const mockClient = {
    writeHolding: mockModbusWriteHolding,
  };
  await fn(mockClient as never);
});

mock.module("../../src/services/hruService", () => ({
  getHruDefinitionSafe: mockGetHruDefinitionSafe,
  withTempModbusClient: mockWithTempModbusClient,
}));

const mockLogger = {
  info: mock(() => {}),
  warn: mock(() => {}),
  debug: mock(() => {}),
  error: mock(() => {}),
} as unknown as Logger;

const mockSetValue = mock(async () => ({}));
const mockValveManager = {
  setValue: mockSetValue,
} as unknown as ValveController;

describe("TimelineRunner", () => {
  beforeEach(() => {
    mockGetTimelineEvents.mockClear();
    mockGetHruDefinitionSafe.mockClear();
    mockWithTempModbusClient.mockClear();
    mockModbusWriteHolding.mockClear();
    mockSetValue.mockClear();
    setSystemTime(new Date("2024-01-01T12:00:00Z")); // Monday
  });

  afterEach(() => {
    setSystemTime(); // reset
  });

  test("should pick active event based on time and priority", async () => {
    const events = [
      {
        id: 1,
        startTime: "10:00",
        endTime: "14:00",
        dayOfWeek: 0, // Monday
        priority: 10,
        enabled: true,
        luftatorConfig: { "valve.1": 50 },
      },
      {
        id: 2,
        startTime: "11:00",
        endTime: "13:00",
        dayOfWeek: 0, // Monday
        priority: 20, // Higher priority should win
        enabled: true,
        luftatorConfig: { "valve.1": 100 },
      },
    ];
    mockGetTimelineEvents.mockReturnValue(events);

    const runner = new TimelineRunner(mockValveManager, mockLogger);
    await (runner as unknown as { applyTimelineEvent: () => Promise<void> }).applyTimelineEvent();

    expect(mockSetValue).toHaveBeenCalledWith("valve.1", 100);
    expect(mockSetValue).toHaveBeenCalledTimes(1);
  });

  test("should ignore disabled events", async () => {
    const events = [
      {
        id: 1,
        startTime: "10:00",
        endTime: "14:00",
        dayOfWeek: 0,
        priority: 10,
        enabled: false,
        luftatorConfig: { "valve.1": 50 },
      },
    ];
    mockGetTimelineEvents.mockReturnValue(events);

    const runner = new TimelineRunner(mockValveManager, mockLogger);
    await (runner as unknown as { applyTimelineEvent: () => Promise<void> }).applyTimelineEvent();

    expect(mockSetValue).not.toHaveBeenCalled();
  });

  test("should apply HRU settings if configured", async () => {
    const events = [
      {
        id: 1,
        startTime: "10:00",
        endTime: "14:00",
        dayOfWeek: 0,
        priority: 10,
        enabled: true,
        hruConfig: { power: 60, temperature: 22 },
      },
    ];
    mockGetTimelineEvents.mockReturnValue(events);

    const mockDef = {
      settings: { unit: "mock-unit", host: "localhost", port: 502, unitId: 1 },
      def: {
        id: "mock-hru",
        name: "Mock HRU",
        registers: {
          requestedPower: { address: 100, kind: "holding" },
          requestedTemperature: { address: 101, kind: "holding", scale: 0.1 },
          mode: { address: 102, kind: "holding", values: ["a", "b"] },
        },
      },
    } satisfies { settings: HruSettings; def: HruUnitDefinition };
    mockGetHruDefinitionSafe.mockReturnValue(mockDef);

    const runner = new TimelineRunner(mockValveManager, mockLogger);
    await (runner as unknown as { applyTimelineEvent: () => Promise<void> }).applyTimelineEvent();

    expect(mockWithTempModbusClient).toHaveBeenCalled();
    // Verify writes
    // Power 60 -> address 100
    expect(mockModbusWriteHolding).toHaveBeenCalledWith(100, 60);
    // Temp 22 / scale 0.1 = 220 -> address 101
    expect(mockModbusWriteHolding).toHaveBeenCalledWith(101, 220);
  });
});
