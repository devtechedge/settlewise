import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";

const isTest = process.argv.includes("--test");
const isDev = process.argv.includes("--dev");
const targetUrl = isTest ? process.env.TEST_DATABASE_URL : (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
if (!targetUrl) {
  console.error("A database URL is required.");
  process.exit(1);
}
const databaseName = new URL(targetUrl).pathname.replace(/^\//, "").replaceAll('"', "");

if (isTest && !databaseName.includes("test")) {
  console.error(`Refusing to seed "${databaseName}" in test mode.`);
  process.exit(1);
}
if (isDev && !databaseName.includes("_dev")) {
  console.error(`Refusing to seed "${databaseName}" in dev mode. Use --test for the test database.`);
  process.exit(1);
}
if (!isTest && !isDev) {
  if (databaseName !== "settlewise" || process.env.ALLOW_PROD_SEED !== "1") {
    console.error("Refusing production seed. Set ALLOW_PROD_SEED=1 and target the database named settlewise.");
    process.exit(1);
  }
}

process.env.DATABASE_URL = targetUrl;
(process.env as Record<string, string>).NODE_ENV = "development";

const { db } = await import("../src/db/client");
const schema = await import("../src/db/schema");
const { hashPassword } = await import("../src/auth/password");
const { createGroup, createInvitation, setBudget } = await import("../src/services/groups");
const { createExpense, updateExpense, voidExpense } = await import("../src/services/expenses");
const { recordPayment, reversePayment } = await import("../src/services/payments");
const { createImportBatch, previewImportMapping, commitImport } = await import("../src/services/imports");
const { exportGroupCsv } = await import("../src/services/exports");
const { getParticipantBalances } = await import("../src/repositories/ledger");

const SEED_NAMESPACE = "2f3f1b82-4c75-4f61-b2e8-4f72bd31d4c1";
function seedId(name: string): string {
  const bytes = createHash("sha1").update(`${SEED_NAMESPACE}:${name}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const DEMO_PASSWORD = "settlewise-demo-2026";
const today = new Date();
function daysAgo(days: number): string {
  const date = new Date(today);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

const existing = await db.select({ count: sql<number>`count(*)::int` }).from(schema.users);
if (!isTest && !isDev && (existing[0]?.count ?? 0) > 0) {
  console.error("This database already has users. Production demo seeding only runs on an empty database.");
  process.exit(1);
}
if (isTest || isDev) {
  await db.execute(sql`truncate table users, groups, rate_limits restart identity cascade`);
  console.log(`Cleared ${databaseName} for a repeatable seed.`);
}

const passwordHash = await hashPassword(DEMO_PASSWORD);
const userRows = await db
  .insert(schema.users)
  .values([
    { id: seedId("user-maya"), email: "maya@settlewise.demo", displayName: "Maya Rao", passwordHash },
    { id: seedId("user-arjun"), email: "arjun@settlewise.demo", displayName: "Arjun Sen", passwordHash },
    { id: seedId("user-leela"), email: "leela@settlewise.demo", displayName: "Leela Nair", passwordHash },
    { id: seedId("user-nisha"), email: "nisha@settlewise.demo", displayName: "Nisha Shah", passwordHash },
  ])
  .returning({ id: schema.users.id, displayName: schema.users.displayName, email: schema.users.email });
const users = new Map(userRows.map((user) => [user.email, user]));
const maya = users.get("maya@settlewise.demo");
const arjun = users.get("arjun@settlewise.demo");
const leela = users.get("leela@settlewise.demo");
const nisha = users.get("nisha@settlewise.demo");
if (!maya || !arjun || !leela || !nisha) throw new Error("Seed users were not created.");
const mayaId = maya.id;

const actors = {
  maya: { id: maya.id, displayName: maya.displayName, email: maya.email },
  arjun: { id: arjun.id, displayName: arjun.displayName, email: arjun.email },
  leela: { id: leela.id, displayName: leela.displayName, email: leela.email },
  nisha: { id: nisha.id, displayName: nisha.displayName, email: nisha.email },
};

const house = await createGroup(actors.maya, {
  name: "Maple House",
  currency: "INR",
  budget: "60000.00",
  invites: [],
});
const houseId = house.group.id;

async function attachHouseholdMember(user: { id: string; displayName: string; email: string }, role: "EDITOR" | "MEMBER", name: string, participantId: string) {
  await db.insert(schema.memberships).values({ groupId: houseId, userId: user.id, role });
  await db.insert(schema.participants).values({ id: participantId, groupId: houseId, userId: user.id, displayName: name, createdBy: mayaId });
  return participantId;
}

const houseMayaId = seedId("participant-house-maya");
await db.update(schema.participants).set({ id: houseMayaId }).where(sql`${schema.participants.groupId} = ${houseId} and ${schema.participants.userId} = ${maya.id}`);
const houseMaya = houseMayaId;
const houseArjun = await attachHouseholdMember(arjun, "EDITOR", "Arjun Sen", seedId("participant-house-arjun"));
const houseLeela = await attachHouseholdMember(leela, "MEMBER", "Leela Nair", seedId("participant-house-leela"));
const raviId = seedId("participant-house-ravi");
await db.insert(schema.participants).values({ id: raviId, groupId: houseId, displayName: "Ravi Iyer", createdBy: mayaId });
const ravi = { id: raviId };

const travel = await createGroup(actors.arjun, {
  name: "Goa Long Weekend",
  currency: "INR",
  budget: "25000.00",
  invites: [],
});
const travelId = travel.group.id;
const travelArjunId = seedId("participant-travel-arjun");
await db.update(schema.participants).set({ id: travelArjunId }).where(sql`${schema.participants.groupId} = ${travelId} and ${schema.participants.userId} = ${arjun.id}`);
const travelArjun = travelArjunId;
await db.insert(schema.memberships).values([
  { groupId: travelId, userId: maya.id, role: "EDITOR" },
  { groupId: travelId, userId: nisha.id, role: "MEMBER" },
]);
const travelMaya = seedId("participant-travel-maya");
const travelNisha = seedId("participant-travel-nisha");
const kabirId = seedId("participant-travel-kabir");
await db.insert(schema.participants).values([
  { id: travelMaya, groupId: travelId, userId: maya.id, displayName: "Maya Rao", createdBy: arjun.id },
  { id: travelNisha, groupId: travelId, userId: nisha.id, displayName: "Nisha Shah", createdBy: arjun.id },
  { id: kabirId, groupId: travelId, displayName: "Kabir Menon", createdBy: arjun.id },
]);

await createInvitation(actors.maya, houseId, { email: "riya.friend@example.invalid", role: "MEMBER" });

await setBudget(actors.maya, houseId, { scope: "CATEGORY", category: "DINING", period: "MONTHLY", limit: "5000.00" });
await setBudget(actors.maya, houseId, { scope: "CATEGORY", category: "GROCERIES", period: "MONTHLY", limit: "8000.00" });
await setBudget(actors.arjun, travelId, { scope: "CATEGORY", category: "TRAVEL", period: "ALL_TIME", limit: "20000.00" });

const houseEqual = [houseMaya, houseArjun, houseLeela];

const groceries = await createExpense(actors.maya, houseId, {
  description: "Weekly groceries",
  category: "GROCERIES",
  occurredOn: daysAgo(27),
  payerParticipantId: houseMaya,
  amount: "4820.50",
  notes: "Big Basket delivery",
  split: { method: "EQUAL", participantIds: houseEqual },
});
await createExpense(actors.maya, houseId, {
  description: "Electricity bill",
  category: "UTILITIES",
  occurredOn: daysAgo(25),
  payerParticipantId: houseArjun,
  amount: "3120.00",
  split: { method: "EQUAL", participantIds: houseEqual },
});
await createExpense(actors.maya, houseId, {
  description: "October rent",
  category: "RENT",
  occurredOn: daysAgo(23),
  payerParticipantId: houseMaya,
  amount: "48000.00",
  notes: "Two-bedroom share",
  split: {
    method: "SHARES",
    entries: [
      { participantId: houseMaya, shares: 2 },
      { participantId: houseArjun, shares: 2 },
      { participantId: houseLeela, shares: 1 },
    ],
  },
});
await createExpense(actors.maya, houseId, {
  description: "Sunday brunch",
  category: "DINING",
  occurredOn: daysAgo(21),
  payerParticipantId: houseLeela,
  amount: "2700.00",
  split: {
    method: "PERCENT",
    entries: [
      { participantId: houseMaya, percent: "50.00" },
      { participantId: houseArjun, percent: "25.00" },
      { participantId: houseLeela, percent: "25.00" },
    ],
  },
});
await createExpense(actors.maya, houseId, {
  description: "House cleaning supplies",
  category: "SHOPPING",
  occurredOn: daysAgo(19),
  payerParticipantId: houseMaya,
  amount: "860.00",
  split: { method: "EQUAL", participantIds: houseEqual },
});
await createExpense(actors.arjun, houseId, {
  description: "Internet renewal",
  category: "UTILITIES",
  occurredOn: daysAgo(15),
  payerParticipantId: houseArjun,
  amount: "2399.00",
  split: { method: "EQUAL", participantIds: houseEqual },
});
await createExpense(actors.maya, houseId, {
  description: "Diwali decorations",
  category: "OTHER",
  occurredOn: daysAgo(11),
  payerParticipantId: houseLeela,
  amount: "1450.75",
  split: {
    method: "EXACT",
    entries: [
      { participantId: houseMaya, amount: "500.25" },
      { participantId: houseArjun, amount: "500.50" },
      { participantId: houseLeela, amount: "450.00" },
    ],
  },
});
await createExpense(actors.arjun, houseId, {
  description: "Weekend petrol",
  category: "TRANSPORT",
  occurredOn: daysAgo(9),
  payerParticipantId: houseArjun,
  amount: "1760.00",
  split: {
    method: "SHARES",
    entries: [
      { participantId: houseMaya, shares: 3 },
      { participantId: houseArjun, shares: 2 },
      { participantId: houseLeela, shares: 1 },
    ],
  },
});
await createExpense(actors.maya, houseId, {
  description: "Friday takeaway",
  category: "DINING",
  occurredOn: daysAgo(8),
  payerParticipantId: houseMaya,
  amount: "1800.00",
  split: { method: "EQUAL", participantIds: [houseMaya, houseArjun, houseLeela, ravi.id] },
});
const dinner = await createExpense(actors.maya, houseId, {
  description: "Team dinner",
  category: "DINING",
  occurredOn: daysAgo(5),
  payerParticipantId: houseMaya,
  amount: "3100.00",
  notes: "Initial entry from the bill",
  split: { method: "EQUAL", participantIds: houseEqual },
});
await updateExpense(actors.maya, houseId, dinner.expenseId, {
  description: "Team dinner",
  category: "DINING",
  occurredOn: daysAgo(5),
  payerParticipantId: houseMaya,
  amount: "3300.00",
  notes: "Corrected with the dessert line from the receipt",
  split: { method: "EQUAL", participantIds: houseEqual },
  expectedRevision: 1,
  reason: "Added the dessert line after checking the receipt.",
});
await createExpense(actors.maya, houseId, {
  description: "Movie tickets",
  category: "ENTERTAINMENT",
  occurredOn: daysAgo(3),
  payerParticipantId: houseLeela,
  amount: "900.00",
  split: { method: "EQUAL", participantIds: houseEqual },
});
const duplicate = await createExpense(actors.maya, houseId, {
  description: "Duplicate grocery delivery",
  category: "GROCERIES",
  occurredOn: daysAgo(1),
  payerParticipantId: houseMaya,
  amount: "1200.00",
  split: { method: "EQUAL", participantIds: houseEqual },
});
await voidExpense(actors.maya, houseId, duplicate.expenseId, {
  expectedRevision: 1,
  reason: "Duplicate of an earlier grocery entry; removed from balances.",
});

const csvPath = fileURLToPath(new URL("../public/samples/travel-expenses.csv", import.meta.url));
const csvText = await readFile(csvPath, "utf8");
const file = new File([csvText], "travel-expenses.csv", { type: "text/csv" });
const batch = await createImportBatch(actors.arjun, travelId, file);
const nameMap = { Maya: travelMaya, Arjun: travelArjun, Nisha: travelNisha, Kabir: kabirId } as Record<string, string>;
const preview = await previewImportMapping(actors.arjun, travelId, batch.batchId, {
  dateColumn: "date",
  descriptionColumn: "description",
  amountColumn: "amount",
  payerColumn: "payer",
  categoryColumn: "category",
  participantsColumn: "participants",
  notesColumn: "notes",
  participantIds: [travelMaya, travelArjun, travelNisha, kabirId],
  payerMap: nameMap,
  participantMap: nameMap,
  duplicatePolicy: "SKIP",
});
if (!preview.ok) throw new Error(`Travel import preview failed: ${preview.error}`);
const committed = await commitImport(actors.arjun, travelId, batch.batchId);
if (committed.committedCount !== 5) throw new Error(`Expected 5 imported travel expenses, got ${committed.committedCount}.`);

await createExpense(actors.maya, travelId, {
  description: "Airport parking",
  category: "TRANSPORT",
  occurredOn: daysAgo(2),
  payerParticipantId: travelMaya,
  amount: "420.00",
  split: { method: "EQUAL", participantIds: [travelMaya, travelArjun, travelNisha, kabirId] },
});

await recordPayment(actors.arjun, houseId, {
  senderParticipantId: houseArjun,
  recipientParticipantId: houseMaya,
  amount: "5000.00",
  paidOn: daysAgo(6),
  notes: "UPI transfer",
  idempotencyKey: "seed-house-payment-arjun",
});
await recordPayment(actors.arjun, travelId, {
  senderParticipantId: travelArjun,
  recipientParticipantId: travelNisha,
  amount: "2500.00",
  paidOn: daysAgo(4),
  notes: "Paid after the trip",
  idempotencyKey: "seed-travel-payment-arjun",
});
await recordPayment(actors.arjun, travelId, {
  senderParticipantId: kabirId,
  recipientParticipantId: travelNisha,
  amount: "2000.00",
  paidOn: daysAgo(4),
  notes: "Cash handed to Nisha",
  idempotencyKey: "seed-travel-payment-kabir",
});

const leelaPayment = await recordPayment(actors.maya, houseId, {
  senderParticipantId: houseLeela,
  recipientParticipantId: houseMaya,
  amount: "1000.00",
  paidOn: daysAgo(5),
  notes: "Recorded from the wrong account by mistake",
  idempotencyKey: "seed-house-payment-leela-wrong",
});
await reversePayment(actors.maya, leelaPayment.paymentId, {
  reason: "Recorded from the wrong account; re-entered with the correct note.",
  idempotencyKey: "seed-house-payment-leela-reversal",
});
await recordPayment(actors.maya, houseId, {
  senderParticipantId: houseLeela,
  recipientParticipantId: houseMaya,
  amount: "1000.00",
  paidOn: daysAgo(3),
  notes: "Corrected bank transfer record",
  idempotencyKey: "seed-house-payment-leela-correct",
});

await exportGroupCsv(actors.maya, houseId, "expenses", {});
await exportGroupCsv(actors.arjun, travelId, "settlements", {});

const houseBalances = await getParticipantBalances(houseId);
const travelBalances = await getParticipantBalances(travelId);

console.log("");
console.log("Settlewise demo data ready.");
console.log(`Household: ${house.group.name} (${house.group.currency})`);
console.log(`  ${houseBalances.balances.length} participants, ${houseBalances.plan.transfers.length} suggested transfers, outstanding ${houseBalances.plan.debtorTotalMinor.toString()} minor units`);
console.log(`Travel: ${travel.group.name} (${travel.group.currency})`);
console.log(`  ${travelBalances.balances.length} participants, ${travelBalances.plan.transfers.length} suggested transfers, outstanding ${travelBalances.plan.debtorTotalMinor.toString()} minor units`);
console.log(`Demo login: maya@settlewise.demo / ${DEMO_PASSWORD}`);
console.log(`Import batch committed with ${committed.committedCount} rows; one reversed and one corrected payment are in history.`);
console.log(`The dinner expense is at revision 2; groceries reference ${groceries.expenseId.slice(0, 8)}.`);
await db.$client.end();
