import { errorResponse, json, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { consumeRateLimit } from "@/auth/rate-limit";
import { requireAuth, revokeOtherSessions } from "@/auth/session";
import { changePassword } from "@/services/account";
import { passwordChangeSchema } from "@/validation/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth();
    await consumeRateLimit(`password-change:${auth.user.id}`, 10, 60 * 60);
    const input = await readJson(request, passwordChangeSchema);
    await changePassword(auth.user.id, input.currentPassword, input.newPassword);
    await revokeOtherSessions(auth.user.id, auth.sessionId);
    return json({ ok: true, note: "Other sessions were revoked." });
  } catch (error) {
    return errorResponse(error);
  }
}
