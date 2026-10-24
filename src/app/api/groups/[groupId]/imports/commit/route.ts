import { apiAuth, errorResponse, json, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { consumeRateLimit } from "@/auth/rate-limit";
import { commitImport } from "@/services/imports";
import { importCommitSchema } from "@/validation/schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ groupId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    const { groupId } = await context.params;
    await consumeRateLimit(`import-commit:${user.id}`, 20, 60 * 60);
    const input = await readJson(request, importCommitSchema);
    const result = await commitImport(user, groupId, input.batchId);
    return json(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
