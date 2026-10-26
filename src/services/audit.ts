import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, users } from "@/db/schema";
import { requireGroupRole } from "@/auth/rbac";
import type { Transaction } from "@/db/client";
import { auditEvents as auditEventsTable } from "@/db/schema";

export type AuditInput = {
  groupId: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  beforeRevision?: number | null;
  afterRevision?: number | null;
};

export async function recordAudit(tx: Transaction, input: AuditInput) {
  await tx.insert(auditEventsTable).values({
    groupId: input.groupId,
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    reason: input.reason ?? null,
    metadata: input.metadata ?? null,
    beforeRevision: input.beforeRevision ?? null,
    afterRevision: input.afterRevision ?? null,
  });
}

export async function listAuditEvents(
  groupId: string,
  userId: string,
  options: { page?: number; pageSize?: number; action?: string } = {},
) {
  await requireGroupRole(groupId, userId, "MEMBER");
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 30));
  const conditions = [eq(auditEvents.groupId, groupId)];
  if (options.action) conditions.push(eq(auditEvents.action, options.action));
  const where = and(...conditions);
  const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(auditEvents).where(where);
  const rows = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      targetType: auditEvents.targetType,
      targetId: auditEvents.targetId,
      reason: auditEvents.reason,
      metadata: auditEvents.metadata,
      beforeRevision: auditEvents.beforeRevision,
      afterRevision: auditEvents.afterRevision,
      createdAt: auditEvents.createdAt,
      actorName: users.displayName,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorId))
    .where(where)
    .orderBy(desc(auditEvents.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    rows,
    total: count?.count ?? 0,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil((count?.count ?? 0) / pageSize)),
  };
}

export async function listAuditActions(groupId: string) {
  const rows = await db
    .selectDistinct({ action: auditEvents.action })
    .from(auditEvents)
    .where(eq(auditEvents.groupId, groupId))
    .orderBy(auditEvents.action);
  return rows.map((row) => row.action);
}
