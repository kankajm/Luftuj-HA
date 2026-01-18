import { resolveApiUrl } from "../utils/api";

export interface HruRegister {
  address: number;
  kind: "holding" | "input";
  scale?: number;
  precision?: number;
  unit?: string;
}

export interface HruUnit {
  id: string;
  name: string;
  capabilities?: {
    supportsPowerWrite?: boolean;
    supportsTemperatureWrite?: boolean;
    supportsModeWrite?: boolean;
  };
  registers?: {
    read?: {
      power?: HruRegister;
      temperature?: HruRegister;
      mode?: { values?: Record<number, string> };
    };
  };
}

export async function fetchHruUnits(): Promise<HruUnit[]> {
  const res = await fetch(resolveApiUrl("/api/hru/units"));
  if (!res.ok) throw new Error("Failed to fetch HRU units");
  return res.json();
}
