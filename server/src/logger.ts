import pino from "pino";
import pinoPretty from "pino-pretty";
import path from "node:path";
import fs from "node:fs";
import { Writable } from "node:stream";
import { config } from "./config.js";

// Use the centralized config for logs directory (in AppData)
const logsDir = config.paths.logs;

// Ensure logs directory exists synchronously (config.initializeDirectories also does this,
// but we need it before we open the write stream below)
try { fs.mkdirSync(logsDir, { recursive: true }); } catch { /* already exists */ }

// Determine if we're in development mode
const isDevelopment = process.env.NODE_ENV !== "production";

/**
 * Create a Pino logger instance.
 *
 * WHY no pino `transport`:
 *   Pino's transport option uses `thread-stream`, which spawns a worker thread
 *   to run the transport script.  In a Node.js Single Executable Application
 *   (SEA), worker threads cannot load scripts from the bundled blob — they
 *   resolve paths against the filesystem and crash with:
 *     Error: Cannot find module 'target/debug/lib/worker.js'
 *
 *   Fix: build a synchronous writable stream manually and pass it directly
 *   to pino as its second argument.  No worker threads are ever spawned.
 *
 *   - Dev mode  → pretty-print to stderr (via pino-pretty in stream mode)
 *                 AND append JSON to the log file.
 *   - Production → append JSON to the log file only.
 */

// Open the log file with append flag (creates if missing).
const logFileStream = fs.createWriteStream(
  path.join(logsDir, "app.log"),
  { flags: "a" }
);

let logStream: NodeJS.WritableStream;

if (isDevelopment) {
  // pino-pretty in "stream" mode (not transport mode) writes synchronously to
  // the provided destination — no thread-stream, no worker threads.
  const prettyStream = pinoPretty({
    colorize: true,
    translateTime: "HH:MM:ss",
    ignore: "pid,hostname",
    singleLine: false,
    destination: process.stderr,
    sync: true,
  });

  // Tee: write each log line to both pretty stderr and the log file.
  logStream = new Writable({
    write(chunk: Buffer | string, _enc: BufferEncoding, cb: (err?: Error | null) => void) {
      prettyStream.write(chunk);
      logFileStream.write(chunk);
      cb();
    },
    final(cb: (err?: Error | null) => void) {
      prettyStream.end();
      logFileStream.end();
      cb();
    },
  });
} else {
  // Production (Tauri sidecar): write JSON lines to file only.
  logStream = logFileStream;
}

export const logger = pino(
  { level: process.env.LOG_LEVEL || "info" },
  logStream as any
);

/**
 * Helper to log errors with full context
 * @param error - The error object
 * @param context - Additional context
 */
export function logError(error: unknown, context?: Record<string, unknown>) {
  if (error instanceof Error) {
    logger.error(
      {
        ...context,
        err: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
      },
      error.message
    );
  } else {
    logger.error({ ...context, err: error }, "Unknown error occurred");
  }
}
