import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { createOpaqueToken, hashIdentifier, hashToken } from "./tokens";

export const SESSION_COOKIE = "settlewise_session";
const SESSION_DAYS = 30;
const TOUCH_INTERVAL_MS = 10 * 60 * 1000;

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
};

export type AuthContext = {
  user: SessionUser;
  sessionId: string;
  sessionCreatedAt: Date;
  sessionLastUsedAt: Date;
  expiresAt: Date;
  userAgent: string | null;
};

export async function createSession(userId: string, meta: { request?: Request; userAgent?: string | null } = {}) {
  const token = createOpaqueToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const forwarded = meta.request?.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || meta.request?.headers.get("x-real-ip") || "local";
  const userAgent = (meta.userAgent ?? meta.request?.headers.get("user-agent") ?? "").slice(0, 300) || null;

  await db.insert(sessions).values({
    userId,
    tokenHash,
    expiresAt,
    userAgent,
    ipHash: hashIdentifier(ip),
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return { token, expiresAt };
}

export const getCurrentAuth = cache(async (): Promise<AuthContext | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = hashToken(token);

  const rows = await db
    .select({
      sessionId: sessions.id,
      sessionCreatedAt: sessions.createdAt,
      sessionLastUsedAt: sessions.lastUsedAt,
      expiresAt: sessions.expiresAt,
      userAgent: sessions.userAgent,
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      userCreatedAt: users.createdAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
        isNull(users.disabledAt),
        isNull(users.anonymizedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (Date.now() - row.sessionLastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, row.sessionId));
  }

  return {
    user: { id: row.id, email: row.email, displayName: row.displayName, createdAt: row.userCreatedAt },
    sessionId: row.sessionId,
    sessionCreatedAt: row.sessionCreatedAt,
    sessionLastUsedAt: row.sessionLastUsedAt,
    expiresAt: row.expiresAt,
    userAgent: row.userAgent,
  };
});

export async function requireAuth(): Promise<AuthContext> {
  const auth = await getCurrentAuth();
  if (!auth) throw new AppError("UNAUTHENTICATED", "Sign in to continue.");
  return auth;
}

export async function revokeSession(sessionId: string, userId: string) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
}

export async function revokeOtherSessions(userId: string, keepSessionId: string) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId), isNull(sessions.revokedAt)));
}

export async function revokeAllSessions(userId: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, userId));
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function listSessions(userId: string) {
  return db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      lastUsedAt: sessions.lastUsedAt,
      expiresAt: sessions.expiresAt,
      userAgent: sessions.userAgent,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(sessions.createdAt);
}
