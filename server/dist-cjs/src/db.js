"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const better_sqlite3_2 = require("drizzle-orm/better-sqlite3");
const config_js_1 = require("./config.js");
// Use the centralized config for database path (in AppData)
const dbPath = config_js_1.config.paths.db;
const sqlite = new better_sqlite3_1.default(dbPath);
// WAL mode for optimal concurrent read/write performance on Windows NTFS
sqlite.pragma('journal_mode = WAL');
exports.db = (0, better_sqlite3_2.drizzle)(sqlite);
