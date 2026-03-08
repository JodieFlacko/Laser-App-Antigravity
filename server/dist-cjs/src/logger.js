"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.logError = logError;
const pino_1 = __importDefault(require("pino"));
const node_path_1 = __importDefault(require("node:path"));
const config_js_1 = require("./config.js");
// Use the centralized config for logs directory (in AppData)
const logsDir = config_js_1.config.paths.logs;
// Determine if we're in development mode
const isDevelopment = process.env.NODE_ENV !== "production";
/**
 * Create a Pino logger instance with both console (pretty) and file transports
 */
exports.logger = (0, pino_1.default)({
    level: process.env.LOG_LEVEL || "info",
    transport: isDevelopment
        ? {
            targets: [
                {
                    target: "pino-pretty",
                    level: "info",
                    options: {
                        colorize: true,
                        translateTime: "HH:MM:ss",
                        ignore: "pid,hostname",
                        singleLine: false,
                    },
                },
                {
                    target: "pino/file",
                    level: "info",
                    options: {
                        destination: node_path_1.default.join(logsDir, "app.log"),
                        mkdir: true,
                    },
                },
            ],
        }
        : {
            targets: [
                {
                    target: "pino/file",
                    level: "info",
                    options: {
                        destination: node_path_1.default.join(logsDir, "app.log"),
                        mkdir: true,
                    },
                },
            ],
        },
});
/**
 * Helper to log errors with full context
 * @param error - The error object
 * @param context - Additional context
 */
function logError(error, context) {
    if (error instanceof Error) {
        exports.logger.error({
            ...context,
            err: {
                message: error.message,
                stack: error.stack,
                name: error.name,
            },
        }, error.message);
    }
    else {
        exports.logger.error({ ...context, err: error }, "Unknown error occurred");
    }
}
