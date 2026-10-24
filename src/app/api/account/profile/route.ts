import { apiAuth, errorResponse, json, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/auth/csrf";
import { consumeRateLimit } from "@/auth/rate-limit";
import { updateProfile } from "@/services/account";
import { profileUpdateSchema } from "@/validation/schemas";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiAuth();
    await consumeRateLimit(`profile-update:${user.id}`, 30, 60 * 60);
    const input = await readJson(request, profileUpdateSchema);
    await updateProfile(user.id, input.displayName);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
