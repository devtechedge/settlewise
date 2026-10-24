import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { rateLimits } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { hashIdentifier } from "./tokens";

export type RateLimitResult = {
  count: number;
  limit: number;
  resetAt: Date;
};

export async function consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const rows = await db
    .insert(rateLimits)
    .values({ key, windowStart: new Date(), count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        windowStart: sql`case when ${rateLimits.windowStart} < now() - (${windowSeconds} * interval '1 second') then now() else ${rateLimits.windowStart} end`,
        count: sql`case when ${rateLimits.windowStart} < now() - (${windowSeconds} * interval '1 second') then 1 else ${rateLimits.count} + 1 end`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });

  const row = rows[0];
  if (!row) throw new AppError("INTERNAL_ERROR", "Rate limit could not be recorded.");
  const resetAt = new Date(row.windowStart.getTime() + windowSeconds * 1000);
  if (row.count > limit) {
    throw new AppError("RATE_LIMITED", "Too many attempts. Wait a few minutes and try again.", {
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
    });
  }
  return { count: row.count, limit, resetAt };
}

type HeaderSource = { headers: Headers };

export function requestFingerprint(source: HeaderSource): string {
  const forwarded = source.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || source.headers.get("x-real-ip") || "local";
  return hashIdentifier(ip);
}

export async function limitLogin(source: HeaderSource, email: string) {
  const ipKey = `login-ip:${requestFingerprint(source)}`;
  const accountKey = `login-email:${hashIdentifier(email.toLowerCase())}`;
  await consumeRateLimit(ipKey, 30, 60 * 60);
  await consumeRateLimit(accountKey, 10, 15 * 60);
}

export async function limitSignup(source: HeaderSource) {
  await consumeRateLimit(`signup:${requestFingerprint(source)}`, 10, 60 * 60);
}

export async function limitInvitationAccept(source: HeaderSource) {
  await consumeRateLimit(`invite-accept:${requestFingerprint(source)}`, 30, 60 * 60);
}

export async function limitDemoLogin(source: HeaderSource) {
  await consumeRateLimit(`demo-login:${requestFingerprint(source)}`, 20, 60 * 60);
}

export async function clearRateLimits() {
  await db.delete(rateLimits);
}
