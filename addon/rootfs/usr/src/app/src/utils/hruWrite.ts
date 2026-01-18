export function resolveModeValue(values: Record<number, string>, mode: number | string) {
  if (typeof mode === "number") {
    return mode;
  }
  const entry = Object.entries(values).find(([, name]) => name === mode);
  if (entry) {
    return Number(entry[0]);
  }
  const parsed = Number.parseInt(String(mode), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function applyWriteDefinition(
  mb: {
    writeHolding: (address: number, value: number) => Promise<void>;
  },
  writeDef: {
    steps: Array<{
      address: number;
      kind: "holding" | "input";
      value: number | ((input: number) => number);
      delayMs?: number;
    }>;
  },
  inputValue: number,
) {
  for (const step of writeDef.steps) {
    const value = typeof step.value === "function" ? step.value(inputValue) : step.value;
    if (step.kind === "input") {
      await mb.writeHolding(step.address, value);
    } else {
      await mb.writeHolding(step.address, value);
    }
    if (step.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, step.delayMs));
    }
  }
}
