"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { isAppError } from "@/lib/errors";
import { loginSchema, signupSchema } from "@/validation/schemas";
import { acceptInvitation } from "./invitations";
import { hashPassword, verifyPassword } from "./password";
import { limitLogin, limitSignup } from "./rate-limit";
import { clearSessionCookie, createSession, getCurrentAuth, revokeSession } from "./session";
import { safeNextPath } from "./page-auth";
import type { FormState } from "./form-state";


function flatten(error: { flatten(): { fieldErrors: Record<string, string[]> } }) {
  return error.flatten().fieldErrors;
}

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: flatten(parsed.error) };
  if (formData.get("acceptTerms") !== "on") {
    return { error: "Accept the terms and privacy notice to create an account." };
  }

  let userId: string;
  try {
    const requestHeaders = await headers();
    await limitSignup({ headers: requestHeaders });
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${parsed.data.email}`)
      .limit(1);
    if (existing[0]) {
      return { error: "That email is already registered. Sign in instead." };
    }
    const passwordHash = await hashPassword(parsed.data.password);
    const inserted = await db
      .insert(users)
      .values({
        email: parsed.data.email,
        displayName: parsed.data.displayName,
        passwordHash,
      })
      .returning({ id: users.id });
    userId = inserted[0]?.id ?? "";
    if (!userId) return { error: "Account could not be created. Try again." };
  } catch (error) {
    if (isAppError(error)) return { error: error.message };
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      return { error: "That email is already registered. Sign in instead." };
    }
    return { error: "Account could not be created. Try again." };
  }

  await createSession(userId, { userAgent: (await headers()).get("user-agent") });
  redirect(safeNextPath(formData.get("next")?.toString()));
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: flatten(parsed.error) };

  try {
    const requestHeaders = await headers();
    await limitLogin({ headers: requestHeaders }, parsed.data.email);
    const rows = await db
      .select()
      .from(users)
      .where(and(sql`lower(${users.email}) = ${parsed.data.email}`, isNull(users.disabledAt), isNull(users.anonymizedAt)))
      .limit(1);
    const user = rows[0];
    const valid = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
    if (!user || !valid) {
      return { error: "Email or password is incorrect." };
    }
    await createSession(user.id, { userAgent: requestHeaders.get("user-agent") });
  } catch (error) {
    if (isAppError(error)) return { error: error.message };
    console.error("login action failed", error instanceof Error ? error.name : "unknown error");
    return { error: "Sign in failed. Try again." };
  }
  redirect(safeNextPath(formData.get("next")?.toString()));
}

export async function logoutAction() {
  const auth = await getCurrentAuth();
  if (auth) await revokeSession(auth.sessionId, auth.user.id);
  await clearSessionCookie();
  redirect("/");
}

export async function acceptInviteAction(token: string): Promise<void> {
  const auth = await getCurrentAuth();
  if (!auth) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  try {
    const requestHeaders = await headers();
    const { limitInvitationAccept } = await import("./rate-limit");
    await limitInvitationAccept({ headers: requestHeaders });
    const result = await acceptInvitation(token, auth.user);
    redirect(`/groups/${result.groupId}`);
  } catch (error) {
    if (isAppError(error)) redirect(`/invite/${token}?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
}
