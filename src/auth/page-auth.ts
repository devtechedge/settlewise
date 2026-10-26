import { redirect } from "next/navigation";
import { getCurrentAuth, type AuthContext } from "./session";

export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/groups";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.startsWith("/login")) {
    return "/groups";
  }
  return value;
}

export async function requirePageAuth(nextPath = "/groups"): Promise<AuthContext> {
  const auth = await getCurrentAuth();
  if (!auth) {
    redirect(`/login?next=${encodeURIComponent(safeNextPath(nextPath))}`);
  }
  return auth;
}
