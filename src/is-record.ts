// A plain object, and nothing else. A list has string keys too, so Array.isArray has to be asked
// separately or `[1, 2]` reads as `{ "0": 1, "1": 2 }`.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
