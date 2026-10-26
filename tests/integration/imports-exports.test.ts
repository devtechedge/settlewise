import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, importBatches } from "@/db/schema";
import { createExpense } from "@/services/expenses";
import { commitImport, createImportBatch, previewImportMapping } from "@/services/imports";
import { exportGroupCsv } from "@/services/exports";
import { getExpenseDetail } from "@/repositories/expenses";
import { daysAgo, expectAppError, makeGroup, makeMember, makeUser, resetDatabase } from "./helpers";

beforeAll(resetDatabase);

const csv = [
  "date,description,amount,payer,participants",
  "2026-10-01,Dinner,1000.00,Maya,Maya;Arjun",
  "2026-10-01,Dinner,1000.00,Maya,Maya;Arjun",
  "18/10/2026,Bad date,900.00,Maya,Maya;Arjun",
  '2026-10-03,"=SUM(A1:A2)",100.00,Maya,Maya;Arjun',
].join("\n");

function makeFile(name = "statement.csv") {
  return new File([csv], name, { type: "text/csv" });
}

describe("CSV imports", () => {
  it("previews duplicates and row errors, then commits a SKIP batch atomically", async () => {
    const owner = await makeUser("Import Owner", "import-owner");
    const partner = await makeUser("Import Partner", "import-partner");
    const group = await makeGroup(owner, "Import group");
    const ownerId = await makeMember(group.id, owner, "EDITOR", "Import Owner");
    const partnerId = await makeMember(group.id, partner, "EDITOR", "Import Partner");
    const uploaded = await createImportBatch(owner, group.id, makeFile());
    const result = await previewImportMapping(owner, group.id, uploaded.batchId, {
      dateColumn: "date",
      descriptionColumn: "description",
      amountColumn: "amount",
      payerColumn: "payer",
      participantsColumn: "participants",
      participantIds: [ownerId, partnerId],
      payerMap: { Maya: ownerId, Arjun: partnerId },
      participantMap: { Maya: ownerId, Arjun: partnerId },
      duplicatePolicy: "SKIP",
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.counts).toMatchObject({ rowCount: 4, validCount: 2, duplicateCount: 1, errorCount: 1 });

    const committed = await commitImport(owner, group.id, uploaded.batchId);
    expect(committed).toMatchObject({ committedCount: 2, skippedCount: 1, errorCount: 1 });
    const active = await db.select({ id: expenses.id }).from(expenses).where(and(eq(expenses.groupId, group.id), eq(expenses.status, "ACTIVE")));
    expect(active).toHaveLength(2);
    const batch = await db.select().from(importBatches).where(eq(importBatches.id, uploaded.batchId));
    expect(batch[0]?.status).toBe("COMMITTED");
    await expectAppError(() => commitImport(owner, group.id, uploaded.batchId), "DUPLICATE_IMPORT");
  });

  it("honors IMPORT_ANYWAY and rejects expired previews", async () => {
    const owner = await makeUser("Second Import Owner", "second-import-owner");
    const partner = await makeUser("Second Import Partner", "second-import-partner");
    const group = await makeGroup(owner, "Import anyway group");
    const ownerId = await makeMember(group.id, owner, "EDITOR", "Second Import Owner");
    const partnerId = await makeMember(group.id, partner, "EDITOR", "Second Import Partner");
    const uploaded = await createImportBatch(owner, group.id, makeFile());
    const result = await previewImportMapping(owner, group.id, uploaded.batchId, {
      dateColumn: "date",
      descriptionColumn: "description",
      amountColumn: "amount",
      payerColumn: "payer",
      participantsColumn: "participants",
      participantIds: [ownerId, partnerId],
      payerMap: { Maya: ownerId, Arjun: partnerId },
      participantMap: { Maya: ownerId, Arjun: partnerId },
      duplicatePolicy: "IMPORT_ANYWAY",
    });
    if (!result.ok) throw new Error(result.error);
    const committed = await commitImport(owner, group.id, uploaded.batchId);
    expect(committed.committedCount).toBe(3);

    const expiredBatch = await createImportBatch(owner, group.id, makeFile("expired.csv"));
    await previewImportMapping(owner, group.id, expiredBatch.batchId, {
      dateColumn: "date",
      descriptionColumn: "description",
      amountColumn: "amount",
      payerColumn: "payer",
      participantsColumn: "participants",
      participantIds: [ownerId, partnerId],
      payerMap: { Maya: ownerId, Arjun: partnerId },
      participantMap: { Maya: ownerId, Arjun: partnerId },
      duplicatePolicy: "SKIP",
    });
    await db.update(importBatches).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(importBatches.id, expiredBatch.batchId));
    await expectAppError(() => commitImport(owner, group.id, expiredBatch.batchId), "INVALID_STATE");
  });

  it("prevents another editor from committing someone else's batch", async () => {
    const owner = await makeUser("Batch Owner", "batch-owner");
    const other = await makeUser("Batch Other", "batch-other");
    const group = await makeGroup(owner, "Ownership group");
    const ownerId = await makeMember(group.id, owner, "EDITOR", "Batch Owner");
    const otherId = await makeMember(group.id, other, "EDITOR", "Batch Other");
    const uploaded = await createImportBatch(owner, group.id, makeFile("ownership.csv"));
    await previewImportMapping(owner, group.id, uploaded.batchId, {
      dateColumn: "date",
      descriptionColumn: "description",
      amountColumn: "amount",
      payerColumn: "payer",
      participantsColumn: "participants",
      participantIds: [ownerId, otherId],
      payerMap: { Maya: ownerId, Arjun: otherId },
      participantMap: { Maya: ownerId, Arjun: otherId },
      duplicatePolicy: "SKIP",
    });
    await expectAppError(() => commitImport(other, group.id, uploaded.batchId), "FORBIDDEN");
  });
});

describe("CSV exports", () => {
  it("neutralizes spreadsheet formula payloads without changing amounts", async () => {
    const owner = await makeUser("Export Owner", "export-owner");
    const group = await makeGroup(owner, "Export group");
    const ownerId = await makeMember(group.id, owner, "EDITOR", "Export Owner");
    const expense = await createExpense(owner, group.id, {
      description: '=HYPERLINK("https://example.invalid","bad")',
      category: "OTHER",
      occurredOn: daysAgo(1),
      payerParticipantId: ownerId,
      amount: "100.00",
      split: { method: "EQUAL", participantIds: [ownerId] },
    });
    const detail = await getExpenseDetail(group.id, expense.expenseId);
    expect(detail?.expense.description).toMatch(/^=HYPERLINK/);
    const result = await exportGroupCsv(owner, group.id, "expenses", {});
    expect(result.csv).toContain("\"'=HYPERLINK");
    expect(result.csv).toContain("100.00");
    expect(result.csv).not.toContain("\r\n=HYPERLINK");
  });
});
