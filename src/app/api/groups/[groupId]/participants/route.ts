import { apiAuth, errorResponse, json, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { requireGroupRole } from "@/auth/rbac";
import { getParticipantBalances } from "@/repositories/ledger";
import { listMembers, listParticipants } from "@/repositories/groups";
import { addParticipant } from "@/services/groups";
import { participantCreateSchema } from "@/validation/schemas";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ groupId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await apiAuth();
    const { groupId } = await context.params;
    await requireGroupRole(groupId, user.id, "MEMBER");
    const [balances, people, members] = await Promise.all([
      getParticipantBalances(groupId),
      listParticipants(groupId),
      listMembers(groupId),
    ]);
    return json({ participants: people, members, balances: balances.balances, plan: balances.plan });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    const { groupId } = await context.params;
    const input = await readJson(request, participantCreateSchema);
    const participant = await addParticipant(user, groupId, input.displayName);
    return json({ participant }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
