import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  expenses,
  expenseRevisions,
  expenseSplits,
  groups,
  importBatches,
  importRows,
  memberships,
  participants,
} from "@/db/schema";
import { allocateSplit } from "@/domain/expenses/allocation";
import { getCurrency } from "@/domain/money/currency";
import { formatMinor, parsePositiveMoneyToMinor } from "@/domain/money/money";
import { AppError } from "@/lib/errors";
import { requireGroupRole, requireWritableGroup } from "@/auth/rbac";
import { CSV_LIMITS, parseCsv, rowToObject, type CsvRow } from "@/importers/csv";
import { expenseFingerprint } from "@/importers/fingerprint";
import { categorySchema, importMappingSchema } from "@/validation/schemas";
import { recordAudit } from "./audit";
import type { Actor } from "./groups";

export type ImportMapping = ReturnType<typeof importMappingSchema.parse>;

type RowError = { code: string; message: string; field?: string; duplicateOfRow?: number };

export type NormalizedImportRow = {
  description: string;
  category: string;
  occurredOn: string;
  payerParticipantId: string;
  payerName: string;
  amountMinor: string;
  amountDisplay: string;
  notes: string | null;
  participantIds: string[];
  participantNames: string[];
};

const IMPORT_TTL_MINUTES = 60;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function lookupMapping(map: Record<string, string>, raw: string): string | undefined {
  if (Object.hasOwn(map, raw)) return map[raw];
  const normalized = normalizeName(raw);
  for (const [key, value] of Object.entries(map)) {
    if (normalizeName(key) === normalized) return value;
  }
  return undefined;
}

async function loadParticipants(groupId: string) {
  return db
    .select({ id: participants.id, displayName: participants.displayName, status: participants.status })
    .from(participants)
    .where(eq(participants.groupId, groupId));
}

function validateMappingColumns(mapping: ImportMapping, headers: string[]) {
  const headerSet = new Set(headers);
  const required = [mapping.dateColumn, mapping.descriptionColumn, mapping.amountColumn, mapping.payerColumn];
  for (const column of required) {
    if (!headerSet.has(column)) {
      throw new AppError("VALIDATION_ERROR", `The column "${column}" is not in this CSV.`);
    }
  }
  const optional = [mapping.categoryColumn, mapping.participantsColumn, mapping.notesColumn].filter(
    (value): value is string => Boolean(value),
  );
  for (const column of optional) {
    if (!headerSet.has(column)) {
      throw new AppError("VALIDATION_ERROR", `The column "${column}" is not in this CSV.`);
    }
  }
  const chosen = [...required, ...optional];
  if (new Set(chosen).size !== chosen.length) {
    throw new AppError("VALIDATION_ERROR", "Map each CSV column to only one field.");
  }
}

