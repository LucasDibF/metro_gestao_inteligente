export interface PoolSettings {
  max: number;
  maxWaitMs: number;
  lockTimeoutMs: number;
}
function positiveInteger(value: string | undefined, fallback: number): number {
  return value && /^[1-9]\d*$/.test(value) ? Number(value) : fallback;
}
export function poolSettings(env: Record<string, string | undefined> = process.env): PoolSettings {
  return {
    max: positiveInteger(env.DATABASE_POOL_MAX, 20),
    maxWaitMs: positiveInteger(env.DATABASE_POOL_MAX_WAIT_MS, 5000),
    lockTimeoutMs: positiveInteger(env.DATABASE_LOCK_TIMEOUT_MS, 5000),
  };
}
