import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { expenseRevisions, expenses, expenseSplits, participants } from "@/db/schema";
import { allocateSplit, type SplitInput } from "@/domain/expenses/allocation";
import { parseMoneyToMinor, parsePercentToBasisPoints } from "@/domain/money/money";
import { getCurrency } from "@/domain/money/currency";
import { AppError } from "@/lib/errors";
import { requireGroupRole, requireWritableGroup } from "@/auth/rbac";
import { expenseFingerprint } from "@/importers/fingerprint";
import type { z } from "zod";
import type { expenseCreateSchema, expenseUpdateSchema, voidExpenseSchema } from "@/validation/schemas";
import { recordAudit } from "./audit";
import { getExpenseDetail } from "@/repositories/expenses";
import type { Actor } from "./groups";

type CreateInput = z.infer<typeof expenseCreateSchema>;
type UpdateInput = z.infer<typeof expenseUpdateSchema>;

export type ExpenseSnapshot = {
  description: string;
  category: string;
  occurredOn: string;
  payerParticipantId: string;
  amountMinor: string;
  notes: string | null;
  status: string;
  splits: {
    participantId: string;
    amountMinor: string;
    method: string;
    basisPoints: number | null;
    shares: number | null;
  }[];
};

function toSplitInput(currency: string, input: CreateInput["split"]): SplitInput {
  switch (input.method) {
    case "EQUAL":
      return { method: "EQUAL", participantIds: input.participantIds };
    case "EXACT":
      return {
        method: "EXACT",
        entries: input.entries.map((entry) => ({
          participantId: entry.participantId,
          amountMinor: parseMoneyToMinor(entry.amount, currency),
        })),
      };
    case "PERCENT":
      return {
        method: "PERCENT",
        entries: input.entries.map((entry) => ({
          participantId: entry.participantId,
          basisPoints: parsePercentToBasisPoints(entry.percent),
        })),
      };
    case "SHARES":
      return {
        method: "SHARES",
        entries: input.entries.map((entry) => ({
          participantId: entry.participantId,
          shares: entry.shares,
        })),
      };
  }
}

function splitParticipantIds(input: CreateInput["split"]): string[] {
  return input.method === "EQUAL" ? input.participantIds : input.entries.map((entry) => entry.participantId);
}

async function validateParticipants(groupId: string, ids: string[], requireActive: boolean) {
  const unique = [...new Set(ids)];
  const rows = await db
    .select({ id: participants.id, status: participants.status, displayName: participants.displayName })
    .from(participants)
    .where(and(eq(participants.groupId, groupId), inArray(participants.id, unique)));
  if (rows.length !== unique.length) {
    const found = new Set(rows.map((row) => row.id));
    const missing = unique.filter((id) => !found.has(id));
    throw new AppError("INVALID_ALLOCATION", "One or more selected participants are not in this group.", {
      missing,
    });
  }
  if (requireActive) {
    const inactive = rows.filter((row) => row.status !== "ACTIVE");
    if (inactive.length > 0) {
      throw new AppError("INVALID_ALLOCATION", "Inactive participants cannot be added to a new expense.", {
        inactive: inactive.map((row) => row.displayName),
      });
    }
  }
  return rows;
}

function snapshotFromDetail(detail: NonNullable<Awaited<ReturnType<typeof getExpenseDetail>>>): ExpenseSnapshot {
  return {
    description: detail.expense.description,
    category: detail.expense.category,
    occurredOn: detail.expense.occurredOn,
    payerParticipantId: detail.expense.payerParticipantId,
    amountMinor: detail.expense.amountMinor.toString(),
    notes: detail.expense.notes,
    status: detail.expense.status,
    splits: detail.splits.map((split) => ({
      participantId: split.participantId,
      amountMinor: split.allocatedMinor.toString(),
      method: split.method,
      basisPoints: split.basisPoints,
      shares: split.shares,
    })),
  };
}

