import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { config } from "./config.js";

// Use the centralized config for database path (in AppData)
const dbPath = config.paths.db;

const sqlite = new Database(dbPath);

// WAL mode for optimal concurrent read/write performance on Windows NTFS
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite);
