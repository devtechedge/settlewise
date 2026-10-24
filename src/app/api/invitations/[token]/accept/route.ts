import { apiAuth, errorResponse, json } from "@/lib/api";
import { acceptInvitation } from "@/auth/invitations";
import { assertSameOrigin } from "@/auth/csrf";
import { limitInvitationAccept } from "@/auth/rate-limit";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    await limitInvitationAccept(request);
    const { token } = await context.params;
    const result = await acceptInvitation(token, user);
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
