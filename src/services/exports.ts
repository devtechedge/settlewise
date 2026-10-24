import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  auditEvents,
  expenses,
  expenseSplits,
  exportRecords,
  groups,
  participants,
  settlementPayments,
  users,
} from "@/db/schema";
import { buildCsv } from "@/importers/csv";
import { minorToPlainString } from "@/domain/money/money";
import { getCurrency } from "@/domain/money/currency";
import { AppError } from "@/lib/errors";
import { requireGroupRole } from "@/auth/rbac";
import { recordAudit } from "./audit";
import type { Actor } from "./groups";

export type ExportType = "expenses" | "settlements" | "audit";
export const EXPORT_ROW_LIMIT = 10_000;

export async function exportGroupCsv(
  actor: Actor,
  groupId: string,
  type: ExportType,
  range: { from?: string; to?: string },
) {
  await requireGroupRole(groupId, actor.id, "MEMBER");
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group) throw new AppError("NOT_FOUND", "Group not found.");
  const currency = getCurrency(group.currency);

  let headers: string[];
  let rows: (string | number | bigint | null)[][];

  if (type === "expenses") {
    const conditions = [eq(expenses.groupId, groupId), eq(expenses.status, "ACTIVE")];
    if (range.from) conditions.push(gte(expenses.occurredOn, range.from));
    if (range.to) conditions.push(lte(expenses.occurredOn, range.to));
    const [count] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(expenses)
      .where(and(...conditions));
    if ((count?.count ?? 0) > EXPORT_ROW_LIMIT) {
      throw new AppError("PAYLOAD_TOO_LARGE", `This export exceeds ${EXPORT_ROW_LIMIT} rows. Narrow the date range.`);
    }
    const expenseRows = await db
      .select({
        id: expenses.id,
        occurredOn: expenses.occurredOn,
        description: expenses.description,
        category: expenses.category,
        payerName: participants.displayName,
        amountMinor: expenses.amountMinor,
        notes: expenses.notes,
        revision: expenses.revision,
        createdAt: expenses.createdAt,
      })
      .from(expenses)
      .innerJoin(participants, eq(participants.id, expenses.payerParticipantId))
      .where(and(...conditions))
      .orderBy(asc(expenses.occurredOn), asc(expenses.createdAt));
    const ids = expenseRows.map((row) => row.id);
    const splitRows =
      ids.length > 0
        ? await db
            .select({
              expenseId: expenseSplits.expenseId,
              name: participants.displayName,
              amountMinor: expenseSplits.allocatedMinor,
            })
            .from(expenseSplits)
            .innerJoin(participants, eq(participants.id, expenseSplits.participantId))
            .where(inArray(expenseSplits.expenseId, ids))
            .orderBy(participants.displayName)
        : [];
    const splitsByExpense = new Map<string, string[]>();
    for (const split of splitRows) {
      const list = splitsByExpense.get(split.expenseId) ?? [];
      list.push(`${split.name}: ${minorToPlainString(split.amountMinor, currency)}`);
      splitsByExpense.set(split.expenseId, list);
    }
    headers = ["Date", "Description", "Category", "Payer", "Amount", "Currency", "Shares", "Notes", "Revision", "Created at"];
    rows = expenseRows.map((row) => [
      row.occurredOn,
      row.description,
      row.category,
      row.payerName,
      minorToPlainString(row.amountMinor, currency),
      currency.code,
      (splitsByExpense.get(row.id) ?? []).join("; "),
      row.notes,
      row.revision,
      row.createdAt.toISOString(),
    ]);
  } else if (type === "settlements") {
    const conditions = [eq(settlementPayments.groupId, groupId)];
    if (range.from) conditions.push(gte(settlementPayments.paidOn, range.from));
    if (range.to) conditions.push(lte(settlementPayments.paidOn, range.to));
    const [count] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(settlementPayments)
      .where(and(...conditions));
    if ((count?.count ?? 0) > EXPORT_ROW_LIMIT) {
      throw new AppError("PAYLOAD_TOO_LARGE", `This export exceeds ${EXPORT_ROW_LIMIT} rows. Narrow the date range.`);
    }
    const recipient = alias(participants, "export_recipient");
    const paymentRows = await db
      .select({
        paidOn: settlementPayments.paidOn,
        fromName: participants.displayName,
        toName: recipient.displayName,
        amountMinor: settlementPayments.amountMinor,
        status: settlementPayments.status,
        notes: settlementPayments.notes,
        createdByName: users.displayName,
        reversedAt: settlementPayments.reversedAt,
      })
      .from(settlementPayments)
      .innerJoin(participants, eq(participants.id, settlementPayments.senderParticipantId))
      .innerJoin(recipient, eq(recipient.id, settlementPayments.recipientParticipantId))
      .innerJoin(users, eq(users.id, settlementPayments.createdBy))
      .where(and(...conditions))
      .orderBy(asc(settlementPayments.paidOn));
    headers = ["Date", "From", "To", "Amount", "Currency", "Status", "Notes", "Recorded by", "Reversed at"];
    rows = paymentRows.map((row) => [
      row.paidOn,
      row.fromName,
      row.toName,
      minorToPlainString(row.amountMinor, currency),
      currency.code,
      row.status,
      row.notes,
      row.createdByName,
      row.reversedAt?.toISOString() ?? "",
    ]);
  } else {
    const conditions = [eq(auditEvents.groupId, groupId)];
    if (range.from) conditions.push(gte(sql`${auditEvents.createdAt}::date`, range.from));
    if (range.to) conditions.push(lte(sql`${auditEvents.createdAt}::date`, range.to));
    const [count] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditEvents)
      .where(and(...conditions));
    if ((count?.count ?? 0) > EXPORT_ROW_LIMIT) {
      throw new AppError("PAYLOAD_TOO_LARGE", `This export exceeds ${EXPORT_ROW_LIMIT} rows. Narrow the date range.`);
    }
    const auditRows = await db
      .select({
        createdAt: auditEvents.createdAt,
        actorName: users.displayName,
        action: auditEvents.action,
        targetType: auditEvents.targetType,
        targetId: auditEvents.targetId,
        reason: auditEvents.reason,
        beforeRevision: auditEvents.beforeRevision,
        afterRevision: auditEvents.afterRevision,
      })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorId))
      .where(and(...conditions))
      .orderBy(asc(auditEvents.createdAt));
    headers = ["Timestamp", "Actor", "Action", "Target type", "Target ID", "Reason", "Before revision", "After revision"];
    rows = auditRows.map((row) => [
      row.createdAt.toISOString(),
      row.actorName,
      row.action,
      row.targetType,
      row.targetId,
      row.reason,
      row.beforeRevision,
      row.afterRevision,
    ]);
  }

  const csv = buildCsv(headers, rows);
  const checksum = createHash("sha256").update(csv).digest("hex");
  await db.transaction(async (tx) => {
    await tx.insert(exportRecords).values({
      groupId,
      createdBy: actor.id,
      format: "CSV",
      filters: { type, from: range.from ?? null, to: range.to ?? null },
      checksum,
      rowCount: rows.length,
    });
    await recordAudit(tx, {
      groupId,
      actorId: actor.id,
      action: "EXPORT_CREATED",
      targetType: "export",
      metadata: { type, rowCount: rows.length, from: range.from ?? null, to: range.to ?? null },
    });
  });

  const safeName = group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "group";
  return { csv, filename: `${safeName}-${type}-${new Date().toISOString().slice(0, 10)}.csv`, rowCount: rows.length };
}
