import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "@/middleware";

function request(path: string, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

describe("route middleware", () => {
  it("redirects protected pages without a session cookie", () => {
    for (const path of ["/groups", "/groups/abc/expenses", "/account", "/settings"]) {
      const response = middleware(request(path));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/login");
    }
  });

  it("passes authenticated requests through", () => {
    const response = middleware(request("/groups", "settlewise_session=test-token"));
    expect(response.status).toBe(200);
  });

  it("does not intercept public pages or APIs", () => {
    expect(middleware(request("/")).status).toBe(200);
    expect(middleware(request("/api/health")).status).toBe(200);
  });
});