export async function createExpense(actor: Actor, groupId: string, input: CreateInput) {
  const membership = await requireWritableGroup(groupId, actor.id, "EDITOR");
  const currency = getCurrency(membership.currency);
  const amountMinor = parseMoneyToMinor(input.amount, currency.code);
  if (amountMinor <= 0n) throw new AppError("INVALID_MONEY", "Expense amount must be greater than zero.");
  const splitInput = toSplitInput(currency.code, input.split);
  const allocation = allocateSplit(amountMinor, splitInput);
  const ids = [...new Set([input.payerParticipantId, ...splitParticipantIds(input.split)])];
  await validateParticipants(groupId, ids, true);
  const fingerprint = expenseFingerprint({
    groupId,
    occurredOn: input.occurredOn,
    payerParticipantId: input.payerParticipantId,
    amountMinor,
    description: input.description,
  });

  const expenseId = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(expenses)
      .values({
        groupId,
        description: input.description,
        category: input.category,
        occurredOn: input.occurredOn,
        payerParticipantId: input.payerParticipantId,
        currency: currency.code,
        amountMinor,
        notes: input.notes?.trim() || null,
        createdBy: actor.id,
        revision: 1,
        fingerprint,
      })
      .returning({ id: expenses.id, revision: expenses.revision });
    const expense = rows[0];
    if (!expense) throw new AppError("INTERNAL_ERROR", "Expense could not be created.");

    await tx.insert(expenseSplits).values(
      allocation.allocations.map((row) => ({
        groupId,
        expenseId: expense.id,
        participantId: row.participantId,
        method: row.method,
        allocatedMinor: row.amountMinor,
        basisPoints: row.basisPoints,
        shares: row.shares,
      })),
    );

    const afterSnapshot: ExpenseSnapshot = {
      description: input.description,
      category: input.category,
      occurredOn: input.occurredOn,
      payerParticipantId: input.payerParticipantId,
      amountMinor: amountMinor.toString(),
      notes: input.notes?.trim() || null,
      status: "ACTIVE",
      splits: allocation.allocations.map((row) => ({
        participantId: row.participantId,
        amountMinor: row.amountMinor.toString(),
        method: row.method,
        basisPoints: row.basisPoints,
        shares: row.shares,
      })),
    };

    await tx.insert(expenseRevisions).values({
      groupId,
      expenseId: expense.id,
      revision: 1,
      action: "CREATED",
      actorId: actor.id,
      afterSnapshot,
    });

    await recordAudit(tx, {
      groupId,
      actorId: actor.id,
      action: "EXPENSE_CREATED",
      targetType: "expense",
      targetId: expense.id,
      metadata: {
        amountMinor: amountMinor.toString(),
        currency: currency.code,
        method: allocation.method,
        residualMinor: allocation.residualMinor.toString(),
      },
      afterRevision: 1,
    });
    return expense.id;
  });
  return { expenseId };
}

export async function updateExpense(actor: Actor, groupId: string, expenseId: string, input: UpdateInput) {
  await requireWritableGroup(groupId, actor.id, "EDITOR");
  const current = await getExpenseDetail(groupId, expenseId);
  if (!current) throw new AppError("NOT_FOUND", "Expense not found.");
  if (current.expense.status !== "ACTIVE") {
    throw new AppError("CONFLICT", "A voided expense cannot be edited.");
  }
  if (current.expense.revision !== input.expectedRevision) {
    throw new AppError("STALE_REVISION", "This expense changed since you loaded it. Review the latest version.", {
      currentRevision: current.expense.revision,
    });
  }

  const currency = getCurrency(current.expense.currency);
  const amountMinor = parseMoneyToMinor(input.amount, currency.code);
  if (amountMinor <= 0n) throw new AppError("INVALID_MONEY", "Expense amount must be greater than zero.");
  const splitInput = toSplitInput(currency.code, input.split);
  const allocation = allocateSplit(amountMinor, splitInput);
  const ids = [...new Set([input.payerParticipantId, ...splitParticipantIds(input.split)])];
  await validateParticipants(groupId, ids, false);
  const beforeSnapshot = snapshotFromDetail(current);
  const fingerprint = expenseFingerprint({
    groupId,
    occurredOn: input.occurredOn,
    payerParticipantId: input.payerParticipantId,
    amountMinor,
    description: input.description,
  });

  await db.transaction(async (tx) => {
    const rows = await tx
      .update(expenses)
      .set({
        description: input.description,
        category: input.category,
        occurredOn: input.occurredOn,
        payerParticipantId: input.payerParticipantId,
        amountMinor,
        notes: input.notes?.trim() || null,
        revision: input.expectedRevision + 1,
        fingerprint,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(expenses.id, expenseId),
          eq(expenses.groupId, groupId),
          eq(expenses.revision, input.expectedRevision),
          eq(expenses.status, "ACTIVE"),
        ),
      )
      .returning({ revision: expenses.revision });
    if (!rows[0]) {
      throw new AppError("STALE_REVISION", "This expense changed before your edit saved. Reload and try again.");
    }
    const newRevision = rows[0].revision;

    await tx.delete(expenseSplits).where(eq(expenseSplits.expenseId, expenseId));
    await tx.insert(expenseSplits).values(
      allocation.allocations.map((row) => ({
        groupId,
        expenseId,
        participantId: row.participantId,
        method: row.method,
        allocatedMinor: row.amountMinor,
        basisPoints: row.basisPoints,
        shares: row.shares,
      })),
    );

    const afterSnapshot: ExpenseSnapshot = {
      description: input.description,
      category: input.category,
      occurredOn: input.occurredOn,
      payerParticipantId: input.payerParticipantId,
      amountMinor: amountMinor.toString(),
      notes: input.notes?.trim() || null,
      status: "ACTIVE",
      splits: allocation.allocations.map((row) => ({
        participantId: row.participantId,
        amountMinor: row.amountMinor.toString(),
        method: row.method,
        basisPoints: row.basisPoints,
        shares: row.shares,
      })),
    };

    await tx.insert(expenseRevisions).values({
      groupId,
      expenseId,
      revision: newRevision,
      action: "UPDATED",
      reason: input.reason,
      actorId: actor.id,
      beforeSnapshot,
      afterSnapshot,
    });

    await recordAudit(tx, {
      groupId,
      actorId: actor.id,
      action: "EXPENSE_UPDATED",
      targetType: "expense",
      targetId: expenseId,
      reason: input.reason,
      beforeRevision: input.expectedRevision,
      afterRevision: newRevision,
      metadata: { amountMinor: amountMinor.toString(), currency: currency.code },
    });
  });
  return { revision: input.expectedRevision + 1 };
}

