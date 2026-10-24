export class ApiError extends Error {
  code: string;
  details?: unknown;

  constructor(message: string, code = "REQUEST_FAILED", details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

export async function apiRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(url, { ...init, headers, credentials: "same-origin" });
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: { code?: string; message?: string; details?: unknown } })
    | null;
  if (!response.ok) {
    const error = body?.error;
    throw new ApiError(error?.message ?? "The request could not be completed.", error?.code ?? "REQUEST_FAILED", error?.details);
  }
  return body as T;
}
