import { apiAuth, errorResponse, json, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { resolveExpenseAccess, voidExpense } from "@/services/expenses";
import { voidExpenseSchema } from "@/validation/schemas";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ expenseId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    const { expenseId } = await context.params;
    const access = await resolveExpenseAccess(expenseId, user.id);
    const input = await readJson(request, voidExpenseSchema);
    const result = await voidExpense(user, access.groupId, expenseId, input);
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
