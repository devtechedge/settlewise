import { apiAuth, errorResponse, json, numberParam } from "@/lib/api";
import { requireGroupRole } from "@/auth/rbac";
import { getParticipantBalances } from "@/repositories/ledger";
import { listPayments } from "@/repositories/payments";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ groupId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await apiAuth();
    const { groupId } = await context.params;
    const membership = await requireGroupRole(groupId, user.id, "MEMBER");
    const params = new URL(request.url).searchParams;
    const page = numberParam(params.get("page"), 1, 1, 10_000);
    const [data, payments] = await Promise.all([getParticipantBalances(groupId), listPayments(groupId, page, 25)]);
    const names = new Map(data.balances.map((row) => [row.participantId, row.displayName]));
    const linked = data.balances.find((row) => row.userId === user.id);
    return json({
      plan: {
        ...data.plan,
        transfers: data.plan.transfers.map((transfer) => ({
          ...transfer,
          fromName: names.get(transfer.fromParticipantId) ?? "Unknown",
          toName: names.get(transfer.toParticipantId) ?? "Unknown",
        })),
      },
      balances: data.balances,
      payments,
      viewer: { role: membership.role, participantId: linked?.participantId ?? null },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
