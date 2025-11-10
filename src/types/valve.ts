export interface Valve {
  entityId: string;
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  state: string;
  attributes: Record<string, unknown>;
}
