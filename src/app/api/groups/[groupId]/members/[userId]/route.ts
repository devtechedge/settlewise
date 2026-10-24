import { z } from "zod";
import { apiAuth, errorResponse, json, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { changeMemberRole, removeMember } from "@/services/groups";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ groupId: string; userId: string }> };
const bodySchema = z.object({ role: z.enum(["EDITOR", "MEMBER"]) });

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    const { groupId, userId } = await context.params;
    const input = await readJson(request, bodySchema);
    await changeMemberRole(user, groupId, userId, input.role);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    const { groupId, userId } = await context.params;
    await removeMember(user, groupId, userId);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
