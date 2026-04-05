import { createPool, type Pool } from "mysql2";
import { ENV } from "./env";

let pool: Pool | null = null;

export function getMySqlPool(): Pool | null {
  if (!ENV.databaseUrl) {
    return null;
  }

  if (!pool) {
    pool = createPool(ENV.databaseUrl);
  }

  return pool;
}

export function getRequiredMySqlPool(): Pool {
  const currentPool = getMySqlPool();

  if (!currentPool) {
    throw new Error("DATABASE_URL is required");
  }

  return currentPool;
}
