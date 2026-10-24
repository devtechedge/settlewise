import { apiAuth, errorResponse, json, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { getExpenseDetail } from "@/repositories/expenses";
import { resolveExpenseAccess, updateExpense } from "@/services/expenses";
import { expenseUpdateSchema } from "@/validation/schemas";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ expenseId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await apiAuth();
    const { expenseId } = await context.params;
    const access = await resolveExpenseAccess(expenseId, user.id);
    const detail = await getExpenseDetail(access.groupId, expenseId);
    if (!detail) throw new Error("Expense not found.");
    return json({ ...detail, membership: access.membership });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    const { expenseId } = await context.params;
    const access = await resolveExpenseAccess(expenseId, user.id);
    const input = await readJson(request, expenseUpdateSchema);
    const result = await updateExpense(user, access.groupId, expenseId, input);
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
