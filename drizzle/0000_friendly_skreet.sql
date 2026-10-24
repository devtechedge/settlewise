CREATE TYPE "public"."budget_period" AS ENUM('MONTHLY', 'ALL_TIME');--> statement-breakpoint
CREATE TYPE "public"."budget_scope" AS ENUM('OVERALL', 'CATEGORY');--> statement-breakpoint
CREATE TYPE "public"."duplicate_policy" AS ENUM('SKIP', 'IMPORT_ANYWAY');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('ACTIVE', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."export_format" AS ENUM('CSV');--> statement-breakpoint
CREATE TYPE "public"."group_status" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."import_batch_status" AS ENUM('PREVIEWED', 'COMMITTED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."import_row_status" AS ENUM('VALID', 'DUPLICATE', 'ERROR', 'COMMITTED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('OWNER', 'EDITOR', 'MEMBER');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('ACTIVE', 'LEFT', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('RECORDED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."revision_action" AS ENUM('CREATED', 'UPDATED', 'VOIDED');--> statement-breakpoint
CREATE TYPE "public"."split_method" AS ENUM('EQUAL', 'EXACT', 'PERCENT', 'SHARES');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"reason" text,
	"metadata" jsonb,
	"before_revision" integer,
	"after_revision" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"scope" "budget_scope" NOT NULL,
	"category" text DEFAULT 'ALL' NOT NULL,
	"period" "budget_period" NOT NULL,
	"limit_minor" bigint NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_limit_positive" CHECK ("budgets"."limit_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "expense_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"action" "revision_action" NOT NULL,
	"reason" text,
	"actor_id" uuid,
	"before_snapshot" jsonb,
	"after_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"method" "split_method" NOT NULL,
	"allocated_minor" bigint NOT NULL,
	"basis_points" integer,
	"shares" integer,
	CONSTRAINT "expense_splits_allocated_nonnegative" CHECK ("expense_splits"."allocated_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"occurred_on" date NOT NULL,
	"payer_participant_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"notes" text,
	"status" "expense_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_by" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"import_batch_id" uuid,
	"import_row_number" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_id_group_unique" UNIQUE("id","group_id"),
	CONSTRAINT "expenses_amount_positive" CHECK ("expenses"."amount_minor" > 0),
	CONSTRAINT "expenses_revision_positive" CHECK ("expenses"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "export_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"format" "export_format" NOT NULL,
	"filters" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"row_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"currency_precision" smallint NOT NULL,
	"budget_minor" bigint,
	"status" "group_status" DEFAULT 'ACTIVE' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_id_currency_unique" UNIQUE("id","currency")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"filename" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"checksum" text NOT NULL,
	"headers" jsonb NOT NULL,
	"mapping" jsonb,
	"duplicate_policy" "duplicate_policy",
	"status" "import_batch_status" DEFAULT 'PREVIEWED' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"valid_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"committed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"previewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"committed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"normalized" jsonb,
	"fingerprint" text,
	"status" "import_row_status" NOT NULL,
	"errors" jsonb NOT NULL,
	"matched_expense_id" uuid,
	"created_expense_id" uuid
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "membership_role" DEFAULT 'MEMBER' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"status" "membership_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"status" "participant_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_id_group_unique" UNIQUE("id","group_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settlement_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"sender_participant_id" uuid NOT NULL,
	"recipient_participant_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"paid_on" date NOT NULL,
	"status" "payment_status" DEFAULT 'RECORDED' NOT NULL,
	"notes" text,
	"idempotency_key" text NOT NULL,
	"created_by" uuid NOT NULL,
	"reversal_of_payment_id" uuid,
	"reversal_reason" text,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlement_payments_id_group_unique" UNIQUE("id","group_id"),
	CONSTRAINT "settlement_payments_amount_positive" CHECK ("settlement_payments"."amount_minor" > 0),
	CONSTRAINT "settlement_payments_distinct_participants" CHECK ("settlement_payments"."sender_participant_id" <> "settlement_payments"."recipient_participant_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"disabled_at" timestamp with time zone,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_revisions" ADD CONSTRAINT "expense_revisions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_revisions" ADD CONSTRAINT "expense_revisions_expense_group_fk" FOREIGN KEY ("expense_id","group_id") REFERENCES "public"."expenses"("id","group_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_expense_group_fk" FOREIGN KEY ("expense_id","group_id") REFERENCES "public"."expenses"("id","group_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_participant_group_fk" FOREIGN KEY ("participant_id","group_id") REFERENCES "public"."participants"("id","group_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payer_group_fk" FOREIGN KEY ("payer_participant_id","group_id") REFERENCES "public"."participants"("id","group_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_group_currency_fk" FOREIGN KEY ("group_id","currency") REFERENCES "public"."groups"("id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_records" ADD CONSTRAINT "export_records_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_records" ADD CONSTRAINT "export_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_matched_expense_id_expenses_id_fk" FOREIGN KEY ("matched_expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_created_expense_id_expenses_id_fk" FOREIGN KEY ("created_expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_payments" ADD CONSTRAINT "settlement_payments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_payments" ADD CONSTRAINT "settlement_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_payments" ADD CONSTRAINT "settlement_payments_sender_group_fk" FOREIGN KEY ("sender_participant_id","group_id") REFERENCES "public"."participants"("id","group_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_payments" ADD CONSTRAINT "settlement_payments_recipient_group_fk" FOREIGN KEY ("recipient_participant_id","group_id") REFERENCES "public"."participants"("id","group_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_payments" ADD CONSTRAINT "settlement_payments_group_currency_fk" FOREIGN KEY ("group_id","currency") REFERENCES "public"."groups"("id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_group_created_idx" ON "audit_events" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "audit_events" USING btree ("group_id","target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_group_scope_period_category_unique" ON "budgets" USING btree ("group_id","scope","period","category");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_revisions_expense_revision_unique" ON "expense_revisions" USING btree ("expense_id","revision");--> statement-breakpoint
CREATE INDEX "expense_revisions_group_created_idx" ON "expense_revisions" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_splits_expense_participant_unique" ON "expense_splits" USING btree ("expense_id","participant_id");--> statement-breakpoint
CREATE INDEX "expense_splits_participant_idx" ON "expense_splits" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "expenses_group_date_idx" ON "expenses" USING btree ("group_id","occurred_on");--> statement-breakpoint
CREATE INDEX "expenses_group_category_idx" ON "expenses" USING btree ("group_id","category");--> statement-breakpoint
CREATE INDEX "expenses_group_status_idx" ON "expenses" USING btree ("group_id","status");--> statement-breakpoint
CREATE INDEX "expenses_group_payer_idx" ON "expenses" USING btree ("group_id","payer_participant_id");--> statement-breakpoint
CREATE INDEX "export_records_group_created_idx" ON "export_records" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "groups_owner_idx" ON "groups" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "import_batches_group_created_idx" ON "import_batches" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "import_batches_group_status_idx" ON "import_batches" USING btree ("group_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "import_rows_batch_row_unique" ON "import_rows" USING btree ("batch_id","row_number");--> statement-breakpoint
CREATE INDEX "import_rows_batch_status_idx" ON "import_rows" USING btree ("batch_id","status");--> statement-breakpoint
CREATE INDEX "import_rows_fingerprint_idx" ON "import_rows" USING btree ("fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_unique" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitations_group_email_idx" ON "invitations" USING btree ("group_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_group_user_unique" ON "memberships" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memberships_group_role_idx" ON "memberships" USING btree ("group_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_group_user_unique" ON "participants" USING btree ("group_id","user_id") WHERE "participants"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "participants_group_name_unique" ON "participants" USING btree ("group_id",lower("display_name"));--> statement-breakpoint
CREATE INDEX "participants_group_status_idx" ON "participants" USING btree ("group_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_payments_idempotency_unique" ON "settlement_payments" USING btree ("group_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_payments_reversal_unique" ON "settlement_payments" USING btree ("reversal_of_payment_id") WHERE "settlement_payments"."reversal_of_payment_id" is not null;--> statement-breakpoint
CREATE INDEX "settlement_payments_group_created_idx" ON "settlement_payments" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "settlement_payments_group_status_idx" ON "settlement_payments" USING btree ("group_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));