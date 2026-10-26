import { and, sql, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, participants, users } from "@/db/schema";
import { hashPassword } from "@/auth/password";
import { createGroup, type Actor } from "@/services/groups";

let sequence = 0;

export async function resetDatabase() {
  await db.execute(sql`truncate table users, groups, rate_limits restart identity cascade`);
}

export async function makeUser(displayName = "Test User", emailPrefix = "user"): Promise<Actor & { password: string; createdAt: Date }> {
  sequence += 1;
  const email = `${emailPrefix}.${Date.now()}.${sequence}@example.test`;
  const password = `integration-password-${sequence}`;
  const rows = await db
    .insert(users)
    .values({ email, displayName, passwordHash: await hashPassword(password) })
    .returning({ id: users.id });
  const id = rows[0]?.id;
  if (!id) throw new Error("Test user was not created.");
  return { id, displayName, email, password, createdAt: new Date() };
}

export async function makeGroup(actor: Actor, name = "Test group", budget?: string) {
  const result = await createGroup(actor, { name, currency: "INR", budget, invites: [] });
  return result.group;
}

export async function makeMember(groupId: string, actor: Actor, role: "EDITOR" | "MEMBER", displayName = actor.displayName) {
  const existingMembership = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, actor.id)))
    .limit(1);
  if (!existingMembership[0]) {
    await db.insert(memberships).values({ groupId, userId: actor.id, role });
  }
  const existingParticipant = await db
    .select({ id: participants.id })
    .from(participants)
    .where(and(eq(participants.groupId, groupId), eq(participants.userId, actor.id)))
    .limit(1);
  if (existingParticipant[0]) return existingParticipant[0].id;
  const rows = await db
    .insert(participants)
    .values({ groupId, userId: actor.id, displayName, createdBy: actor.id })
    .returning({ id: participants.id });
  const id = rows[0]?.id;
  if (!id) throw new Error("Test participant was not created.");
  return id;
}

export async function makeUnlinkedParticipant(groupId: string, actor: Actor, displayName: string) {
  const rows = await db
    .insert(participants)
    .values({ groupId, displayName, createdBy: actor.id })
    .returning({ id: participants.id });
  const id = rows[0]?.id;
  if (!id) throw new Error("Test participant was not created.");
  return id;
}

export function daysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export async function expectAppError(action: () => Promise<unknown>, code: string) {
  try {
    await action();
  } catch (error) {
    const candidate = error as { code?: string };
    if (candidate.code !== code) {
      throw new Error(`Expected ${code}, received ${candidate.code ?? String(error)}`);
    }
    return error;
  }
  throw new Error(`Expected ${code}, but the action succeeded.`);
}
