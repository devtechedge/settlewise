import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { participants, settlementPayments, users } from "@/db/schema";

const recipient = alias(participants, "recipient_participant");

export async function listPayments(groupId: string, page = 1, pageSize = 25) {
  const size = Math.min(100, Math.max(1, pageSize));
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(settlementPayments)
    .where(eq(settlementPayments.groupId, groupId));
  const rows = await db
    .select({
      id: settlementPayments.id,
      amountMinor: settlementPayments.amountMinor,
      currency: settlementPayments.currency,
      paidOn: settlementPayments.paidOn,
      status: settlementPayments.status,
      notes: settlementPayments.notes,
      createdAt: settlementPayments.createdAt,
      reversalOfPaymentId: settlementPayments.reversalOfPaymentId,
      reversalReason: settlementPayments.reversalReason,
      reversedAt: settlementPayments.reversedAt,
      senderParticipantId: settlementPayments.senderParticipantId,
      senderName: participants.displayName,
      recipientParticipantId: settlementPayments.recipientParticipantId,
      recipientName: recipient.displayName,
      createdByName: users.displayName,
    })
    .from(settlementPayments)
    .innerJoin(participants, eq(participants.id, settlementPayments.senderParticipantId))
    .innerJoin(recipient, eq(recipient.id, settlementPayments.recipientParticipantId))
    .innerJoin(users, eq(users.id, settlementPayments.createdBy))
    .where(eq(settlementPayments.groupId, groupId))
    .orderBy(desc(settlementPayments.createdAt))
    .limit(size)
    .offset((Math.max(1, page) - 1) * size);

  return {
    rows,
    total: countRow?.count ?? 0,
    page: Math.max(1, page),
    pageSize: size,
    pageCount: Math.max(1, Math.ceil((countRow?.count ?? 0) / size)),
  };
}

export type PaymentRow = Awaited<ReturnType<typeof listPayments>>["rows"][number];
