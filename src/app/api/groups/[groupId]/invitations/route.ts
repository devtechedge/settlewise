import { apiAuth, errorResponse, json, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { consumeRateLimit } from "@/auth/rate-limit";
import { createInvitation } from "@/services/groups";
import { invitationCreateSchema } from "@/validation/schemas";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ groupId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    const { groupId } = await context.params;
    await consumeRateLimit(`invite-create:${user.id}`, 30, 60 * 60);
    const input = await readJson(request, invitationCreateSchema);
    const invitation = await createInvitation(user, groupId, input);
    return json(invitation, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
