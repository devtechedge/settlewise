ALTER TABLE "expenses" ADD COLUMN "fingerprint" text;--> statement-breakpoint
CREATE INDEX "expenses_group_fingerprint_idx" ON "expenses" USING btree ("group_id","fingerprint");