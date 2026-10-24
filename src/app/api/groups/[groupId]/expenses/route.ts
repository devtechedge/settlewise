import { apiAuth, errorResponse, json, readJson, numberParam } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { requireGroupRole } from "@/auth/rbac";
import { listExpenses } from "@/repositories/expenses";
import { createExpense } from "@/services/expenses";
import { expenseCreateSchema, isoDateSchema } from "@/validation/schemas";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ groupId: string }> };

function optionalDate(value: string | null, field: string) {
  if (!value) return undefined;
  const parsed = isoDateSchema.safeParse(value);
  if (!parsed.success) throw new Error(`${field} must be a valid date in YYYY-MM-DD format.`);
  return parsed.data;
}

export async function GET(request: Request, context: Context) {
  try {
    const user = await apiAuth();
    const { groupId } = await context.params;
    await requireGroupRole(groupId, user.id, "MEMBER");
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    const result = await listExpenses({
      groupId,
      query: params.get("q") ?? undefined,
      category: params.get("category") ?? undefined,
      payerParticipantId: params.get("payer") ?? undefined,
      from: optionalDate(params.get("from"), "from"),
      to: optionalDate(params.get("to"), "to"),
      status: status === "ACTIVE" || status === "VOID" ? status : undefined,
      page: numberParam(params.get("page"), 1, 1, 10_000),
      pageSize: numberParam(params.get("pageSize"), 25, 1, 100),
    });
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    const { groupId } = await context.params;
    const input = await readJson(request, expenseCreateSchema);
    const result = await createExpense(user, groupId, input);
    return json(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
