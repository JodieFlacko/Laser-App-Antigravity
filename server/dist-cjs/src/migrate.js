"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const migrator_1 = require("drizzle-orm/better-sqlite3/migrator");
const db_js_1 = require("./db.js");
const node_url_1 = require("node:url");
const node_path_1 = require("node:path");
// ESM shim for __filename and __dirname
const __filename = (0, node_url_1.fileURLToPath)(import.meta.url);
const __dirname = (0, node_path_1.dirname)(__filename);
function runMigrations() {
    (0, migrator_1.migrate)(db_js_1.db, { migrationsFolder: (0, node_path_1.join)(__dirname, '../drizzle') });
}
