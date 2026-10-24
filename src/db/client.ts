import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/env";
import * as schema from "./schema";

type GlobalWithDb = typeof globalThis & {
  __settlewisePool?: Pool;
  __settlewiseDb?: ReturnType<typeof drizzle<typeof schema>>;
};

const globalWithDb = globalThis as GlobalWithDb;

function createPool() {
  const env = getEnv();
  return new Pool({
    connectionString: env.DATABASE_URL,
    max: env.NODE_ENV === "production" ? 5 : 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

function createDb() {
  if (!globalWithDb.__settlewisePool) {
    globalWithDb.__settlewisePool = createPool();
  }
  return drizzle(globalWithDb.__settlewisePool, { schema });
}

export const db = globalWithDb.__settlewiseDb ?? createDb();
if (process.env.NODE_ENV !== "production") {
  globalWithDb.__settlewiseDb = db;
}

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
