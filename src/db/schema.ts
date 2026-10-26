import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const membershipRole = pgEnum("membership_role", ["OWNER", "EDITOR", "MEMBER"]);
export const membershipStatus = pgEnum("membership_status", ["ACTIVE", "LEFT", "REMOVED"]);
export const groupStatus = pgEnum("group_status", ["ACTIVE", "ARCHIVED"]);
export const participantStatus = pgEnum("participant_status", ["ACTIVE", "INACTIVE"]);
export const expenseStatus = pgEnum("expense_status", ["ACTIVE", "VOID"]);
export const splitMethodEnum = pgEnum("split_method", ["EQUAL", "EXACT", "PERCENT", "SHARES"]);
export const revisionAction = pgEnum("revision_action", ["CREATED", "UPDATED", "VOIDED"]);
export const paymentStatus = pgEnum("payment_status", ["RECORDED", "REVERSED"]);
export const importBatchStatus = pgEnum("import_batch_status", ["PREVIEWED", "COMMITTED", "EXPIRED"]);
export const importRowStatus = pgEnum("import_row_status", ["VALID", "DUPLICATE", "ERROR", "COMMITTED", "SKIPPED"]);
export const duplicatePolicy = pgEnum("duplicate_policy", ["SKIP", "IMPORT_ANYWAY"]);
export const budgetScope = pgEnum("budget_scope", ["OVERALL", "CATEGORY"]);
export const budgetPeriod = pgEnum("budget_period", ["MONTHLY", "ALL_TIME"]);
export const exportFormat = pgEnum("export_format", ["CSV"]);

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("users_email_unique").on(sql`lower(${table.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
    createdAt,
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    currency: text("currency").notNull(),
    currencyPrecision: smallint("currency_precision").notNull(),
    budgetMinor: bigint("budget_minor", { mode: "bigint" }),
    status: groupStatus("status").notNull().default("ACTIVE"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("groups_id_currency_unique").on(table.id, table.currency),
    index("groups_owner_idx").on(table.ownerId),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
    status: membershipStatus("status").notNull().default("ACTIVE"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("memberships_group_user_unique").on(table.groupId, table.userId),
    index("memberships_user_idx").on(table.userId),
    index("memberships_group_role_idx").on(table.groupId, table.role),
  ],
);

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),
    status: participantStatus("status").notNull().default("ACTIVE"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("participants_id_group_unique").on(table.id, table.groupId),
    uniqueIndex("participants_group_user_unique")
      .on(table.groupId, table.userId)
      .where(sql`${table.userId} is not null`),
    uniqueIndex("participants_group_name_unique").on(table.groupId, sql`lower(${table.displayName})`),
    index("participants_group_status_idx").on(table.groupId, table.status),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: membershipRole("role").notNull().default("MEMBER"),
    tokenHash: text("token_hash").notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [
    uniqueIndex("invitations_token_hash_unique").on(table.tokenHash),
    index("invitations_group_email_idx").on(table.groupId, table.email),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    category: text("category").notNull(),
    occurredOn: date("occurred_on").notNull(),
    payerParticipantId: uuid("payer_participant_id").notNull(),
    currency: text("currency").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    notes: text("notes"),
    fingerprint: text("fingerprint"),
    status: expenseStatus("status").notNull().default("ACTIVE"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull().default(1),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    importBatchId: uuid("import_batch_id"),
    importRowNumber: integer("import_row_number"),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("expenses_id_group_unique").on(table.id, table.groupId),
    foreignKey({
      name: "expenses_payer_group_fk",
      columns: [table.payerParticipantId, table.groupId],
      foreignColumns: [participants.id, participants.groupId],
    }).onDelete("restrict"),
    foreignKey({
      name: "expenses_group_currency_fk",
      columns: [table.groupId, table.currency],
      foreignColumns: [groups.id, groups.currency],
    }).onDelete("restrict"),
    index("expenses_group_date_idx").on(table.groupId, table.occurredOn),
    index("expenses_group_category_idx").on(table.groupId, table.category),
    index("expenses_group_status_idx").on(table.groupId, table.status),
    index("expenses_group_payer_idx").on(table.groupId, table.payerParticipantId),
    index("expenses_group_fingerprint_idx").on(table.groupId, table.fingerprint),
    check("expenses_amount_positive", sql`${table.amountMinor} > 0`),
    check("expenses_revision_positive", sql`${table.revision} >= 1`),
  ],
);

export const expenseSplits = pgTable(
  "expense_splits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull(),
    expenseId: uuid("expense_id").notNull(),
    participantId: uuid("participant_id").notNull(),
    method: splitMethodEnum("method").notNull(),
    allocatedMinor: bigint("allocated_minor", { mode: "bigint" }).notNull(),
    basisPoints: integer("basis_points"),
    shares: integer("shares"),
  },
  (table) => [
    uniqueIndex("expense_splits_expense_participant_unique").on(table.expenseId, table.participantId),
    foreignKey({
      name: "expense_splits_expense_group_fk",
      columns: [table.expenseId, table.groupId],
      foreignColumns: [expenses.id, expenses.groupId],
    }).onDelete("cascade"),
    foreignKey({
      name: "expense_splits_participant_group_fk",
      columns: [table.participantId, table.groupId],
      foreignColumns: [participants.id, participants.groupId],
    }).onDelete("restrict"),
    index("expense_splits_participant_idx").on(table.participantId),
    check("expense_splits_allocated_nonnegative", sql`${table.allocatedMinor} >= 0`),
  ],
);

export const expenseRevisions = pgTable(
  "expense_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull(),
    expenseId: uuid("expense_id").notNull(),
    revision: integer("revision").notNull(),
    action: revisionAction("action").notNull(),
    reason: text("reason"),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    beforeSnapshot: jsonb("before_snapshot"),
    afterSnapshot: jsonb("after_snapshot"),
    createdAt,
  },
  (table) => [
    uniqueIndex("expense_revisions_expense_revision_unique").on(table.expenseId, table.revision),
    foreignKey({
      name: "expense_revisions_expense_group_fk",
      columns: [table.expenseId, table.groupId],
      foreignColumns: [expenses.id, expenses.groupId],
    }).onDelete("cascade"),
    index("expense_revisions_group_created_idx").on(table.groupId, table.createdAt),
  ],
);

export const settlementPayments = pgTable(
  "settlement_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    senderParticipantId: uuid("sender_participant_id").notNull(),
    recipientParticipantId: uuid("recipient_participant_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    paidOn: date("paid_on").notNull(),
    status: paymentStatus("status").notNull().default("RECORDED"),
    notes: text("notes"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reversalOfPaymentId: uuid("reversal_of_payment_id"),
    reversalReason: text("reversal_reason"),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("settlement_payments_id_group_unique").on(table.id, table.groupId),
    uniqueIndex("settlement_payments_idempotency_unique").on(table.groupId, table.idempotencyKey),
    uniqueIndex("settlement_payments_reversal_unique")
      .on(table.reversalOfPaymentId)
      .where(sql`${table.reversalOfPaymentId} is not null`),
    foreignKey({
      name: "settlement_payments_sender_group_fk",
      columns: [table.senderParticipantId, table.groupId],
      foreignColumns: [participants.id, participants.groupId],
    }).onDelete("restrict"),
    foreignKey({
      name: "settlement_payments_recipient_group_fk",
      columns: [table.recipientParticipantId, table.groupId],
      foreignColumns: [participants.id, participants.groupId],
    }).onDelete("restrict"),
    foreignKey({
      name: "settlement_payments_group_currency_fk",
      columns: [table.groupId, table.currency],
      foreignColumns: [groups.id, groups.currency],
    }).onDelete("restrict"),
    index("settlement_payments_group_created_idx").on(table.groupId, table.createdAt),
    index("settlement_payments_group_status_idx").on(table.groupId, table.status),
    check("settlement_payments_amount_positive", sql`${table.amountMinor} > 0`),
    check(
      "settlement_payments_distinct_participants",
      sql`${table.senderParticipantId} <> ${table.recipientParticipantId}`,
    ),
  ],
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    filename: text("filename").notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    checksum: text("checksum").notNull(),
    headers: jsonb("headers").notNull(),
    mapping: jsonb("mapping"),
    duplicatePolicy: duplicatePolicy("duplicate_policy"),
    status: importBatchStatus("status").notNull().default("PREVIEWED"),
    rowCount: integer("row_count").notNull().default(0),
    validCount: integer("valid_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    committedCount: integer("committed_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    previewedAt: timestamp("previewed_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [
    index("import_batches_group_created_idx").on(table.groupId, table.createdAt),
    index("import_batches_group_status_idx").on(table.groupId, table.status),
  ],
);

export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    raw: jsonb("raw").notNull(),
    normalized: jsonb("normalized"),
    fingerprint: text("fingerprint"),
    status: importRowStatus("status").notNull(),
    errors: jsonb("errors").notNull(),
    matchedExpenseId: uuid("matched_expense_id").references(() => expenses.id, { onDelete: "set null" }),
    createdExpenseId: uuid("created_expense_id").references(() => expenses.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("import_rows_batch_row_unique").on(table.batchId, table.rowNumber),
    index("import_rows_batch_status_idx").on(table.batchId, table.status),
    index("import_rows_fingerprint_idx").on(table.fingerprint),
  ],
);

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    scope: budgetScope("scope").notNull(),
    category: text("category").notNull().default("ALL"),
    period: budgetPeriod("period").notNull(),
    limitMinor: bigint("limit_minor", { mode: "bigint" }).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("budgets_group_scope_period_category_unique").on(
      table.groupId,
      table.scope,
      table.period,
      table.category,
    ),
    check("budgets_limit_positive", sql`${table.limitMinor} > 0`),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    reason: text("reason"),
    metadata: jsonb("metadata"),
    beforeRevision: integer("before_revision"),
    afterRevision: integer("after_revision"),
    createdAt,
  },
  (table) => [
    index("audit_events_group_created_idx").on(table.groupId, table.createdAt),
    index("audit_events_target_idx").on(table.groupId, table.targetType, table.targetId),
  ],
);

export const exportRecords = pgTable(
  "export_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    format: exportFormat("format").notNull(),
    filters: jsonb("filters").notNull(),
    checksum: text("checksum").notNull(),
    rowCount: integer("row_count").notNull(),
    createdAt,
  },
  (table) => [index("export_records_group_created_idx").on(table.groupId, table.createdAt)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
});
