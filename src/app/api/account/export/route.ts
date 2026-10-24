import { apiAuth, errorResponse } from "@/lib/api";
import { exportAccountData } from "@/services/account";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await apiAuth();
    const data = await exportAccountData(user.id);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="settlewise-account-${new Date().toISOString().slice(0, 10)}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
