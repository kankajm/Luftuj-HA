import { resolveApiUrl } from "../utils/api";
import type { Valve } from "../types/valve";

export async function fetchValves(): Promise<Valve[]> {
  const res = await fetch(resolveApiUrl("/api/valves"));
  if (!res.ok) throw new Error("Failed to fetch valves");

  const data = (await res.json()) as { valves?: Valve[] } | Valve[];
  return Array.isArray(data) ? data : (data.valves ?? []);
}
