import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./db.js";
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ESM shim for __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function runMigrations() {
  // In a Node SEA, __dirname is the directory of the compiled executable
  // (e.g. src-tauri/target/debug/).  SIDECAR_RESOURCES_DIR is injected by
  // Rust and also points there in dev mode, and to the bundled resources dir
  // in production — which is where build-sidecar.mjs copies drizzle/ to.
  // In standalone dev mode (non-SEA), fall back to the source-relative path.
  const migrationsFolder = process.env.SIDECAR_RESOURCES_DIR
    ? join(process.env.SIDECAR_RESOURCES_DIR, 'drizzle')
    : join(__dirname, '../drizzle');

  migrate(db, { migrationsFolder });
}
