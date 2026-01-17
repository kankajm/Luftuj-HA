import { resolveApiUrl } from "../utils/api";

export interface HruUnit {
  id: string;
  name: string;
  registers?: { mode?: { values?: string[] } };
}

export async function fetchHruUnits(): Promise<HruUnit[]> {
  const res = await fetch(resolveApiUrl("/api/hru/units"));
  if (!res.ok) throw new Error("Failed to fetch HRU units");
  return res.json();
}
