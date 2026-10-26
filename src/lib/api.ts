import { AppError, errorBody, isAppError, type ErrorCode } from "@/lib/errors";
import { requireAuth } from "@/auth/session";
import type { z } from "zod";

const MAX_JSON_BYTES = 200_000;

const DATABASE_ERROR_BY_CODE: Record<string, { code: ErrorCode; message: string }> = {
  "22P02": { code: "VALIDATION_ERROR", message: "This request used a malformed identifier." },
  "23505": { code: "CONFLICT", message: "This entry already exists." },
  "23503": { code: "CONFLICT", message: "This entry references data that no longer exists." },
  "23514": { code: "VALIDATION_ERROR", message: "Check the submitted fields." },
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value)), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function errorResponse(error: unknown) {
  if (isAppError(error)) {
    return respondError(error);
  }
  if (typeof error === "object" && error && "issues" in error) {
    const issues = (error as { issues: { path: (string | number)[]; message: string }[] }).issues;
    return respondError(
      new AppError(
        "VALIDATION_ERROR",
        "Check the submitted fields.",
        issues.slice(0, 20).map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      ),
    );
  }
  const mapped = databaseErrorCode(error);
  if (mapped) {
    return respondError(new AppError(mapped.code, mapped.message));
  }
  console.error("Unhandled API error", error instanceof Error ? error.message : error);
  return respondError(new AppError("INTERNAL_ERROR", "The request could not be completed."));
}

function databaseErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  const code = candidate.code ?? candidate.cause?.code;
  return typeof code === "string" ? DATABASE_ERROR_BY_CODE[code] ?? null : null;
}

function respondError(error: AppError) {
  return new Response(JSON.stringify(errorBody(error)), {
    status: error.status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function apiAuth() {
  const auth = await requireAuth();
  return auth.user;
}

export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_JSON_BYTES) {
    throw new AppError("PAYLOAD_TOO_LARGE", "This request body is too large.");
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) {
    throw new AppError("PAYLOAD_TOO_LARGE", "This request body is too large.");
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Send a valid JSON body.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Check the submitted fields.", {
      issues: parsed.error.issues.slice(0, 20).map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  return parsed.data;
}


export function numberParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}
