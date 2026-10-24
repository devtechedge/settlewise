import { and, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { DEMO_EMAIL } from "@/auth/constants";
import { assertSameOrigin } from "@/auth/csrf";
import { limitDemoLogin } from "@/auth/rate-limit";
import { createSession } from "@/auth/session";
import { errorResponse, json } from "@/lib/api";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await limitDemoLogin(request);
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${DEMO_EMAIL}`, isNull(users.disabledAt), isNull(users.anonymizedAt)))
      .limit(1);
    const user = rows[0];
    if (!user) throw new AppError("NOT_FOUND", "The demo account is not available on this deployment.");
    await createSession(user.id, { request });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
