import "dotenv/config";
import { sql } from "drizzle-orm";
const { db } = await import("../src/db/client");
const { users } = await import("../src/db/schema");
const { verifyPassword } = await import("../src/auth/password");
const { consumeRateLimit } = await import("../src/auth/rate-limit");
const rows = await db.select().from(users).where(sql`lower(${users.email}) = 'maya@settlewise.demo'`).limit(1);
console.log("user found", rows.length, rows[0]?.email);
if (rows[0]) {
  console.log("hash prefix", rows[0].passwordHash.slice(0, 30));
  console.log("verify", await verifyPassword("settlewise-demo-2026", rows[0].passwordHash));
}
try {
  const result = await consumeRateLimit("debug:test", 100, 60);
  console.log("rate limit ok", result);
} catch (error) {
  console.error("rate limit error", error);
}
await db.$client.end();
