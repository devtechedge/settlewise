import { errorResponse, json } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { requireAuth, revokeSession } from "@/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth();
    const { id } = await context.params;
    if (id === auth.sessionId) {
      return json({ error: { code: "CONFLICT", message: "Use sign out to end the current session." } }, 409);
    }
    await revokeSession(id, auth.user.id);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
