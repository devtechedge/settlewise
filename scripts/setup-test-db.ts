import "dotenv/config";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error("TEST_DATABASE_URL is required.");
  process.exit(1);
}

const parsed = new URL(testUrl);
const databaseName = parsed.pathname.replace(/^\//, "");
if (!databaseName.includes("test")) {
  console.error(`Refusing to reset database "${databaseName}": the name must contain "test".`);
  process.exit(1);
}

async function ensureDatabaseExists() {
  const adminUrl = new URL(testUrl as string);
  adminUrl.pathname = "/postgres";
  const client = new Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
    const exists = await client.query("select 1 from pg_database where datname = $1", [databaseName]);
    if (exists.rowCount === 0) {
      await client.query(`create database "${databaseName.replaceAll('"', '""')}"`);
      console.log(`Created test database ${databaseName}.`);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

await ensureDatabaseExists();

const pool = new Pool({ connectionString: testUrl, max: 1 });
try {
  await pool.query("drop schema if exists public cascade");
  await pool.query("create schema public");
  await pool.query("drop schema if exists drizzle cascade");
  console.log(`Reset schema in ${databaseName}.`);
  const db = drizzle(pool);
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  console.log("Test database is migrated and empty.");
} finally {
  await pool.end();
}
