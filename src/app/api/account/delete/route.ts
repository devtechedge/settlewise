import { errorResponse, json, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { consumeRateLimit } from "@/auth/rate-limit";
import { clearSessionCookie, getCurrentAuth } from "@/auth/session";
import { deleteAccount } from "@/services/account";
import { deleteAccountSchema } from "@/validation/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await getCurrentAuth();
    if (!auth) {
      return json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } }, 401);
    }
    await consumeRateLimit(`account-delete:${auth.user.id}`, 5, 60 * 60);
    const input = await readJson(request, deleteAccountSchema);
    await deleteAccount(auth.user.id, input.password, input.confirmation);
    await clearSessionCookie();
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
