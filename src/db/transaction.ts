import "server-only";
import { db, type Transaction } from "./client";

function isRetryable(error: unknown): boolean {
  if (typeof error !== "object" || !error) return false;
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate.code === "40001" || candidate.code === "40P01" || candidate.cause?.code === "40001";
}

export async function serializable<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.transaction(fn, { isolationLevel: "serializable" });
    } catch (error) {
      lastError = error;
      if (!isRetryable(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  throw lastError;
}
