import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./db.js";
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import fs from 'node:fs';

// ESM shim for __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function runMigrations() {
  // In a Node SEA, __dirname is the directory of the compiled executable
  // (e.g. src-tauri/target/debug/).  SIDECAR_RESOURCES_DIR is injected by
  // Rust and also points there in dev mode, and to the bundled resources dir
  // in production — which is where build-sidecar.mjs copies drizzle/ to.
  // In standalone dev mode (non-SEA), fall back to the source-relative path.
  let migrationsFolder: string;
  if (process.env.SIDECAR_RESOURCES_DIR) {
    const rootPath = join(process.env.SIDECAR_RESOURCES_DIR, 'drizzle');
    const nestedPath = join(process.env.SIDECAR_RESOURCES_DIR, 'resources', 'drizzle');

    // In release mode, Tauri unpacks assets into a `resources/` subfolder.
    if (fs.existsSync(nestedPath)) {
      migrationsFolder = nestedPath;
    } else {
      migrationsFolder = rootPath; // dev mode behavior
    }
  } else {
    migrationsFolder = join(__dirname, '../drizzle');
  }

  migrate(db, { migrationsFolder });
}
