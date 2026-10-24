import { apiAuth, errorResponse, json, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { reversePayment } from "@/services/payments";
import { paymentReversalSchema } from "@/validation/schemas";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    const { id } = await context.params;
    const input = await readJson(request, paymentReversalSchema);
    const result = await reversePayment(user, id, input);
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