export async function voidExpense(actor: Actor, groupId: string, expenseId: string, input: z.infer<typeof voidExpenseSchema>) {
  await requireWritableGroup(groupId, actor.id, "EDITOR");
  const current = await getExpenseDetail(groupId, expenseId);
  if (!current) throw new AppError("NOT_FOUND", "Expense not found.");
  if (current.expense.status !== "ACTIVE") throw new AppError("CONFLICT", "This expense is already voided.");
  if (current.expense.revision !== input.expectedRevision) {
    throw new AppError("STALE_REVISION", "This expense changed since you loaded it. Reload before voiding.", {
      currentRevision: current.expense.revision,
    });
  }
  const beforeSnapshot = snapshotFromDetail(current);

  await db.transaction(async (tx) => {
    const rows = await tx
      .update(expenses)
      .set({
        status: "VOID",
        revision: input.expectedRevision + 1,
        voidedAt: new Date(),
        voidReason: input.reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(expenses.id, expenseId),
          eq(expenses.groupId, groupId),
          eq(expenses.revision, input.expectedRevision),
          eq(expenses.status, "ACTIVE"),
        ),
      )
      .returning({ revision: expenses.revision });
    if (!rows[0]) throw new AppError("STALE_REVISION", "This expense changed before the void saved.");
    const newRevision = rows[0].revision;
    const afterSnapshot: ExpenseSnapshot = { ...beforeSnapshot, status: "VOID" };
    await tx.insert(expenseRevisions).values({
      groupId,
      expenseId,
      revision: newRevision,
      action: "VOIDED",
      reason: input.reason,
      actorId: actor.id,
      beforeSnapshot,
      afterSnapshot,
    });
    await recordAudit(tx, {
      groupId,
      actorId: actor.id,
      action: "EXPENSE_VOIDED",
      targetType: "expense",
      targetId: expenseId,
      reason: input.reason,
      beforeRevision: input.expectedRevision,
      afterRevision: newRevision,
    });
  });
  return { revision: input.expectedRevision + 1 };
}

export function previewAllocation(currencyCode: string, amount: string, split: CreateInput["split"]) {
  const currency = getCurrency(currencyCode);
  const amountMinor = parseMoneyToMinor(amount, currency.code);
  return allocateSplit(amountMinor, toSplitInput(currency.code, split));
}


export async function resolveExpenseAccess(expenseId: string, userId: string) {
  const rows = await db.select({ groupId: expenses.groupId }).from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  const expense = rows[0];
  if (!expense) throw new AppError("NOT_FOUND", "Expense not found.");
  const membership = await requireGroupRole(expense.groupId, userId, "MEMBER");
  return { groupId: expense.groupId, membership };
}
