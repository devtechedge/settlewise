import { apiAuth, errorResponse, json, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { consumeRateLimit } from "@/auth/rate-limit";
import { clearSessionCookie } from "@/auth/session";
import { deleteAccount } from "@/services/account";
import { deleteAccountSchema } from "@/validation/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    await consumeRateLimit(`account-delete:${user.id}`, 5, 60 * 60);
    const input = await readJson(request, deleteAccountSchema);
    await deleteAccount(user.id, input.password, input.confirmation);
    await clearSessionCookie();
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
