import { apiAuth, errorResponse, json } from "@/lib/api";
import { requireGroupRole } from "@/auth/rbac";
import { getParticipantBalances } from "@/repositories/ledger";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ groupId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await apiAuth();
    const { groupId } = await context.params;
    await requireGroupRole(groupId, user.id, "MEMBER");
    const data = await getParticipantBalances(groupId);
    return json(data);
  } catch (error) {
    return errorResponse(error);
  }
}
