export type RegisterKind = "holding" | "input";

export interface HruRegister {
  address: number;
  kind: RegisterKind; // register type
  scale?: number; // multiply raw value by scale (e.g., 0.1)
  precision?: number; // client hint
  unit?: string; // client hint
}

export interface HruEnumRegister extends HruRegister {
  values: string[]; // index-based mapping 0..n-1
}

export interface HruUnitDefinition {
  id: string;
  name: string;
  description?: string;
  registers: {
    requestedPower: HruRegister; // %
    requestedTemperature: HruRegister; // °C
    mode: HruEnumRegister; // enumerated modes
  };
}

export const HRU_UNITS: HruUnitDefinition[] = [
  {
    id: "atrea-rd5",
    name: "Atrea RD5",
    description: "Atrea RD5 heat recovery unit controlled over Modbus TCP",
    registers: {
      requestedPower: {
        address: 10704,
        kind: "holding",
        unit: "%",
      },
      requestedTemperature: {
        address: 10706,
        kind: "holding",
        scale: 0.1,
        precision: 1,
        unit: "°C",
      },
      mode: {
        address: 10705,
        kind: "holding",
        values: [
          "Vypnuto",
          "Automat",
          "Větrání",
          "Cirkulace s větráním",
          "Cirkulace",
          "Noční předchlazení",
          "Rozvážení",
          "Přetlak",
        ],
      },
    },
  },
];

export function getUnitById(id: string): HruUnitDefinition | undefined {
  return HRU_UNITS.find((u) => u.id === id);
}
