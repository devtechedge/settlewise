import "dotenv/config";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}
process.env.DATABASE_URL = testUrl;
(process.env as Record<string, string>).NODE_ENV = "test";
