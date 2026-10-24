import { apiAuth, errorResponse, json, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { setBudget } from "@/services/groups";
import { budgetSchema } from "@/validation/schemas";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ groupId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    const { groupId } = await context.params;
    const input = await readJson(request, budgetSchema);
    await setBudget(user, groupId, input);
    return json({ ok: true }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
