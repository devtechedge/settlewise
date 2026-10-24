import { z } from "zod";
import { apiAuth, errorResponse, json, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { setParticipantStatus } from "@/services/groups";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ groupId: string; participantId: string }> };
const bodySchema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) });

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    const { groupId, participantId } = await context.params;
    const input = await readJson(request, bodySchema);
    await setParticipantStatus(user, groupId, participantId, input.status);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