function normalizeRow(
  values: Record<string, string>,
  mapping: ImportMapping,
  participantById: Map<string, { id: string; displayName: string; status: string }>,
  currency: string,
): { normalized: NormalizedImportRow | null; errors: RowError[]; payerRaw: string; participantRaws: string[] } {
  const errors: RowError[] = [];
  const payerRaw = (values[mapping.payerColumn] ?? "").trim();
  const participantRaw = mapping.participantsColumn ? (values[mapping.participantsColumn] ?? "").trim() : "";
  const participantRaws = participantRaw
    ? participantRaw.split(/[;|]/).map((value) => value.trim()).filter(Boolean)
    : [];
  const pushError = (field: string, message: string, code = "INVALID_VALUE") => {
    errors.push({ code, message, field });
  };

  const description = (values[mapping.descriptionColumn] ?? "").trim();
  if (!description) pushError("description", "Description is empty.");
  else if (description.length > 120) pushError("description", "Description is longer than 120 characters.");
  else if (CONTROL_CHARS.test(description)) pushError("description", "Description contains control characters.");

  const occurredOn = (values[mapping.dateColumn] ?? "").trim();
  const parsedDate = new Date(`${occurredOn}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== occurredOn) {
    pushError("date", "Date must be a real calendar date in YYYY-MM-DD format.");
  } else if (occurredOn < "2000-01-01" || occurredOn > new Date().toISOString().slice(0, 10)) {
    pushError("date", "Date must be between 2000-01-01 and today.");
  }

  let amountMinor = 0n;
  const amountRaw = (values[mapping.amountColumn] ?? "").trim();
  try {
    amountMinor = parsePositiveMoneyToMinor(amountRaw, currency);
  } catch (error) {
    pushError("amount", error instanceof Error ? error.message : "Amount is invalid.");
  }

  let payerParticipantId = "";
  let payerName = "";
  if (!payerRaw) {
    pushError("payer", "Payer is empty.");
  } else {
    const mapped = lookupMapping(mapping.payerMap, payerRaw);
    if (!mapped) {
      pushError("payer", `Payer "${payerRaw}" is not mapped to a participant.`);
    } else {
      const participant = participantById.get(mapped);
      if (!participant) pushError("payer", `Payer "${payerRaw}" maps to a participant outside this group.`);
      else if (participant.status !== "ACTIVE") pushError("payer", `Payer "${payerRaw}" is inactive.`);
      else {
        payerParticipantId = participant.id;
        payerName = participant.displayName;
      }
    }
  }

  const participantIds: string[] = [];
  const participantNames: string[] = [];
  if (participantRaws.length === 0 && mapping.participantIds.length === 0) {
    pushError("participants", "Choose at least one beneficiary.");
  }
  const seen = new Set<string>();
  const acceptParticipant = (participant: { id: string; displayName: string; status: string } | undefined, label: string) => {
    if (!participant) {
      pushError("participants", `Beneficiary "${label}" maps to a participant outside this group.`);
      return;
    }
    if (participant.status !== "ACTIVE") {
      pushError("participants", `Beneficiary "${label}" is inactive.`);
      return;
    }
    if (seen.has(participant.id)) {
      pushError("participants", `Beneficiary "${participant.displayName}" is listed more than once.`);
      return;
    }
    seen.add(participant.id);
    participantIds.push(participant.id);
    participantNames.push(participant.displayName);
  };
  if (participantRaws.length > 0) {
    for (const raw of participantRaws) {
      const mapped = lookupMapping(mapping.participantMap, raw);
      if (!mapped) {
        pushError("participants", `Beneficiary "${raw}" is not mapped to a participant.`);
        continue;
      }
      acceptParticipant(participantById.get(mapped), raw);
    }
  } else {
    for (const id of mapping.participantIds) {
      acceptParticipant(participantById.get(id), id);
    }
  }

  let category = "OTHER";
  if (mapping.categoryColumn) {
    const categoryRaw = (values[mapping.categoryColumn] ?? "").trim();
    if (categoryRaw) {
      const parsed = categorySchema.safeParse(categoryRaw.toUpperCase());
      if (!parsed.success) pushError("category", `Unknown category "${categoryRaw}".`);
      else category = parsed.data;
    }
  }

  const notesRaw = mapping.notesColumn ? (values[mapping.notesColumn] ?? "").trim() : "";
  if (notesRaw.length > 500) pushError("notes", "Notes are longer than 500 characters.");
  if (CONTROL_CHARS.test(notesRaw)) pushError("notes", "Notes contain control characters.");

  if (errors.length > 0) {
    return { normalized: null, errors, payerRaw, participantRaws };
  }
  const normalized: NormalizedImportRow = {
    description,
    category,
    occurredOn,
    payerParticipantId,
    payerName,
    amountMinor: amountMinor.toString(),
    amountDisplay: formatMinor(amountMinor, currency),
    notes: notesRaw || null,
    participantIds,
    participantNames,
  };
  return { normalized, errors, payerRaw, participantRaws };
}

async function gatherDistinctValues(rows: { raw: unknown }[], column: string, fields: "payer" | "participants") {
  const values = new Set<string>();
  for (const row of rows) {
    const raw = row.raw as Record<string, string>;
    const value = (raw[column] ?? "").trim();
    if (!value) continue;
    if (fields === "participants") {
      for (const part of value.split(/[;|]/)) {
        const name = part.trim();
        if (name) values.add(name);
      }
    } else {
      values.add(value);
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

export async function createImportBatch(actor: Actor, groupId: string, file: File) {
  await requireWritableGroup(groupId, actor.id, "EDITOR");
  if (file.size === 0) throw new AppError("VALIDATION_ERROR", "Choose a CSV file.");
  if (file.size > CSV_LIMITS.maxBytes) {
    throw new AppError("PAYLOAD_TOO_LARGE", `CSV files are limited to ${CSV_LIMITS.maxBytes / 1024 / 1024} MB.`);
  }
  const text = await file.text();
  if (Buffer.byteLength(text, "utf8") > CSV_LIMITS.maxBytes) {
    throw new AppError("PAYLOAD_TOO_LARGE", `CSV files are limited to ${CSV_LIMITS.maxBytes / 1024 / 1024} MB.`);
  }
  const parsed = parseCsv(text);
  const checksum = createHash("sha256").update(text).digest("hex");
  const filename = file.name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120) || "import.csv";
  const expiresAt = new Date(Date.now() + IMPORT_TTL_MINUTES * 60 * 1000);

  const batchId = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(importBatches)
      .values({
        groupId,
        createdBy: actor.id,
        filename,
        fileSizeBytes: Buffer.byteLength(text, "utf8"),
        checksum,
        headers: parsed.headers,
        status: "PREVIEWED",
        rowCount: parsed.rows.length,
        expiresAt,
      })
      .returning({ id: importBatches.id });
    const batch = rows[0];
    if (!batch) throw new AppError("INTERNAL_ERROR", "Import batch could not be created.");
    await tx.insert(importRows).values(
      parsed.rows.map((row) => ({
        batchId: batch.id,
        rowNumber: row.rowNumber,
        raw: rowToObject(parsed.headers, row),
        status: "ERROR" as const,
        errors: [
          {
            code: row.structureError ? "BAD_ROW_STRUCTURE" : "MAPPING_REQUIRED",
            message: row.structureError ?? "Choose a column mapping and preview this batch.",
          },
        ],
      })),
    );
    await recordAudit(tx, {
      groupId,
      actorId: actor.id,
      action: "IMPORT_UPLOADED",
      targetType: "import_batch",
      targetId: batch.id,
      metadata: { filename, rowCount: parsed.rows.length, checksum },
    });
    return batch.id;
  });

  const sampleRows = parsed.rows.slice(0, 5).map((row: CsvRow) => rowToObject(parsed.headers, row));
  return {
    batchId,
    headers: parsed.headers,
    rowCount: parsed.rows.length,
    sampleRows,
    expiresAt,
  };
}

async function assertBatchUsable(batchId: string, groupId: string, actor: Actor) {
  const rows = await db
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, batchId), eq(importBatches.groupId, groupId)))
    .limit(1);
  const batch = rows[0];
  if (!batch) throw new AppError("NOT_FOUND", "Import batch not found.");
  if (batch.createdBy !== actor.id) {
    throw new AppError("FORBIDDEN", "Only the person who uploaded this preview can change or commit it.");
  }
  if (batch.status === "COMMITTED") {
    throw new AppError("DUPLICATE_IMPORT", "This import batch was already committed.");
  }
  if (batch.expiresAt.getTime() <= Date.now()) {
    await db.update(importBatches).set({ status: "EXPIRED" }).where(eq(importBatches.id, batchId));
    throw new AppError("INVALID_STATE", "This import preview expired. Upload the file again.");
  }
  return batch;
}

export async function previewImportMapping(actor: Actor, groupId: string, batchId: string, rawMapping: unknown) {
  const membership = await requireWritableGroup(groupId, actor.id, "EDITOR");
  const parsedMapping = importMappingSchema.safeParse(rawMapping);
  if (!parsedMapping.success) {
    return { ok: false as const, error: parsedMapping.error.issues[0]?.message ?? "Mapping is invalid." };
  }
  const mapping = parsedMapping.data;
  const batch = await assertBatchUsable(batchId, groupId, actor);
  const headers = batch.headers as string[];
  validateMappingColumns(mapping, headers);

  const participantRows = await loadParticipants(groupId);
  const participantById = new Map(participantRows.map((row) => [row.id, row]));
  const activeIds = new Set(participantRows.filter((row) => row.status === "ACTIVE").map((row) => row.id));
  for (const id of mapping.participantIds) {
    if (!activeIds.has(id)) {
      return { ok: false as const, error: "Every default beneficiary must be an active participant in this group." };
    }
  }
  for (const id of [...Object.values(mapping.payerMap), ...Object.values(mapping.participantMap)]) {
    if (!activeIds.has(id)) {
      return { ok: false as const, error: "Every mapped name must point to an active participant in this group." };
    }
  }

  const existingRows = await db
    .select({ rowNumber: importRows.rowNumber, raw: importRows.raw })
    .from(importRows)
    .where(eq(importRows.batchId, batchId))
    .orderBy(importRows.rowNumber);
  const distinctPayers = await gatherDistinctValues(existingRows, mapping.payerColumn, "payer");
  const distinctParticipants = mapping.participantsColumn
    ? await gatherDistinctValues(existingRows, mapping.participantsColumn, "participants")
    : [];

  const outcomes = existingRows.map((row) => {
    const values = row.raw as Record<string, string>;
    const result = normalizeRow(values, mapping, participantById, membership.currency);
    return { rowNumber: row.rowNumber, ...result };
  });

  const fingerprintRows = outcomes
    .filter((outcome) => outcome.normalized)
    .map((outcome) => {
      const normalized = outcome.normalized as NormalizedImportRow;
      return {
        rowNumber: outcome.rowNumber,
        fingerprint: expenseFingerprint({
          groupId,
          occurredOn: normalized.occurredOn,
          payerParticipantId: normalized.payerParticipantId,
          amountMinor: BigInt(normalized.amountMinor),
          description: normalized.description,
        }),
      };
    });
  const existingMatches =
    fingerprintRows.length > 0
      ? await db
          .select({ id: expenses.id, fingerprint: expenses.fingerprint })
          .from(expenses)
          .where(
            and(
              eq(expenses.groupId, groupId),
              eq(expenses.status, "ACTIVE"),
              inArray(
                expenses.fingerprint,
                fingerprintRows.map((row) => row.fingerprint),
              ),
            ),
          )
      : [];
  const existingByFingerprint = new Map(existingMatches.map((row) => [row.fingerprint, row.id]));
  const seenInBatch = new Map<string, number>();

  const preparedRows = outcomes.map((outcome) => {
    const errors = [...outcome.errors];
    let status: "VALID" | "DUPLICATE" | "ERROR" = errors.length > 0 ? "ERROR" : "VALID";
    let matchedExpenseId: string | null = null;
    let fingerprint: string | null = null;
    if (outcome.normalized) {
      const normalized = outcome.normalized;
      fingerprint = expenseFingerprint({
        groupId,
        occurredOn: normalized.occurredOn,
        payerParticipantId: normalized.payerParticipantId,
        amountMinor: BigInt(normalized.amountMinor),
        description: normalized.description,
      });
      const existing = existingByFingerprint.get(fingerprint);
      const earlierRow = seenInBatch.get(fingerprint);
      if (status === "VALID" && existing) {
        status = "DUPLICATE";
        matchedExpenseId = existing;
        errors.push({
          code: "POSSIBLE_DUPLICATE",
          message: "An active expense with the same date, payer, amount, and description already exists.",
        });
      } else if (status === "VALID" && earlierRow) {
        status = "DUPLICATE";
        errors.push({
          code: "DUPLICATE_IN_FILE",
          message: `This row matches row ${earlierRow} in the same file.`,
          duplicateOfRow: earlierRow,
        });
      }
      if (!seenInBatch.has(fingerprint)) seenInBatch.set(fingerprint, outcome.rowNumber);
    }
    return {
      rowNumber: outcome.rowNumber,
      raw: existingRows.find((row) => row.rowNumber === outcome.rowNumber)?.raw,
      normalized: outcome.normalized,
      fingerprint,
      status,
      errors,
      matchedExpenseId,
    };
  });

  const validCount = preparedRows.filter((row) => row.status === "VALID").length;
  const duplicateCount = preparedRows.filter((row) => row.status === "DUPLICATE").length;
  const errorCount = preparedRows.filter((row) => row.status === "ERROR").length;

  await db.transaction(async (tx) => {
    await tx.delete(importRows).where(eq(importRows.batchId, batchId));
    await tx.insert(importRows).values(
      preparedRows.map((row) => ({
        batchId,
        rowNumber: row.rowNumber,
        raw: row.raw,
        normalized: row.normalized,
        fingerprint: row.fingerprint,
        status: row.status,
        errors: row.errors,
        matchedExpenseId: row.matchedExpenseId,
      })),
    );
    await tx
      .update(importBatches)
      .set({
        mapping,
        duplicatePolicy: mapping.duplicatePolicy,
        validCount,
        duplicateCount,
        errorCount,
        previewedAt: new Date(),
        expiresAt: new Date(Date.now() + IMPORT_TTL_MINUTES * 60 * 1000),
      })
      .where(eq(importBatches.id, batchId));
    await recordAudit(tx, {
      groupId,
      actorId: actor.id,
      action: "IMPORT_PREVIEWED",
      targetType: "import_batch",
      targetId: batchId,
      metadata: { validCount, duplicateCount, errorCount, duplicatePolicy: mapping.duplicatePolicy },
    });
  });

  return {
    ok: true as const,
    batchId,
    counts: { rowCount: preparedRows.length, validCount, duplicateCount, errorCount },
    distinctPayers,
    distinctParticipants,
    unmappedPayers: distinctPayers.filter((name) => !lookupMapping(mapping.payerMap, name)),
    unmappedParticipants: distinctParticipants.filter((name) => !lookupMapping(mapping.participantMap, name)),
    previewRows: preparedRows.slice(0, 100),
    expiresAt: new Date(Date.now() + IMPORT_TTL_MINUTES * 60 * 1000),
  };
}

export async function getImportBatch(groupId: string, batchId: string, actor: Actor, page = 1, statusFilter?: string) {
  await requireGroupRole(groupId, actor.id, "EDITOR");
  const rows = await db
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, batchId), eq(importBatches.groupId, groupId)))
    .limit(1);
  const batch = rows[0];
  if (!batch) throw new AppError("NOT_FOUND", "Import batch not found.");

  const size = 100;
  const conditions = [eq(importRows.batchId, batchId)];
  if (statusFilter && ["VALID", "DUPLICATE", "ERROR", "COMMITTED", "SKIPPED"].includes(statusFilter)) {
    conditions.push(eq(importRows.status, statusFilter as "VALID" | "DUPLICATE" | "ERROR" | "COMMITTED" | "SKIPPED"));
  }
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(importRows)
    .where(and(...conditions));
  const rowData = await db
    .select({
      rowNumber: importRows.rowNumber,
      normalized: importRows.normalized,
      status: importRows.status,
      errors: importRows.errors,
      matchedExpenseId: importRows.matchedExpenseId,
      createdExpenseId: importRows.createdExpenseId,
    })
    .from(importRows)
    .where(and(...conditions))
    .orderBy(importRows.rowNumber)
    .limit(size)
    .offset((Math.max(1, page) - 1) * size);

  return {
    batch,
    rows: rowData,
    total: countRow?.count ?? 0,
    page: Math.max(1, page),
    pageCount: Math.max(1, Math.ceil((countRow?.count ?? 0) / size)),
  };
}

export async function listImportBatches(groupId: string, actor: Actor) {
  await requireGroupRole(groupId, actor.id, "EDITOR");
  return db
    .select({
      id: importBatches.id,
      filename: importBatches.filename,
      status: importBatches.status,
      rowCount: importBatches.rowCount,
      validCount: importBatches.validCount,
      duplicateCount: importBatches.duplicateCount,
      errorCount: importBatches.errorCount,
      committedCount: importBatches.committedCount,
      skippedCount: importBatches.skippedCount,
      createdAt: importBatches.createdAt,
      committedAt: importBatches.committedAt,
      expiresAt: importBatches.expiresAt,
      createdBy: importBatches.createdBy,
    })
    .from(importBatches)
    .where(eq(importBatches.groupId, groupId))
    .orderBy(desc(importBatches.createdAt));
}

export async function commitImport(actor: Actor, groupId: string, batchId: string) {
  await requireWritableGroup(groupId, actor.id, "EDITOR");
  return db.transaction(async (tx) => {
    const batchRows = await tx
      .select()
      .from(importBatches)
      .where(and(eq(importBatches.id, batchId), eq(importBatches.groupId, groupId)))
      .limit(1)
      .for("update");
    const batch = batchRows[0];
    if (!batch) throw new AppError("NOT_FOUND", "Import batch not found.");
    if (batch.createdBy !== actor.id) {
      throw new AppError("FORBIDDEN", "Only the person who uploaded this preview can commit it.");
    }
    if (batch.status === "COMMITTED") {
      throw new AppError("DUPLICATE_IMPORT", "This import batch was already committed.");
    }
    if (batch.expiresAt.getTime() <= Date.now()) {
      await tx.update(importBatches).set({ status: "EXPIRED" }).where(eq(importBatches.id, batchId));
      throw new AppError("INVALID_STATE", "This import preview expired. Upload the file again.");
    }
    if (!batch.mapping) {
      throw new AppError("VALIDATION_ERROR", "Preview a column mapping before committing.");
    }
    const mapping = importMappingSchema.parse(batch.mapping);
    if (mapping.duplicatePolicy !== batch.duplicatePolicy) {
      throw new AppError("VALIDATION_ERROR", "Preview the import again with the chosen duplicate policy.");
    }

    const groupRows = await tx.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    const group = groupRows[0];
    if (!group) throw new AppError("NOT_FOUND", "Group not found.");
    if (group.status !== "ACTIVE") throw new AppError("INVALID_STATE", "This group is archived.");
    const membershipRows = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, actor.id), eq(memberships.status, "ACTIVE")))
      .limit(1);
    const role = membershipRows[0]?.role;
    if (!role || (role !== "EDITOR" && role !== "OWNER")) {
      throw new AppError("FORBIDDEN", "Your group role does not allow imports.");
    }
    const currency = getCurrency(group.currency);

    const participantRows = await tx
      .select({ id: participants.id, displayName: participants.displayName, status: participants.status })
      .from(participants)
      .where(eq(participants.groupId, groupId));
    const activeIds = new Set(participantRows.filter((row) => row.status === "ACTIVE").map((row) => row.id));
    for (const id of mapping.participantIds) {
      if (!activeIds.has(id)) {
        throw new AppError("CONFLICT", "A mapped participant is no longer active. Preview the import again.");
      }
    }
    for (const id of [...Object.values(mapping.payerMap), ...Object.values(mapping.participantMap)]) {
      if (!activeIds.has(id)) {
        throw new AppError("CONFLICT", "A mapped participant is no longer active. Preview the import again.");
      }
    }

    const storedRows = await tx
      .select()
      .from(importRows)
      .where(eq(importRows.batchId, batchId))
      .orderBy(importRows.rowNumber);
    const fingerprints = storedRows
      .map((row) => row.fingerprint)
      .filter((value): value is string => Boolean(value));
    const existing =
      fingerprints.length > 0
        ? await tx
            .select({ fingerprint: expenses.fingerprint })
            .from(expenses)
            .where(
              and(
                eq(expenses.groupId, groupId),
                eq(expenses.status, "ACTIVE"),
                inArray(expenses.fingerprint, fingerprints),
              ),
            )
        : [];
    const existingFingerprints = new Set(existing.map((row) => row.fingerprint));
    const seen = new Set<string>();
    let committedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;

    for (const row of storedRows) {
      const errors = row.errors as RowError[];
      if (row.status === "ERROR" || !row.normalized || !row.fingerprint) {
        errorCount += 1;
        continue;
      }
      const isDuplicate = existingFingerprints.has(row.fingerprint) || seen.has(row.fingerprint);
      if (isDuplicate) duplicateCount += 1;
      if (isDuplicate && mapping.duplicatePolicy === "SKIP") {
        await tx
          .update(importRows)
          .set({ status: "SKIPPED", errors: [...errors, { code: "SKIPPED_DUPLICATE", message: "Skipped by the duplicate policy." }] })
          .where(eq(importRows.id, row.id));
        skippedCount += 1;
        continue;
      }
      seen.add(row.fingerprint);
      const normalized = row.normalized as NormalizedImportRow;
      const amountMinor = BigInt(normalized.amountMinor);
      const allocation = allocateSplit(amountMinor, { method: "EQUAL", participantIds: normalized.participantIds });
      const expenseRows = await tx
        .insert(expenses)
        .values({
          groupId,
          description: normalized.description,
          category: normalized.category,
          occurredOn: normalized.occurredOn,
          payerParticipantId: normalized.payerParticipantId,
          currency: currency.code,
          amountMinor,
          notes: normalized.notes,
          createdBy: actor.id,
          revision: 1,
          importBatchId: batchId,
          importRowNumber: row.rowNumber,
          fingerprint: row.fingerprint,
        })
        .returning({ id: expenses.id });
      const expense = expenseRows[0];
      if (!expense) throw new AppError("INTERNAL_ERROR", "Imported expense could not be created.");
      await tx.insert(expenseSplits).values(
        allocation.allocations.map((split) => ({
          groupId,
          expenseId: expense.id,
          participantId: split.participantId,
          method: split.method,
          allocatedMinor: split.amountMinor,
          basisPoints: split.basisPoints,
          shares: split.shares,
        })),
      );
      await tx.insert(expenseRevisions).values({
        groupId,
        expenseId: expense.id,
        revision: 1,
        action: "CREATED",
        actorId: actor.id,
        afterSnapshot: {
          description: normalized.description,
          category: normalized.category,
          occurredOn: normalized.occurredOn,
          payerParticipantId: normalized.payerParticipantId,
          amountMinor: normalized.amountMinor,
          notes: normalized.notes,
          status: "ACTIVE",
          splits: allocation.allocations.map((split) => ({
            participantId: split.participantId,
            amountMinor: split.amountMinor.toString(),
            method: split.method,
            basisPoints: split.basisPoints,
            shares: split.shares,
          })),
          source: { importBatchId: batchId, rowNumber: row.rowNumber },
        },
        reason: `Imported from ${batch.filename}`,
      });
      await tx
        .update(importRows)
        .set({ status: "COMMITTED", createdExpenseId: expense.id })
        .where(eq(importRows.id, row.id));
      committedCount += 1;
    }

    await tx
      .update(importBatches)
      .set({
        status: "COMMITTED",
        committedAt: new Date(),
        committedCount,
        skippedCount,
        duplicateCount,
        errorCount,
      })
      .where(eq(importBatches.id, batchId));
    await recordAudit(tx, {
      groupId,
      actorId: actor.id,
      action: "IMPORT_COMMITTED",
      targetType: "import_batch",
      targetId: batchId,
      metadata: {
        filename: batch.filename,
        committedCount,
        skippedCount,
        duplicateCount,
        errorCount,
        duplicatePolicy: mapping.duplicatePolicy,
      },
    });

    return { committedCount, skippedCount, duplicateCount, errorCount, rowCount: storedRows.length };
  });
}

export async function resolveImportBatchGroup(batchId: string, userId: string) {
  const rows = await db
    .select({ groupId: importBatches.groupId })
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .limit(1);
  const batch = rows[0];
  if (!batch) throw new AppError("NOT_FOUND", "Import batch not found.");
  const membership = await requireGroupRole(batch.groupId, userId, "EDITOR");
  return { groupId: batch.groupId, membership };
}
