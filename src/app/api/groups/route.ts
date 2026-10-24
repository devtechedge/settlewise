import { apiAuth, errorResponse, json, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { consumeRateLimit } from "@/auth/rate-limit";
import { listGroupsForUser } from "@/repositories/groups";
import { createGroup } from "@/services/groups";
import { groupCreateSchema } from "@/validation/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await apiAuth();
    const groups = await listGroupsForUser(user.id);
    return json({ groups });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    await consumeRateLimit(`group-create:${user.id}`, 20, 60 * 60);
    const input = await readJson(request, groupCreateSchema);
    const result = await createGroup(user, input);
    return json(
      {
        group: result.group,
        invitations: result.invites.map((invite) => ({
          email: invite.email,
          role: invite.role,
          token: invite.token,
          expiresAt: invite.expiresAt,
        })),
      },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
