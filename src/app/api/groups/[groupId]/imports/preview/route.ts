import { apiAuth, errorResponse, json, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { consumeRateLimit } from "@/auth/rate-limit";
import { createImportBatch, previewImportMapping } from "@/services/imports";
import { importPreviewMappingSchema } from "@/validation/schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ groupId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    const { groupId } = await context.params;
    await consumeRateLimit(`import-preview:${user.id}`, 60, 60 * 60);
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return json({ error: { code: "VALIDATION_ERROR", message: "Attach a CSV file." } }, 400);
      }
      const result = await createImportBatch(user, groupId, file);
      return json(result, 201);
    }
    const body = await readJson(request, importPreviewMappingSchema);
    const result = await previewImportMapping(user, groupId, body.batchId, body.mapping);
    if (!result.ok) {
      return json({ error: { code: "VALIDATION_ERROR", message: result.error } }, 400);
    }
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
