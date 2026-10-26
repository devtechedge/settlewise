import { apiAuth, errorResponse, json } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { revokeInvitation } from "@/services/groups";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ groupId: string; invitationId: string }> };

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    const { groupId, invitationId } = await context.params;
    await revokeInvitation(user, groupId, invitationId);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
