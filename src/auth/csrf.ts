import { AppError } from "@/lib/errors";

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new AppError("FORBIDDEN", "This request must come from the app origin.");
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("FORBIDDEN", "Invalid request origin.");
  }
  const requestHost = request.headers.get("host") ?? "";
  const configuredHost = process.env.APP_URL ? new URL(process.env.APP_URL).host : "";
  if (originHost !== requestHost && originHost !== configuredHost) {
    throw new AppError("FORBIDDEN", "This request came from an untrusted origin.");
  }
}
