import { z } from "zod";
import { apiAuth, errorResponse, json, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { transferOwnership } from "@/services/groups";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ groupId: string }> };
const bodySchema = z.object({ userId: z.uuid() });

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    const { groupId } = await context.params;
    const input = await readJson(request, bodySchema);
    await transferOwnership(user, groupId, input.userId);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
