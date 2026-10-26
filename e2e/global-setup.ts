import { spawnSync } from "node:child_process";
import "dotenv/config";

const port = Number(process.env.E2E_PORT ?? "3100");
const baseURL = `http://localhost:${port}`;
const publicRoutes = ["/", "/login", "/signup", "/privacy", "/terms"];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchReady(
  path: string,
  init: RequestInit = {},
  expect?: (response: Response, text: string) => string | null,
) {
  const deadline = Date.now() + 90_000;
  let lastProblem = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseURL + path, { redirect: "manual", ...init });
      const text = await response.text();
      if (response.status >= 500) lastProblem = `${path} responded ${response.status}`;
      else if (expect) {
        const mismatch = expect(response, text);
        if (mismatch) lastProblem = mismatch;
        else return { response, text };
      } else return { response, text };
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : String(error);
    }
    await delay(1500);
  }
  throw new Error(`Browser test readiness failed: ${lastProblem}`);
}

// The first authenticated render is the expensive one: a session lookup, a pool connection, and the
// heaviest ledger pages. Paying for it here keeps a cold-start cost from becoming whichever test
// happens to arrive first.
async function warmAuthenticatedRenders() {
  const login = await fetchReady("/api/auth/demo", { method: "POST", headers: { origin: baseURL } });
  const cookie = (login.response.headers.get("set-cookie") ?? "").split(";")[0];
  if (!cookie) throw new Error("Browser test readiness failed: demo login did not return a session cookie.");
  const headers = { cookie, origin: baseURL };
  await fetchReady("/groups", { headers }, (response, text) =>
    response.status === 200 && text.includes("New group") ? null : `expected the groups page, got ${response.status}`,
  );
  const groupList = await fetchReady("/api/groups", { headers });
  const groupBody = JSON.parse(groupList.text) as { groups: { id: string }[] };
  const firstGroup = groupBody.groups[0];
  if (!firstGroup) throw new Error("Browser test readiness failed: the seeded demo account has no group.");
  for (const path of [`/groups/${firstGroup.id}`, `/groups/${firstGroup.id}/expenses`, `/groups/${firstGroup.id}/settlements`]) {
    await fetchReady(path, { headers });
  }
}

export default async function globalSetup() {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL is required for browser tests.");
  }
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  for (const script of ["db:setup-test", "db:seed:test"]) {
    const result = spawnSync(npm, ["run", script], {
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });
    if (result.status !== 0) throw new Error(`${script} failed with exit code ${result.status}`);
  }
  await fetchReady("/api/health");
  for (const route of publicRoutes) await fetchReady(route);
  await warmAuthenticatedRenders();
}
