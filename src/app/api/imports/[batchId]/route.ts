import { apiAuth, errorResponse, json, numberParam } from "@/lib/api";
import { getImportBatch, resolveImportBatchGroup } from "@/services/imports";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ batchId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await apiAuth();
    const { batchId } = await context.params;
    const access = await resolveImportBatchGroup(batchId, user.id);
    const params = new URL(request.url).searchParams;
    const data = await getImportBatch(
      access.groupId,
      batchId,
      user,
      numberParam(params.get("page"), 1, 1, 10_000),
      params.get("status") ?? undefined,
    );
    return json(data);
  } catch (error) {
    return errorResponse(error);
  }
}
