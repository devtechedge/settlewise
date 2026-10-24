import { apiAuth, errorResponse } from "@/lib/api";
import { exportGroupCsv, type ExportType } from "@/services/exports";
import { isoDateSchema } from "@/validation/schemas";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ groupId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await apiAuth();
    const { groupId } = await context.params;
    const params = new URL(request.url).searchParams;
    const typeRaw = params.get("type") ?? "expenses";
    if (typeRaw !== "expenses" && typeRaw !== "settlements" && typeRaw !== "audit") {
      return Response.json({ error: { code: "VALIDATION_ERROR", message: "Choose a supported export type." } }, { status: 400 });
    }
    const from = params.get("from") ? isoDateSchema.parse(params.get("from")) : undefined;
    const to = params.get("to") ? isoDateSchema.parse(params.get("to")) : undefined;
    const result = await exportGroupCsv(user, groupId, typeRaw as ExportType, { from, to });
    return new Response(result.csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${result.filename.replace(/"/g, "")}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
