import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { groups, participants, users } from "@/db/schema";
import { hashPassword } from "@/auth/password";
import { addParticipant, createGroup, getGroupOverview, type Actor } from "@/services/groups";
import { createExpense } from "@/services/expenses";
import { recordPayment } from "@/services/payments";
import { currentMonthRange, getReports } from "@/services/reports";
import { exportGroupCsv } from "@/services/exports";
import { getParticipantBalances } from "@/repositories/ledger";
import { listExpenses } from "@/repositories/expenses";
import { getCurrency } from "@/domain/money/currency";
import { minorToPlainString } from "@/domain/money/money";

const EXPENSE_COUNT = Number(process.env.PERF_EXPENSES ?? "200");
const PARTICIPANT_COUNT = 6;
const groupName = `Performance ${EXPENSE_COUNT}`;
const currency = getCurrency("INR");

if (!process.argv.includes("--test")) {
  console.error("Refusing to run a load probe without --test.");
  process.exit(1);
}
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error("TEST_DATABASE_URL is required.");
  process.exit(1);
}
if (!new URL(url).pathname.includes("test")) {
  console.error("The load probe only runs against a database whose name contains test.");
  process.exit(1);
}

function elapsedSince(start: bigint) {
  return Number((process.hrtime.bigint() - start) / 1_000_000n);
}

async function timed<T>(label: string, action: () => Promise<T>) {
  const start = process.hrtime.bigint();
  const result = await action();
  console.log(`${label.padEnd(34)} ${String(elapsedSince(start)).padStart(6)} ms`);
  return result;
}

const [createdUser] = await db
  .insert(users)
  .values({
    email: `perf.${Date.now()}@example.test`,
    displayName: "Perf Owner",
    passwordHash: await hashPassword("perf-password"),
  })
  .returning({ id: users.id });
const actor: Actor = { id: createdUser!.id, displayName: "Perf Owner", email: "perf@example.test" };

for (const stale of await db.select({ id: groups.id }).from(groups).where(eq(groups.name, groupName))) {
  await db.delete(groups).where(eq(groups.id, stale.id));
}

const { group } = await createGroup(actor, { name: groupName, currency: "INR", budget: "500000.00", invites: [] });
const ownerRows = await db
  .select({ id: participants.id })
  .from(participants)
  .where(and(eq(participants.groupId, group.id), eq(participants.userId, actor.id)))
  .limit(1);
const participantIds = [ownerRows[0]!.id];
for (let index = 1; index < PARTICIPANT_COUNT; index += 1) {
  participantIds.push(await addParticipant(actor, group.id, `Perf ${index}`).then((row) => row.id));
}

const writeStart = process.hrtime.bigint();
for (let index = 0; index < EXPENSE_COUNT; index += 1) {
  const payer = participantIds[index % PARTICIPANT_COUNT]!;
  const beneficiaries = participantIds.slice(0, (index % PARTICIPANT_COUNT) + 2);
  const day = String((index % 27) + 1).padStart(2, "0");
  await createExpense(actor, group.id, {
    description: `Perf expense ${index}`,
    category: index % 3 === 0 ? "GROCERIES" : "OTHER",
    occurredOn: `2026-09-${day}`,
    payerParticipantId: payer,
    amount: `${40 + (index % 400)}.${String((index * 37) % 100).padStart(2, "0")}`,
    split:
      index % 5 === 0
        ? { method: "EQUAL", participantIds: beneficiaries }
        : {
            method: "SHARES",
            entries: beneficiaries.map((participantId, position) => ({ participantId, shares: position + 2 })),
          },
  });
}
console.log(`${EXPENSE_COUNT} expenses written`.padEnd(34) + String(elapsedSince(writeStart)).padStart(6) + " ms");

const ledger = await timed("balances after writes", () => getParticipantBalances(group.id));
const netTotal = ledger.balances.reduce((acc, row) => acc + row.netMinor, 0n);
if (netTotal !== 0n) {
  console.error(`Balance invariant failed with ${netTotal} minor units.`);
  process.exit(1);
}

const paymentStart = process.hrtime.bigint();
for (const [index, transfer] of ledger.plan.transfers.entries()) {
  await recordPayment(actor, group.id, {
    senderParticipantId: transfer.fromParticipantId,
    recipientParticipantId: transfer.toParticipantId,
    amount: minorToPlainString(transfer.amountMinor, currency),
    paidOn: "2026-09-28",
    idempotencyKey: `perf-settle-${index}`,
  });
}
console.log(`plan of ${ledger.plan.transfers.length} payments`.padEnd(34) + String(elapsedSince(paymentStart)).padStart(6) + " ms");

await timed("group overview read", () => getGroupOverview(group.id, actor.id));
await timed("balances after payments", () => getParticipantBalances(group.id));
await timed("reports for current month", () => getReports(group.id, actor.id, currentMonthRange()));
await timed("CSV export of expenses", () => exportGroupCsv(actor, group.id, "expenses", { from: "2026-09-01", to: "2026-09-30" }));
for (const page of [1, Math.ceil(EXPENSE_COUNT / 25)]) {
  await timed(`expense list page ${page}`, () => listExpenses({ groupId: group.id, page, pageSize: 25 }));
}
await timed("filtered expense list", () =>
  listExpenses({ groupId: group.id, category: "GROCERIES", from: "2026-09-05", to: "2026-09-25", page: 1, pageSize: 25 }),
);

await db.delete(groups).where(eq(groups.id, group.id));
await db.delete(users).where(eq(users.id, actor.id));
console.log(`Probe finished for ${EXPENSE_COUNT} expenses and ${PARTICIPANT_COUNT} participants; rows removed.`);
