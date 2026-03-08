"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const migrate_js_1 = require("./migrate.js");
const sync_js_1 = require("./sync.js");
const sourceFromEnv = process.env.SEED_SOURCE;
const sampleDir = node_path_1.default.resolve(process.cwd(), "sample-data");
const resolveSample = (name) => node_path_1.default.join(sampleDir, name);
const preferred = sourceFromEnv === "json"
    ? "sample.json"
    : sourceFromEnv === "xml"
        ? "sample.xml"
        : sourceFromEnv === "csv"
            ? "sample.csv"
            : null;
let source = preferred;
if (!source) {
    const csvPath = resolveSample("sample.csv");
    const xmlPath = resolveSample("sample.xml");
    const jsonPath = resolveSample("sample.json");
    if (node_fs_1.default.existsSync(csvPath)) {
        source = "sample.csv";
    }
    else if (node_fs_1.default.existsSync(xmlPath)) {
        source = "sample.xml";
    }
    else if (node_fs_1.default.existsSync(jsonPath)) {
        source = "sample.json";
    }
    else {
        source = "sample.csv";
    }
}
const feedPath = resolveSample(source);
process.env.FEED_URL = feedPath;
(0, migrate_js_1.runMigrations)();
(0, sync_js_1.syncOrders)()
    .then((result) => {
    console.log("Seed completed:", result);
})
    .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
});
