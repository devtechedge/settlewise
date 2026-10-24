import "dotenv/config";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
  process.exit(1);
}

const databaseName = new URL(url).pathname.replace(/^\//, "");
const host = new URL(url).hostname;
console.log(`Applying migrations to ${databaseName} on ${host}`);

const pool = new Pool({ connectionString: url, max: 1 });
const db = drizzle(pool);

try {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  console.log("Migrations applied.");
} finally {
  await pool.end();
}
