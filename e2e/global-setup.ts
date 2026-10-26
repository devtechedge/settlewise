import { spawnSync } from "node:child_process";
import "dotenv/config";

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
}
