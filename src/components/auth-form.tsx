"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function AuthForm({
  mode,
  action,
  next,
}: {
  mode: "login" | "signup";
  action: Action;
  next: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const isSignup = mode === "signup";

  return (
    <form action={formAction} className="stack" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error ? (
        <div className="alert" role="alert">
          {state.error}
        </div>
      ) : null}

      {isSignup ? (
        <div className="field">
          <label htmlFor="displayName">Your name</label>
          <input
            id="displayName"
            name="displayName"
            autoComplete="name"
            required
            maxLength={60}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            aria-invalid={Boolean(state.fieldErrors?.displayName)}
            aria-describedby={state.fieldErrors?.displayName ? "displayName-error" : undefined}
          />
          {state.fieldErrors?.displayName ? (
            <span className="field-error" id="displayName-error">
              {state.fieldErrors.displayName.join(" ")}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
        />
        {state.fieldErrors?.email ? (
          <span className="field-error" id="email-error">
            {state.fieldErrors.email.join(" ")}
          </span>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
            minLength={isSignup ? 10 : undefined}
            maxLength={200}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(state.fieldErrors?.password)}
            aria-describedby={isSignup ? "password-hint" : undefined}
          />
          <button
            type="button"
            className="button secondary small"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {isSignup ? (
          <span className="field-hint" id="password-hint">
            At least 10 characters. Use a unique password, not one you use elsewhere.
          </span>
        ) : null}
        {state.fieldErrors?.password ? (
          <span className="field-error">{state.fieldErrors.password.join(" ")}</span>
        ) : null}
      </div>

      {isSignup ? (
        <label className="checkbox">
          <input type="checkbox" name="acceptTerms" required />
          <span>
            I accept the <Link href="/terms">terms</Link> and understand the <Link href="/privacy">privacy notice</Link>.
          </span>
        </label>
      ) : null}

      <div className="form-actions">
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Working..." : isSignup ? "Create account" : "Sign in"}
        </button>
        {!isSignup ? (
          <Link href={`/signup${next !== "/groups" ? `?next=${encodeURIComponent(next)}` : ""}`} className="small">
            Create an account
          </Link>
        ) : (
          <Link href={`/login${next !== "/groups" ? `?next=${encodeURIComponent(next)}` : ""}`} className="small">
            I already have an account
          </Link>
        )}
      </div>
    </form>
  );
}
