import { AppError, errorBody, isAppError } from "@/lib/errors";
import { requireAuth } from "@/auth/session";
import type { z } from "zod";

const MAX_JSON_BYTES = 200_000;

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value)), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function errorResponse(error: unknown) {
  if (isAppError(error)) {
    return new Response(JSON.stringify(errorBody(error)), {
      status: error.status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  if (typeof error === "object" && error && "issues" in error) {
    const issues = (error as { issues: { path: (string | number)[]; message: string }[] }).issues;
    return new Response(
      JSON.stringify({
        error: {
          code: "VALIDATION_ERROR",
          message: "Check the submitted fields.",
          details: issues.slice(0, 20).map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        },
      }),
      { status: 400, headers: { "content-type": "application/json", "cache-control": "no-store" } },
    );
  }
  console.error("Unhandled API error", error instanceof Error ? error.message : error);
  return new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } }), {
    status: 500,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
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
