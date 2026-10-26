import { and, eq, inArray } from "drizzle-orm";
import {
  groups,
  memberships,
  participants,
  settlementPayments,
} from "@/db/schema";
import { getCurrency } from "@/domain/money/currency";
import { formatMinor, parsePositiveMoneyToMinor } from "@/domain/money/money";
import { computeNetBalances } from "@/domain/settlement/settlement";
import { AppError } from "@/lib/errors";
import { serializable } from "@/db/transaction";
import type { Transaction } from "@/db/client";
import { loadLedger } from "@/repositories/ledger";
import { recordAudit } from "./audit";
import type { Actor } from "./groups";

type CreatePaymentInput = {
  senderParticipantId: string;
  recipientParticipantId: string;
  amount: string;
  paidOn: string;
  notes?: string;
  idempotencyKey: string;
};

type ReversePaymentInput = {
  reason: string;
  idempotencyKey: string;
};

async function loadMembershipContext(tx: Transaction, groupId: string, userId: string) {
  const rows = await tx
    .select({
      role: memberships.role,
      groupStatus: groups.status,
      currency: groups.currency,
      ownerId: groups.ownerId,
      linkedParticipantId: participants.id,
    })
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .leftJoin(participants, and(eq(participants.groupId, memberships.groupId), eq(participants.userId, memberships.userId)))
    .where(
      and(
        eq(memberships.groupId, groupId),
        eq(memberships.userId, userId),
        eq(memberships.status, "ACTIVE"),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new AppError("NOT_FOUND", "Group not found.");
  if (row.groupStatus !== "ACTIVE") {
    throw new AppError("INVALID_STATE", "This group is archived. Restore it before recording payments.");
  }
  return row;
}

export async function recordPayment(actor: Actor, groupId: string, input: CreatePaymentInput) {
  return serializable(async (tx) => {
    const context = await loadMembershipContext(tx, groupId, actor.id);
    const currency = getCurrency(context.currency);
    const amountMinor = parsePositiveMoneyToMinor(input.amount, currency.code);

    const existingRows = await tx
      .select()
      .from(settlementPayments)
      .where(and(eq(settlementPayments.groupId, groupId), eq(settlementPayments.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    const existing = existingRows[0];
    if (existing) {
      const same =
        existing.senderParticipantId === input.senderParticipantId &&
        existing.recipientParticipantId === input.recipientParticipantId &&
        existing.amountMinor === amountMinor &&
        existing.paidOn === input.paidOn &&
        (existing.notes ?? "") === (input.notes?.trim() ?? "");
      if (!same) {
        throw new AppError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used with different payment details.");
      }
      return { paymentId: existing.id, status: existing.status, replayed: true };
    }

    if (input.senderParticipantId === input.recipientParticipantId) {
      throw new AppError("VALIDATION_ERROR", "Sender and recipient must be different participants.");
    }
    const participantRows = await tx
      .select({ id: participants.id, displayName: participants.displayName })
      .from(participants)
      .where(
        and(
          eq(participants.groupId, groupId),
          inArray(participants.id, [input.senderParticipantId, input.recipientParticipantId]),
        ),
      );
    if (participantRows.length !== 2) {
      throw new AppError("VALIDATION_ERROR", "Both participants must belong to this group.");
    }
    if (context.role === "MEMBER" && context.linkedParticipantId !== input.senderParticipantId) {
      throw new AppError("FORBIDDEN", "Members can only record payments they are sending.");
    }

    const ledger = await loadLedger(tx, groupId);
    const balances = computeNetBalances({
      expenses: ledger.expenses,
      payments: ledger.payments,
      participantIds: participantRows.map((row) => row.id),
    });
    const sender = balances.find((row) => row.participantId === input.senderParticipantId);
    const recipient = balances.find((row) => row.participantId === input.recipientParticipantId);
    const senderOwed = sender && sender.netMinor < 0n ? -sender.netMinor : 0n;
    const recipientDue = recipient && recipient.netMinor > 0n ? recipient.netMinor : 0n;
    if (senderOwed === 0n) {
      throw new AppError("INVALID_STATE", "The sender has no outstanding debt in this group.");
    }
    if (recipientDue === 0n) {
      throw new AppError("INVALID_STATE", "The recipient is not owed money in this group.");
    }
    const supported = senderOwed < recipientDue ? senderOwed : recipientDue;
    if (amountMinor > supported) {
      throw new AppError("INVALID_STATE", "This payment is larger than the outstanding balance between these participants.", {
        senderOutstanding: formatMinor(senderOwed, currency.code),
        recipientOutstanding: formatMinor(recipientDue, currency.code),
      });
    }

    const rows = await tx
      .insert(settlementPayments)
      .values({
        groupId,
        senderParticipantId: input.senderParticipantId,
        recipientParticipantId: input.recipientParticipantId,
        amountMinor,
        currency: currency.code,
        paidOn: input.paidOn,
        status: "RECORDED",
        notes: input.notes?.trim() || null,
        idempotencyKey: input.idempotencyKey,
        createdBy: actor.id,
      })
      .returning({ id: settlementPayments.id });
    const payment = rows[0];
    if (!payment) throw new AppError("INTERNAL_ERROR", "Payment could not be recorded.");

    await recordAudit(tx, {
      groupId,
      actorId: actor.id,
      action: "PAYMENT_RECORDED",
      targetType: "settlement_payment",
      targetId: payment.id,
      metadata: {
        senderParticipantId: input.senderParticipantId,
        recipientParticipantId: input.recipientParticipantId,
        amountMinor: amountMinor.toString(),
        currency: currency.code,
      },
    });

    return { paymentId: payment.id, status: "RECORDED" as const, replayed: false };
  });
}

export async function reversePayment(actor: Actor, paymentId: string, input: ReversePaymentInput) {
  return serializable(async (tx) => {
    const paymentRows = await tx
      .select()
      .from(settlementPayments)
      .where(eq(settlementPayments.id, paymentId))
      .limit(1);
    const payment = paymentRows[0];
    if (!payment) throw new AppError("NOT_FOUND", "Payment not found.");
    const context = await loadMembershipContext(tx, payment.groupId, actor.id);
    if (payment.reversalOfPaymentId) {
      throw new AppError("INVALID_STATE", "A reversal record cannot be reversed again.");
    }

    const existingRows = await tx
      .select()
      .from(settlementPayments)
      .where(
        and(
          eq(settlementPayments.groupId, payment.groupId),
          eq(settlementPayments.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    const existing = existingRows[0];
    if (existing) {
      if (existing.reversalOfPaymentId === paymentId) {
        return { reversalId: existing.id, replayed: true };
      }
      throw new AppError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different payment.");
    }

    if (payment.status !== "RECORDED") {
      throw new AppError("CONFLICT", "This payment was already reversed.");
    }
    if (context.role !== "OWNER" && payment.createdBy !== actor.id) {
      throw new AppError("FORBIDDEN", "Only the owner or the person who recorded the payment can reverse it.");
    }

    const now = new Date();
    await tx
      .update(settlementPayments)
      .set({ status: "REVERSED", reversalReason: input.reason, reversedAt: now, updatedAt: now })
      .where(and(eq(settlementPayments.id, paymentId), eq(settlementPayments.status, "RECORDED")));

    const reversalRows = await tx
      .insert(settlementPayments)
      .values({
        groupId: payment.groupId,
        senderParticipantId: payment.recipientParticipantId,
        recipientParticipantId: payment.senderParticipantId,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        paidOn: now.toISOString().slice(0, 10),
        status: "REVERSED",
        notes: `Reversal: ${input.reason}`.slice(0, 500),
        idempotencyKey: input.idempotencyKey,
        createdBy: actor.id,
        reversalOfPaymentId: paymentId,
        reversalReason: input.reason,
        reversedAt: now,
      })
      .returning({ id: settlementPayments.id });

    const reversal = reversalRows[0];
    if (!reversal) throw new AppError("INTERNAL_ERROR", "Reversal record could not be created.");

    await recordAudit(tx, {
      groupId: payment.groupId,
      actorId: actor.id,
      action: "PAYMENT_REVERSED",
      targetType: "settlement_payment",
      targetId: paymentId,
      reason: input.reason,
      metadata: { reversalId: reversal.id, amountMinor: payment.amountMinor.toString(), currency: payment.currency },
    });

    return { reversalId: reversal.id, replayed: false };
  });
}

