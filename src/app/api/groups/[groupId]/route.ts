import { z } from "zod";
import { apiAuth, errorResponse, json, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { getGroupOverview, deleteGroup, setGroupArchived } from "@/services/groups";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ groupId: string }> };
const patchSchema = z.object({ archived: z.boolean() });
const deleteSchema = z.object({ confirmation: z.string().min(1).max(80) });

export async function GET(_request: Request, context: Context) {
  try {
    const user = await apiAuth();
    const { groupId } = await context.params;
    const overview = await getGroupOverview(groupId, user.id);
    return json(overview);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    const { groupId } = await context.params;
    const input = await readJson(request, patchSchema);
    await setGroupArchived(user, groupId, input.archived);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    const { groupId } = await context.params;
    const input = await readJson(request, deleteSchema);
    await deleteGroup(user, groupId, input.confirmation);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
