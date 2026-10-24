import { z } from "zod";
import { EXPENSE_CATEGORIES, SUPPORTED_CURRENCY_CODES } from "@/domain/money/currency";

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const NAME_PATTERN = /^[\p{L}\p{M}0-9 .&'’()\/-]+$/u;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .transform((value) => value.toLowerCase())
  .refine((value) => EMAIL_PATTERN.test(value), "Enter a valid email address.");

export const passwordSchema = z.string().min(10, "Use at least 10 characters.").max(200, "That password is too long.");

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(60, "Keep the name under 60 characters.")
  .refine((value) => NAME_PATTERN.test(value), "Use letters, numbers, spaces, and common name punctuation.")
  .refine((value) => !CONTROL_CHARS.test(value), "Remove control characters.");

export const groupNameSchema = z
  .string()
  .trim()
  .min(2, "Enter a group name.")
  .max(80, "Keep the group name under 80 characters.")
  .refine((value) => NAME_PATTERN.test(value), "Use letters, numbers, spaces, and common punctuation.");

export const descriptionSchema = z
  .string()
  .trim()
  .min(1, "Enter a description.")
  .max(120, "Keep the description under 120 characters.")
  .refine((value) => !CONTROL_CHARS.test(value), "Remove control characters.");

export const shortNoteSchema = z
  .string()
  .trim()
  .max(500, "Keep notes under 500 characters.")
  .refine((value) => !CONTROL_CHARS.test(value), "Remove control characters.");

export const amountInputSchema = z
  .string()
  .trim()
  .min(1, "Enter an amount.")
  .max(24, "That amount is too long.");

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a real calendar date.")
  .refine((value) => value >= "2000-01-01", "Date must be in 2000 or later.")
  .refine((value) => value <= new Date().toISOString().slice(0, 10), "Date cannot be in the future.");

export const currencySchema = z.enum(SUPPORTED_CURRENCY_CODES);
export const categorySchema = z.enum(EXPENSE_CATEGORIES);
export const roleSchema = z.enum(["OWNER", "EDITOR", "MEMBER"]);

export const uuidSchema = z.uuid("Choose a valid record.");

export const signupSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(200),
});

export const groupCreateSchema = z.object({
  name: groupNameSchema,
  currency: currencySchema,
  budget: z.string().trim().max(24).optional().or(z.literal("")),
  invites: z
    .array(
      z.object({
        email: emailSchema,
        role: z.enum(["EDITOR", "MEMBER"]),
      }),
    )
    .max(20)
    .default([]),
});

export const participantCreateSchema = z.object({
  displayName: displayNameSchema,
});

export const invitationCreateSchema = z.object({
  email: emailSchema,
  role: z.enum(["EDITOR", "MEMBER"]),
});

export const splitInputSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("EQUAL"),
    participantIds: z.array(uuidSchema).min(1).max(100),
  }),
  z.object({
    method: z.literal("EXACT"),
    entries: z
      .array(z.object({ participantId: uuidSchema, amount: amountInputSchema }))
      .min(1)
      .max(100),
  }),
  z.object({
    method: z.literal("PERCENT"),
    entries: z
      .array(z.object({ participantId: uuidSchema, percent: z.string().trim().max(10) }))
      .min(1)
      .max(100),
  }),
  z.object({
    method: z.literal("SHARES"),
    entries: z
      .array(z.object({ participantId: uuidSchema, shares: z.number().int().min(1).max(1_000_000) }))
      .min(1)
      .max(100),
  }),
]);

export const expenseCreateSchema = z.object({
  description: descriptionSchema,
  category: categorySchema,
  occurredOn: isoDateSchema,
  payerParticipantId: uuidSchema,
  amount: amountInputSchema,
  notes: shortNoteSchema.optional().or(z.literal("")),
  split: splitInputSchema,
});

export const expenseUpdateSchema = expenseCreateSchema.extend({
  expectedRevision: z.number().int().min(1),
  reason: z.string().trim().min(3, "Give a short reason for the correction.").max(300),
});

export const voidExpenseSchema = z.object({
  expectedRevision: z.number().int().min(1),
  reason: z.string().trim().min(3, "Give a reason for voiding this expense.").max(300),
});

export const paymentCreateSchema = z.object({
  senderParticipantId: uuidSchema,
  recipientParticipantId: uuidSchema,
  amount: amountInputSchema,
  paidOn: isoDateSchema,
  notes: shortNoteSchema.optional().or(z.literal("")),
  idempotencyKey: z.string().trim().min(8).max(100),
});

export const paymentReversalSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason for reversing this payment.").max(300),
  idempotencyKey: z.string().trim().min(8).max(100),
});

export const budgetSchema = z.object({
  scope: z.enum(["OVERALL", "CATEGORY"]),
  category: categorySchema.optional(),
  period: z.enum(["MONTHLY", "ALL_TIME"]),
  limit: amountInputSchema,
});

export const importMappingSchema = z.object({
  dateColumn: z.string().min(1),
  descriptionColumn: z.string().min(1),
  amountColumn: z.string().min(1),
  payerColumn: z.string().min(1),
  categoryColumn: z.string().nullable().optional(),
  participantsColumn: z.string().nullable().optional(),
  notesColumn: z.string().nullable().optional(),
  participantIds: z.array(uuidSchema).min(1).max(100),
  payerMap: z.record(z.string(), uuidSchema).default({}),
  participantMap: z.record(z.string(), uuidSchema).default({}),
  duplicatePolicy: z.enum(["SKIP", "IMPORT_ANYWAY"]),
});

export const importCommitSchema = z.object({
  batchId: uuidSchema,
});

export const importPreviewMappingSchema = z.object({
  batchId: uuidSchema,
  mapping: importMappingSchema,
});

export const profileUpdateSchema = z.object({
  displayName: displayNameSchema,
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(200),
  confirmation: z.literal("DELETE", { message: "Type DELETE to confirm." }),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
