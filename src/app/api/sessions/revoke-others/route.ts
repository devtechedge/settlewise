import { errorResponse, json } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { requireAuth, revokeOtherSessions } from "@/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth();
    await revokeOtherSessions(auth.user.id, auth.sessionId);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
