import { apiAuth, errorResponse, json, numberParam } from "@/lib/api";
import { listAuditEvents } from "@/services/audit";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ groupId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await apiAuth();
    const { groupId } = await context.params;
    const params = new URL(request.url).searchParams;
    const data = await listAuditEvents(groupId, user.id, {
      page: numberParam(params.get("page"), 1, 1, 10_000),
      pageSize: numberParam(params.get("pageSize"), 30, 1, 100),
      action: params.get("action") ?? undefined,
    });
    return json(data);
  } catch (error) {
    return errorResponse(error);
  }
}
