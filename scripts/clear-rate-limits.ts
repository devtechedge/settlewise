import "dotenv/config";
const { db } = await import("../src/db/client");
const { rateLimits } = await import("../src/db/schema");
await db.delete(rateLimits);
console.log("local rate-limit buckets cleared");
await db.$client.end();
