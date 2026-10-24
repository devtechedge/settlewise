import { apiAuth, errorResponse, json } from "@/lib/api";
import { defaultReportRange, getReports } from "@/services/reports";
import { isoDateSchema } from "@/validation/schemas";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ groupId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await apiAuth();
    const { groupId } = await context.params;
    const params = new URL(request.url).searchParams;
    const defaults = defaultReportRange();
    const from = params.get("from") ? isoDateSchema.parse(params.get("from")) : defaults.from;
    const to = params.get("to") ? isoDateSchema.parse(params.get("to")) : defaults.to;
    const data = await getReports(groupId, user.id, { from, to });
    return json(data);
  } catch (error) {
    return errorResponse(error);
  }
}
