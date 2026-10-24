import { apiAuth, errorResponse, json, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { recordPayment } from "@/services/payments";
import { paymentCreateSchema } from "@/validation/schemas";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ groupId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    const { groupId } = await context.params;
    const input = await readJson(request, paymentCreateSchema);
    const result = await recordPayment(user, groupId, input);
    return json(result, result.replayed ? 200 : 201);
  } catch (error) {
    return errorResponse(error);
  }
}
